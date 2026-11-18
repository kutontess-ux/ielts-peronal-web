import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase-server";
import { consumeAiQuota } from "@/lib/ai-quota";
import { askJson, parseRequestedWordCount, TOPICS, type Enriched } from "@/lib/ai";
import { normKey } from "@/lib/normalize";

export const maxDuration = 120;

type AgentItem = Omit<Enriched, "input" | "valid">;

function buildAgentSystem(batchCount: number, excludeLemmas: string[]) {
  const excludeNote =
    excludeLemmas.length > 0
      ? `\n- TUYỆT ĐỐI KHÔNG lặp lại các từ sau: ${excludeLemmas.join(", ")}.`
      : "";

  return `Bạn là trợ lý từ vựng IELTS Academic cho người Việt trình độ B1 hướng tới band 6.5 (và nâng dần lên 7.0).
Nhiệm vụ: Dựa theo yêu cầu của người dùng, tìm ĐÚNG ${batchCount} từ vựng / cụm từ tiếng Anh phù hợp nhất.
QUAN TRỌNG: Mảng "items" BẮT BUỘC phải có đủ ${batchCount} phần tử khác nhau (không dừng sớm).

QUY TẮC BẮT BUỘC:
- Ưu tiên các từ vựng học thuật giá trị cao cho IELTS (B2-C1), tránh các từ quá phổ biến hoặc cơ bản (A1-A2).
- Không trùng lặp giữa các từ trả về.${excludeNote}
- lemma: dạng gốc, chữ thường (hoặc cụm từ cố định).
- ipa: phiên âm IPA Anh-Anh có dấu gạch chéo.
- pos: một trong n, v, adj, adv, phr.
- meaning_vi: nghĩa tiếng Việt ngắn gọn (<= 8 từ).
- definition_en: định nghĩa tiếng Anh đơn giản (<= 20 từ).
- example: 1 câu ví dụ IELTS Academic tự nhiên.
- cefr_level: A2, B1, B2, C1 hoặc C2.
- topic: chọn đúng 1 trong: ${TOPICS.join(", ")}.
- is_awl: true nếu thuộc Academic Word List của Coxhead.
- collocations: tối đa 3 cụm. synonyms: tối đa 3 từ.
Trả về JSON dạng {"items":[...]}.`;
}

// Agent tìm từ vựng bổ sung vào Bộ sách cộng đồng (chỉ Admin)
export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const { prompt } = (await req.json()) as { prompt: string };
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Hãy nhập yêu cầu tìm từ cho Agent" }, { status: 400 });
    }

    const quotaErr = await consumeAiQuota(ctx, "agent-find");
    if (quotaErr) return quotaErr;

    const cleanPrompt = prompt.trim().slice(0, 1000);
    const { targetCount } = parseRequestedWordCount(cleanPrompt, 15, 60);

    const seenInRun = new Set<string>();
    const excludeLemmas: string[] = [];
    const items: Array<AgentItem & { lemma: string; norm_key: string }> = [];
    let skippedDup = 0;

    const MAX_PER_CALL = 30;
    for (let pass = 0; pass < 5 && items.length < targetCount; pass++) {
      const remaining = targetCount - items.length;
      const batchCount = Math.min(MAX_PER_CALL, remaining + 5);

      const res = await askJson<{ items: AgentItem[] }>(
        buildAgentSystem(batchCount, excludeLemmas),
        `${cleanPrompt}\n\n(Lượt này hãy trả đúng ${batchCount} từ/cụm từ hoàn toàn mới, không trùng các từ đã liệt kê.)`
      );

      const rawBatch = (res.items ?? []).filter((i) => i.lemma);
      if (rawBatch.length === 0) break;

      const lemKeys = Array.from(
        new Set(rawBatch.map((i) => normKey(String(i.lemma ?? ""))).filter(Boolean))
      );
      const { data: existingRows } = lemKeys.length
        ? await ctx.db
            .from("words")
            .select("norm_key")
            .in("norm_key", lemKeys)
            .like("source", "book-%")
        : { data: [] as { norm_key: string }[] };
      const existingDbKeys = new Set<string>((existingRows ?? []).map((r) => r.norm_key as string));

      let addedThisPass = 0;
      let skippedThisPass = 0;
      for (const item of rawBatch) {
        if (items.length >= targetCount) break;
        const lemma = item.lemma.toLowerCase().trim();
        const k = normKey(lemma);
        if (!k || seenInRun.has(k)) continue;
        seenInRun.add(k);
        excludeLemmas.push(lemma);

        if (existingDbKeys.has(k)) {
          skippedDup++;
          skippedThisPass++;
          continue;
        }
        items.push({ ...item, lemma, norm_key: k });
        addedThisPass++;
      }

      if (addedThisPass === 0 && skippedThisPass === 0) break;
    }

    return NextResponse.json({ items, skippedDup });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
