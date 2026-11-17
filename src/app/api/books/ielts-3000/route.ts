import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { consumeAiQuota } from "@/lib/ai-quota";
import { enrich } from "@/lib/ai";
import { normKey } from "@/lib/normalize";
import oxford3000 from "@/data/oxford-3000.json";

export const maxDuration = 120;

type OxEntry = { word: string; level: string };
const OX_LIST = oxford3000 as OxEntry[];

// Nạp thêm 30 từ chuẩn từ danh sách The Oxford 3000 (bỏ qua từ đã có trong kho)
export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;
    const db = ctx.db;

    const body = (await req.json().catch(() => ({}))) as { level?: string; count?: number };
    const count = Math.min(40, Math.max(10, body.count ?? 30));
    const targetLevel = body.level && body.level !== "Tất cả" ? body.level : "";

    const haveKeys = new Set<string>();
    const allOxKeys = OX_LIST.map((x) => normKey(x.word));
    for (let i = 0; i < allOxKeys.length; i += 500) {
      const slice = allOxKeys.slice(i, i + 500);
      const { data: existingRows } = await db.from("words").select("norm_key").in("norm_key", slice);
      for (const r of existingRows ?? []) haveKeys.add(r.norm_key as string);
    }

    const candidates = OX_LIST.filter((item) => {
      if (targetLevel && item.level !== targetLevel) return false;
      if (!targetLevel && !["B1", "B2"].includes(item.level)) return false;
      return !haveKeys.has(normKey(item.word));
    });

    const pool =
      candidates.length >= count
        ? candidates
        : OX_LIST.filter((item) => !haveKeys.has(normKey(item.word)));

    const picked = pool.slice(0, count);
    if (picked.length === 0) {
      return NextResponse.json({ added: 0, message: "Bạn đã nạp hết toàn bộ danh sách The Oxford 3000!" });
    }

    const quotaErr = await consumeAiQuota(ctx, "oxford-3000");
    if (quotaErr) return quotaErr;

    const levelByWord = new Map(picked.map((p) => [normKey(p.word), p.level]));
    const enriched = await enrich(picked.map((p) => p.word));

    const rows = [];
    const seen = new Set<string>(haveKeys);

    for (const item of enriched) {
      if (!item.valid || !item.lemma) continue;
      const lemma = item.lemma.toLowerCase().trim();
      const k = normKey(lemma);
      if (seen.has(k)) continue;
      seen.add(k);

      const oxLevel = levelByWord.get(normKey(item.input)) || item.cefr_level || "B2";
      const safeLevel = oxLevel === "A1" ? "A2" : ["A2", "B1", "B2", "C1", "C2"].includes(oxLevel) ? oxLevel : "B2";

      rows.push({
        lemma,
        norm_key: k,
        ipa: item.ipa || null,
        pos: item.pos || null,
        meaning_vi: item.meaning_vi || null,
        definition_en: item.definition_en || null,
        example: item.example || null,
        cefr_level: safeLevel,
        topic: item.topic || "Other",
        is_awl: !!item.is_awl,
        collocations: item.collocations ?? [],
        synonyms: item.synonyms ?? [],
        status: "approved",
        source: "book-3000",
        created_by: ctx.user.id,
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ added: 0 });
    }

    const { data, error } = await db
      .from("words")
      .upsert(rows, { onConflict: "norm_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);

    return NextResponse.json({ added: data?.length ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
