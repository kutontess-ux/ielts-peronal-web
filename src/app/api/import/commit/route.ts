import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

type Item = {
  lemma: string; norm_key: string; ipa?: string; pos?: string; meaning_vi?: string;
  definition_en?: string; example?: string; cefr_level?: string; topic?: string;
  is_awl?: boolean; collocations?: string[]; synonyms?: string[];
};

const PERSONAL_SOURCES = new Set(["study-set", "study-set-ai", "reading-personal"]);

// Bước 2: người dùng đã duyệt -> ghi vào kho.
// Chỉ Admin mới được nạp vào Bộ sách (book-*) hoặc nạp hàng loạt vào Kho chung (import).
// Thành viên thường chỉ được lưu từ phục vụ Thẻ ghi nhớ cá nhân (study-set / study-set-ai / reading-personal).
export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const { items, stats, source } = (await req.json()) as {
      items: Item[];
      stats?: { total: number; duplicates: number; invalid: number };
      source?: string;
    };
    if (!items?.length) return NextResponse.json({ error: "Không có từ nào để lưu" }, { status: 400 });

    const cleanSource = (source ?? "").trim() || "import";
    if (!ctx.isAdmin && !PERSONAL_SOURCES.has(cleanSource)) {
      return NextResponse.json(
        {
          error:
            "Chỉ quản trị viên (Admin) mới được tạo bộ sách hoặc nạp từ vào Bộ sách cộng đồng. Bạn hãy lưu từ vào Thẻ ghi nhớ cá nhân.",
        },
        { status: 403 }
      );
    }

    const rows = items.map((i) => ({
      lemma: i.lemma.toLowerCase().trim(),
      norm_key: i.norm_key || i.lemma.toLowerCase().trim(),
      ipa: i.ipa || null,
      pos: i.pos || null,
      meaning_vi: i.meaning_vi || null,
      definition_en: i.definition_en || null,
      example: i.example || null,
      cefr_level: i.cefr_level || null,
      topic: i.topic || "Other",
      is_awl: !!i.is_awl,
      collocations: i.collocations ?? [],
      synonyms: i.synonyms ?? [],
      status: "approved",
      source: cleanSource,
      created_by: ctx.user.id,
    }));

    const { data, error } = await ctx.db
      .from("words")
      .upsert(rows, { onConflict: "norm_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);

    const normKeys = Array.from(new Set(rows.map((r) => r.norm_key).filter(Boolean)));
    const { data: resolvedRows } = normKeys.length
      ? await ctx.db.from("words").select("id").in("norm_key", normKeys)
      : { data: [] as { id: number }[] };
    const wordIds = (resolvedRows ?? [])
      .map((r) => Number(r.id))
      .filter((n) => Number.isFinite(n) && n > 0);

    const added = data?.length ?? 0;
    await ctx.db.from("imports").insert({
      total: stats?.total ?? items.length,
      added,
      duplicates: (stats?.duplicates ?? 0) + (items.length - added),
      invalid: stats?.invalid ?? 0,
    });
    return NextResponse.json({ added, skipped: items.length - added, wordIds });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
