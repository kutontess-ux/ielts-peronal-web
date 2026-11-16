import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { askJson, TOPICS, type Enriched } from "@/lib/ai";
import { normKey } from "@/lib/normalize";

export const maxDuration = 120;

type AgentItem = Omit<Enriched, "input" | "valid">;

// Agent tìm từ vựng theo yêu cầu tự nhiên của người dùng, chống trùng kho hiện có, trả về danh sách duyệt
export async function POST(req: Request) {
  try {
    const { prompt } = (await req.json()) as { prompt: string };
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Hãy nhập yêu cầu tìm từ cho Agent" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: existingRows } = await db.from("words").select("lemma,norm_key");
    const haveKeys = new Set((existingRows ?? []).map((r) => r.norm_key as string));
    const excludeList = (existingRows ?? []).map((r) => r.lemma as string).slice(0, 600);

    const system = `Bạn là trợ lý từ vựng IELTS Academic cho người Việt trình độ B1 hướng tới band 6.5 (và nâng dần lên 7.0).
Nhiệm vụ: Dựa theo yêu cầu của người dùng, tìm các từ vựng / cụm từ tiếng Anh phù hợp nhất (nếu người dùng không nêu số lượng thì chọn 15–20 từ; tối đa 35 từ).

QUY TẮC BẮT BUỘC:
- Không được trùng với bất kỳ từ nào đã có trong kho: ${JSON.stringify(excludeList)}.
- Không trùng lặp giữa các từ trả về.
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

    const res = await askJson<{ items: AgentItem[] }>(system, prompt.trim().slice(0, 1000));

    const items = [];
    const seen = new Set<string>(haveKeys);
    let skippedDup = 0;

    for (const item of res.items ?? []) {
      if (!item.lemma) continue;
      const lemma = item.lemma.toLowerCase().trim();
      const k = normKey(lemma);
      if (seen.has(k)) {
        skippedDup++;
        continue;
      }
      seen.add(k);
      items.push({
        ...item,
        lemma,
        norm_key: k,
      });
    }

    return NextResponse.json({ items, skippedDup });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
