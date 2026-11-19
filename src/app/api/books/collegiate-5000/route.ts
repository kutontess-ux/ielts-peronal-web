import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase-server";
import { consumeAiQuota } from "@/lib/ai-quota";
import { enrich } from "@/lib/ai";
import { normKey } from "@/lib/normalize";
import collegiate5000 from "@/data/collegiate-5000.json";

export const maxDuration = 120;

type Entry = { word: string; pos: string; def_en: string };
const WORD_LIST = collegiate5000 as Entry[];
const BOOK_ID = "book-5000";

// Nạp từng đợt từ danh sách 5000 Collegiate Words (chuẩn bị sẵn cho 2 key Gemini free)
export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;
    const db = ctx.db;

    const body = (await req.json().catch(() => ({}))) as { count?: number };
    // Hỗ trợ nạp tối đa 200 từ/lượt khi đã gắn key trả phí
    const count = Math.min(200, Math.max(10, body.count ?? 150));

    // 1. Quét các từ đã có trong bất kỳ bộ sách (book-*) nào để không nạp trùng
    const haveBookKeys = new Set<string>();
    const allKeys = WORD_LIST.map((x) => normKey(x.word));
    for (let i = 0; i < allKeys.length; i += 500) {
      const slice = allKeys.slice(i, i + 500);
      const { data: existingRows } = await db
        .from("words")
        .select("norm_key")
        .in("norm_key", slice)
        .like("source", "book-%");
      for (const r of existingRows ?? []) {
        if (r.norm_key) haveBookKeys.add(r.norm_key as string);
      }
    }

    // 2. Lấy các từ chưa có trong sách
    const unseeded = WORD_LIST.filter((item) => !haveBookKeys.has(normKey(item.word)));
    const picked = unseeded.slice(0, count);

    if (picked.length === 0) {
      return NextResponse.json({
        added: 0,
        totalInBook: haveBookKeys.size,
        message: "Bạn đã nạp hết toàn bộ 5000 từ Collegiate!",
      });
    }

    // 3. Tận dụng các từ đã có sẵn trong từ điển chung (nếu có) để 0 tốn lượt AI
    const pickedKeys = picked.map((p) => normKey(p.word));
    const { data: cachedDictRows } = await db
      .from("words")
      .select("id,norm_key")
      .in("norm_key", pickedKeys);

    const cachedDictKeys = new Set((cachedDictRows ?? []).map((r) => String(r.norm_key)));
    const cachedIds = (cachedDictRows ?? []).map((r) => Number(r.id)).filter((n) => n > 0);
    const needAiPicked = picked.filter((p) => !cachedDictKeys.has(normKey(p.word)));

    let promotedCount = 0;
    if (cachedIds.length > 0) {
      const { data: promoted } = await db
        .from("words")
        .update({ source: BOOK_ID })
        .in("id", cachedIds)
        .not("source", "like", "book-%")
        .select("id");
      promotedCount = promoted?.length ?? 0;
    }

    if (needAiPicked.length === 0) {
      return NextResponse.json({
        added: promotedCount,
        totalInBook: haveBookKeys.size + promotedCount,
        remaining: unseeded.length - picked.length,
      });
    }

    // 4. Kiểm tra quota và gọi AI enrich
    const quotaErr = await consumeAiQuota(ctx, "collegiate-5000");
    if (quotaErr) return quotaErr;

    const enriched = await enrich(needAiPicked.map((p) => p.word));

    const rows = [];
    const seen = new Set<string>([...haveBookKeys, ...cachedDictKeys]);

    for (const item of enriched) {
      if (!item.valid || !item.lemma) continue;
      const lemma = item.lemma.toLowerCase().trim();
      const k = normKey(lemma);
      if (seen.has(k)) continue;
      seen.add(k);

      const cefr = ["A2", "B1", "B2", "C1", "C2"].includes(item.cefr_level)
        ? item.cefr_level
        : "B2";

      rows.push({
        lemma,
        norm_key: k,
        ipa: item.ipa || null,
        pos: item.pos || null,
        meaning_vi: item.meaning_vi || null,
        definition_en: item.definition_en || null,
        example: item.example || null,
        cefr_level: cefr,
        topic: item.topic || "Other",
        is_awl: !!item.is_awl,
        collocations: item.collocations ?? [],
        synonyms: item.synonyms ?? [],
        status: "approved",
        source: BOOK_ID,
        created_by: ctx.user.id,
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({
        added: promotedCount,
        totalInBook: haveBookKeys.size + promotedCount,
        remaining: unseeded.length - picked.length,
      });
    }

    const { data, error } = await db
      .from("words")
      .upsert(rows, { onConflict: "norm_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);

    const newlyAdded = promotedCount + (data?.length ?? 0);
    return NextResponse.json({
      added: newlyAdded,
      totalInBook: haveBookKeys.size + newlyAdded,
      remaining: unseeded.length - picked.length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
