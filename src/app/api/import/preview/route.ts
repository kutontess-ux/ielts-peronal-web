import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { consumeAiQuota } from "@/lib/ai-quota";
import { enrich, extractFromPassage } from "@/lib/ai";
import { cleanTerm, normKey, splitInput } from "@/lib/normalize";

export const maxDuration = 120;

// Bước 1: agent xử lý – KHÔNG ghi database. Chỉ tính quota AI khi thực sự phải gọi AI.
export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;
    const db = ctx.db;

    const { text } = (await req.json()) as { text: string };
    if (!text?.trim()) return NextResponse.json({ error: "Chưa có nội dung" }, { status: 400 });

    const { terms, passage } = splitInput(text);
    const candidatesRaw = [...terms];
    if (passage) {
      const quotaErr = await consumeAiQuota(ctx, "import-passage");
      if (quotaErr) return quotaErr;
      candidatesRaw.push(...(await extractFromPassage(passage)).map(cleanTerm));
    }

    // 1) loại trùng ngay trong danh sách vừa dán
    const seenInput = new Set<string>();
    const inputDup: string[] = [];
    const candidates = candidatesRaw.filter((c) => {
      if (!c) return false;
      if (seenInput.has(c)) {
        inputDup.push(c);
        return false;
      }
      seenInput.add(c);
      return true;
    });
    if (candidates.length === 0) return NextResponse.json({ error: "Không tìm thấy từ nào" }, { status: 400 });
    if (candidates.length > 300) return NextResponse.json({ error: "Tối đa 300 từ mỗi lần nạp, hãy chia nhỏ." }, { status: 400 });

    // 2) bỏ qua AI cho từ đã có trong kho (so khớp nhanh theo khoá chuẩn hoá của chính từ nhập)
    const keys = candidates.map(normKey);
    const { data: existing } = await db.from("words").select("id,norm_key,lemma").in("norm_key", keys);
    const haveMap = new Map<string, { id: number; lemma: string }>();
    for (const r of existing ?? []) {
      haveMap.set(r.norm_key as string, { id: Number(r.id), lemma: String(r.lemma) });
    }

    const toEnrich = candidates.filter((_, i) => !haveMap.has(keys[i]));
    if (toEnrich.length > 0 && !passage) {
      const quotaErr = await consumeAiQuota(ctx, "import-enrich");
      if (quotaErr) return quotaErr;
    }

    const enriched = toEnrich.length ? await enrich(toEnrich) : [];

    // 3) kiểm tra lại trùng theo lemma do AI trả về (vd "analysed" -> "analyse")
    const lemKeys = enriched.filter((e) => e.valid).map((e) => normKey(e.lemma));
    const { data: existing2 } = lemKeys.length
      ? await db.from("words").select("id,norm_key,lemma").in("norm_key", lemKeys)
      : { data: [] as { id: number; norm_key: string; lemma: string }[] };
    for (const r of existing2 ?? []) {
      haveMap.set(r.norm_key as string, { id: Number(r.id), lemma: String(r.lemma) });
    }

    const seenLemma = new Set<string>();
    const existingWordIds = new Set<number>();
    const items = enriched.map((e) => {
      if (!e.valid || !e.lemma) return { ...e, status: "invalid" as const };
      const k = normKey(e.lemma);
      const match = haveMap.get(k);
      if (match) {
        existingWordIds.add(match.id);
        return { ...e, norm_key: k, existingId: match.id, status: "duplicate" as const };
      }
      if (seenLemma.has(k)) return { ...e, norm_key: k, status: "duplicate" as const };
      seenLemma.add(k);
      return { ...e, norm_key: k, status: "new" as const };
    });

    candidates.forEach((c, i) => {
      const match = haveMap.get(keys[i]);
      if (match) {
        existingWordIds.add(match.id);
        items.push({
          input: c,
          lemma: match.lemma,
          norm_key: keys[i],
          existingId: match.id,
          status: "duplicate",
        } as never);
      }
    });
    inputDup.forEach((c) => items.push({ input: c, lemma: c, status: "duplicate" } as never));

    return NextResponse.json({
      items,
      existingIds: Array.from(existingWordIds),
      summary: {
        total: candidates.length + inputDup.length,
        new: items.filter((i) => i.status === "new").length,
        duplicate: items.filter((i) => i.status === "duplicate").length,
        invalid: items.filter((i) => i.status === "invalid").length,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
