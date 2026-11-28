import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { linkWordsToUser } from "@/lib/user-words";
import { invalidateBooksCache } from "@/lib/books-cache";

type Item = {
  lemma: string; norm_key: string; ipa?: string; pos?: string; meaning_vi?: string;
  definition_en?: string; example?: string; cefr_level?: string; topic?: string;
  is_awl?: boolean; collocations?: string[]; synonyms?: string[];
};

// Bước 2: Lưu từ đã duyệt.
// - Nếu source bắt đầu bằng "book-" -> CHỈ Admin mới được thêm vào Bộ sách cộng đồng.
// - Tất cả các nguồn cá nhân khác ("import", "study-set", "study-set-ai", "reading-personal", ...)
//   mọi người dùng đều được nạp và tự động gắn riêng vào Kho cá nhân (public.user_words) của người đó.
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
    const isBookTarget = cleanSource.startsWith("book-");

    if (isBookTarget && !ctx.isAdmin) {
      return NextResponse.json(
        {
          error:
            "Chỉ quản trị viên (Admin) mới được tạo bộ sách hoặc nạp từ vào Bộ sách cộng đồng.",
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

    // Nếu Admin nạp từ vào một Bộ sách cụ thể, gắn các từ chưa thuộc bộ sách nào vào bộ sách đó
    if (isBookTarget && wordIds.length > 0) {
      await ctx.db
        .from("words")
        .update({ source: cleanSource })
        .in("id", wordIds)
        .not("source", "like", "book-%");
    }

    if (isBookTarget) {
      invalidateBooksCache();
    }

    // Nếu là nguồn cá nhân -> gắn vào Kho cá nhân (user_words) của riêng người dùng hiện tại
    const personalAdded = isBookTarget
      ? 0
      : await linkWordsToUser(ctx.db, ctx.user.id, wordIds, cleanSource);

    const dictAdded = data?.length ?? 0;
    const added = isBookTarget ? dictAdded : Math.max(dictAdded, personalAdded);

    await ctx.db.from("imports").insert({
      total: stats?.total ?? items.length,
      added,
      duplicates: (stats?.duplicates ?? 0) + Math.max(0, items.length - added),
      invalid: stats?.invalid ?? 0,
    });
    return NextResponse.json({
      added,
      personalAdded,
      skipped: Math.max(0, items.length - added),
      wordIds,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
