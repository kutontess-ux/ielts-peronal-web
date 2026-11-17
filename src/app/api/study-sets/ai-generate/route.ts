import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { consumeAiQuota } from "@/lib/ai-quota";
import { askJson, TOPICS, type Enriched } from "@/lib/ai";
import { normKey } from "@/lib/normalize";

export const maxDuration = 120;

type AiCardItem = Omit<Enriched, "input" | "valid">;

type AiGenerateResponse = {
  suggested_title?: string;
  suggested_desc?: string;
  items?: AiCardItem[];
};

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

    const system = `Bạn là trợ lý thiết kế học phần Flashcard IELTS Academic cho người Việt (trình độ B1 → band 6.5–7.5+).
Nhiệm vụ: Đọc kỹ yêu cầu của người dùng, hiểu đúng mục tiêu học (chủ đề, kỹ năng Speaking/Writing/Reading, cấp độ CEFR, số lượng từ, cụm collocation hoặc từ đơn), rồi tạo một bộ flashcard chất lượng cao.
Nếu người dùng không nói rõ số lượng, chọn 12–15 từ/cụm từ giá trị nhất (tối đa 30).

QUY TẮC BẮT BUỘC:
- suggested_title: Tên học phần ngắn gọn, rõ ràng bằng tiếng Việt hoặc song ngữ (<= 60 ký tự).
- suggested_desc: Mô tả ngắn về mục tiêu học phần (<= 100 ký tự).
- items: mảng các thẻ từ vựng không trùng nhau, mỗi item gồm:
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

    const res = await askJson<AiGenerateResponse>(system, cleanPrompt.slice(0, 1200));

    const lemKeys = Array.from(
      new Set((res.items ?? []).map((r) => normKey(String(r.lemma ?? ""))).filter(Boolean))
    );
    const { data: existingRows, error: dbErr } = lemKeys.length
      ? await ctx.db.from("words").select("id,norm_key").in("norm_key", lemKeys)
      : { data: [], error: null };
    if (dbErr) throw new Error(dbErr.message);

    const existingMap = new Map<string, number>();
    for (const r of existingRows ?? []) {
      if (r.norm_key) existingMap.set(r.norm_key as string, Number(r.id));
    }

    const seen = new Set<string>();
    const items = [];
    for (const raw of res.items ?? []) {
      if (!raw.lemma) continue;
      const lemma = raw.lemma.toLowerCase().trim();
      const k = normKey(lemma);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      items.push({
        ...raw,
        lemma,
        norm_key: k,
        existingId: existingMap.get(k) ?? null,
      });
    }

    return NextResponse.json({
      suggestedTitle: (res.suggested_title ?? "").trim(),
      suggestedDesc: (res.suggested_desc ?? "").trim(),
      items,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
