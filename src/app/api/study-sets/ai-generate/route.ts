import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { consumeAiQuota } from "@/lib/ai-quota";
import { askJson, parseRequestedWordCount, TOPICS, type Enriched } from "@/lib/ai";
import { normKey } from "@/lib/normalize";

export const maxDuration = 120;

type AiCardItem = Omit<Enriched, "input" | "valid">;

type AiGenerateResponse = {
  suggested_title?: string;
  suggested_desc?: string;
  items?: AiCardItem[];
};

function buildSystemPrompt(batchCount: number, excludeLemmas: string[], includeMeta: boolean) {
  const excludeNote =
    excludeLemmas.length > 0
      ? `\n- TUYỆT ĐỐI KHÔNG lặp lại các từ đã có sau đây: ${excludeLemmas.join(", ")}.`
      : "";
  const metaRule = includeMeta
    ? `- suggested_title: Tên học phần ngắn gọn, rõ ràng bằng tiếng Việt hoặc song ngữ (<= 60 ký tự).\n- suggested_desc: Mô tả ngắn về mục tiêu học phần (<= 100 ký tự).`
    : `- suggested_title & suggested_desc: giữ chuỗi rỗng "".`;

  return `Bạn là trợ lý thiết kế học phần Flashcard IELTS Academic cho người Việt (trình độ B1 → band 6.5–7.5+).
Nhiệm vụ: Đọc kỹ yêu cầu của người dùng, hiểu đúng mục tiêu học (chủ đề, kỹ năng Speaking/Writing/Reading, cấp độ CEFR, cụm collocation hoặc từ đơn), rồi tạo ĐÚNG ${batchCount} flashcard chất lượng cao.
QUAN TRỌNG: Mảng "items" BẮT BUỘC phải có đủ ${batchCount} phần tử khác nhau (không dừng sớm ở 10–12 từ).

QUY TẮC BẮT BUỘC:
${metaRule}
- items: đúng ${batchCount} thẻ từ vựng không trùng nhau${excludeNote}, mỗi item gồm:
  - lemma: từ hoặc cụm từ tiếng Anh dạng gốc, chữ thường (vd: "mitigate", "carbon footprint").
  - ipa: phiên âm IPA Anh-Anh có dấu gạch chéo.
  - pos: một trong n, v, adj, adv, phr, prep, conj.
  - meaning_vi: nghĩa tiếng Việt ngắn gọn, tự nhiên (<= 8 từ).
  - definition_en: định nghĩa tiếng Anh dễ hiểu (<= 20 từ).
  - example: 1 câu ví dụ tiếng Anh tự nhiên đúng ngữ cảnh IELTS.
  - cefr_level: A2, B1, B2, C1 hoặc C2.
  - topic: chọn đúng 1 trong: ${TOPICS.join(", ")}.
  - is_awl: true nếu thuộc Academic Word List.
  - collocations: tối đa 3 cụm từ hay đi kèm.
  - synonyms: tối đa 3 từ đồng nghĩa.
Trả về JSON dạng {"suggested_title":"...","suggested_desc":"...","items":[...]}.`;
}

// AI phân tích nhu cầu người dùng, gợi ý tên học phần & tạo danh sách flashcard IELTS chi tiết
export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const { prompt } = (await req.json()) as { prompt?: string };
    const cleanPrompt = prompt?.trim();
    if (!cleanPrompt) {
      return NextResponse.json({ error: "Hãy mô tả chủ đề hoặc loại từ vựng bạn muốn AI tạo" }, { status: 400 });
    }

    const quotaErr = await consumeAiQuota(ctx, "study-set-ai");
    if (quotaErr) return quotaErr;

    const { targetCount } = parseRequestedWordCount(cleanPrompt, 15, 60);

    const seen = new Set<string>();
    const collected: Array<AiCardItem & { lemma: string; norm_key: string }> = [];
    let suggestedTitle = "";
    let suggestedDesc = "";

    // Chia nhỏ tối đa 30 từ/lượt (xin dư nhẹ +5 để bù phần AI bỏ sót hoặc trùng giữa các lượt, tối đa 5 lượt)
    const MAX_PER_CALL = 30;
    for (let pass = 0; pass < 5 && collected.length < targetCount; pass++) {
      const remaining = targetCount - collected.length;
      const batchCount = Math.min(MAX_PER_CALL, remaining + 5);
      const excludeLemmas = collected.map((c) => c.lemma);

      const res = await askJson<AiGenerateResponse>(
        buildSystemPrompt(batchCount, excludeLemmas, pass === 0),
        `${cleanPrompt.slice(0, 1200)}\n\n(Lượt này hãy trả đúng ${batchCount} từ/cụm từ hoàn toàn mới, không trùng các từ đã liệt kê.)`
      );

      if (pass === 0) {
        suggestedTitle = (res.suggested_title ?? "").trim();
        suggestedDesc = (res.suggested_desc ?? "").trim();
      }

      let addedThisPass = 0;
      for (const raw of res.items ?? []) {
        if (collected.length >= targetCount) break;
        if (!raw.lemma) continue;
        const lemma = raw.lemma.toLowerCase().trim();
        const k = normKey(lemma);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        collected.push({ ...raw, lemma, norm_key: k });
        addedThisPass++;
      }

      if (addedThisPass === 0) break;
    }

    const lemKeys = collected.map((c) => c.norm_key);
    const { data: existingRows, error: dbErr } = lemKeys.length
      ? await ctx.db.from("words").select("id,norm_key").in("norm_key", lemKeys)
      : { data: [], error: null };
    if (dbErr) throw new Error(dbErr.message);

    const existingMap = new Map<string, number>();
    for (const r of existingRows ?? []) {
      if (r.norm_key) existingMap.set(r.norm_key as string, Number(r.id));
    }

    const items = collected.map((c) => ({
      ...c,
      existingId: existingMap.get(c.norm_key) ?? null,
    }));

    return NextResponse.json({
      suggestedTitle,
      suggestedDesc,
      items,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
