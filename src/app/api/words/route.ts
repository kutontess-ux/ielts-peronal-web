import { NextResponse } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/supabase-server";
import { isMissingUserWordsTableError } from "@/lib/user-words";
import { getCachedBookWords, invalidateBooksCache } from "@/lib/books-cache";
import type { Word } from "@/lib/mock";

type RawWordRow = {
  id: number;
  lemma: string;
  ipa: string | null;
  pos: string | null;
  meaning_vi: string | null;
  definition_en: string | null;
  example: string | null;
  cefr_level: string | null;
  topic: string | null;
  is_awl: boolean;
  source: string | null;
  synonyms?: string[] | null;
};

function mapWord(r: RawWordRow, sourceOverride?: string | null): Word {
  return {
    id: r.id,
    word: r.lemma,
    ipa: r.ipa ?? "",
    pos: r.pos ?? "",
    vi: r.meaning_vi ?? "",
    en: r.definition_en ?? "",
    example: r.example ?? "",
    level: (r.cefr_level ?? "B2") as Word["level"],
    topic: r.topic ?? "Other",
    awl: r.is_awl,
    source: sourceOverride ?? r.source ?? "import",
    synonyms: Array.isArray(r.synonyms) ? r.synonyms : [],
  };
}

const WORD_COLUMNS =
  "id,lemma,ipa,pos,meaning_vi,definition_en,example,cefr_level,topic,is_awl,source,synonyms";

// Trả kho từ vựng:
// - scope=personal (mặc định): Kho cá nhân của riêng user hiện tại (public.user_words)
// - scope=books: Các bộ sách cộng đồng (words.source LIKE 'book-%') — mọi user đều xem/xuất được
// - scope=pool: Tối đa 150 từ chuẩn từ từ điển để tạo đáp án nhiễu trắc nghiệm Ôn tập
export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const { searchParams } = new URL(req.url);
    const scope = (searchParams.get("scope") ?? "personal").trim();
    const pageParam = searchParams.get("page");
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();
    const level = (searchParams.get("level") ?? "").trim();
    const topic = (searchParams.get("topic") ?? "").trim();

    if (scope === "pool") {
      const { data, error } = await ctx.db
        .from("words")
        .select(WORD_COLUMNS)
        .eq("status", "approved")
        .order("id", { ascending: true })
        .limit(150);
      if (error) throw new Error(error.message);
      const words = ((data ?? []) as RawWordRow[]).map((r) => mapWord(r));
      return NextResponse.json({ words, total: words.length });
    }

    if (scope === "books") {
      const forceRefresh = searchParams.get("refresh") === "1";
      const bookWords = await getCachedBookWords(ctx.db, forceRefresh);
      return NextResponse.json(
        { words: bookWords, total: bookWords.length },
        {
          headers: forceRefresh
            ? { "Cache-Control": "no-store" }
            : { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
        }
      );
    }

    // Kho từ vựng cá nhân (scope=personal)
    const personalWords: Word[] = [];
    const CHUNK = 1000;
    let tableMissing = false;

    for (let from = 0; from < 20000; from += CHUNK) {
      const { data, error } = await ctx.db
        .from("user_words")
        .select(`source,created_at,words!inner(${WORD_COLUMNS},status)`)
        .eq("user_id", ctx.user.id)
        .eq("words.status", "approved")
        .order("created_at", { ascending: false })
        .range(from, from + CHUNK - 1);

      if (error) {
        if (isMissingUserWordsTableError(error)) {
          tableMissing = true;
          break;
        }
        throw new Error(error.message);
      }

      const batch = data ?? [];
      for (const row of batch) {
        const rawW = (Array.isArray(row.words) ? row.words[0] : row.words) as RawWordRow | null;
        if (!rawW) continue;
        personalWords.push(mapWord(rawW, (row.source as string | null) ?? rawW.source));
      }
      if (batch.length < CHUNK) break;
    }

    // Fallback an toàn nếu DB chưa chạy migration user_words: chỉ trả từ do chính user tạo (ngoài book-*)
    if (tableMissing) {
      for (let from = 0; from < 20000; from += CHUNK) {
        const { data, error } = await ctx.db
          .from("words")
          .select(WORD_COLUMNS)
          .eq("status", "approved")
          .eq("created_by", ctx.user.id)
          .not("source", "like", "book-%")
          .order("created_at", { ascending: false })
          .range(from, from + CHUNK - 1);
        if (error) throw new Error(error.message);
        const batch = (data ?? []) as RawWordRow[];
        for (const r of batch) personalWords.push(mapWord(r));
        if (batch.length < CHUNK) break;
      }
    }

    if (pageParam) {
      const filtered = personalWords.filter((w) => {
        if (level && w.level !== level) return false;
        if (topic && w.topic !== topic) return false;
        if (q && !(w.word + w.vi + w.en).toLowerCase().includes(q)) return false;
        return true;
      });
      const page = Math.max(1, Number(pageParam) || 1);
      const pageSize = Math.min(200, Math.max(10, Number(searchParams.get("pageSize")) || 30));
      const from = (page - 1) * pageSize;
      return NextResponse.json({
        words: filtered.slice(from, from + pageSize),
        total: filtered.length,
        page,
        pageSize,
      });
    }

    return NextResponse.json({ words: personalWords, total: personalWords.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// - Mặc định: Người dùng xoá từ khỏi Kho cá nhân (public.user_words) của chính mình, không ảnh hưởng người khác.
// - ?scope=book: Chỉ Admin mới được xoá từ khỏi Bộ sách / từ điển gốc (public.words).
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = (searchParams.get("scope") ?? "personal").trim();

    if (scope === "book") {
      const auth = await requireAdmin();
      if (auth.errorResponse) return auth.errorResponse;
      const { ctx } = auth;

      const singleId = searchParams.get("id");
      let ids: number[] = [];
      if (singleId) {
        ids = [Number(singleId)].filter((n) => Number.isFinite(n) && n > 0);
      } else {
        const body = (await req.json().catch(() => ({}))) as { ids?: number[] };
        ids = (body.ids ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
      }

      if (ids.length === 0) {
        return NextResponse.json({ error: "Thiếu id từ cần xoá" }, { status: 400 });
      }

      const { error } = await ctx.db.from("words").delete().in("id", ids);
      if (error) throw new Error(error.message);
      invalidateBooksCache();
      return NextResponse.json({ deleted: ids.length });
    }

    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const singleId = searchParams.get("id");
    let ids: number[] = [];
    if (singleId) {
      ids = [Number(singleId)].filter((n) => Number.isFinite(n) && n > 0);
    } else {
      const body = (await req.json().catch(() => ({}))) as { ids?: number[] };
      ids = (body.ids ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    }

    if (ids.length === 0) {
      return NextResponse.json({ error: "Thiếu id từ cần xoá" }, { status: 400 });
    }

    const { error } = await ctx.db
      .from("user_words")
      .delete()
      .eq("user_id", ctx.user.id)
      .in("word_id", ids);

    if (error) {
      if (isMissingUserWordsTableError(error)) {
        return NextResponse.json(
          { error: "Chưa chạy migration bảng user_words trên Supabase." },
          { status: 500 }
        );
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ deleted: ids.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Chỉ Admin mới được gỡ một Bộ sách tuỳ chỉnh khỏi danh sách Bộ sách cộng đồng (giữ nguyên từ vựng trong từ điển)
export async function PATCH(req: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      source?: string;
    };

    if (body.action === "detach_book") {
      const src = (body.source ?? "").trim();
      if (!src.startsWith("book-") || src === "book-3000") {
        return NextResponse.json({ error: "Bộ sách không hợp lệ để gỡ" }, { status: 400 });
      }
      const { data, error } = await ctx.db
        .from("words")
        .update({ source: "import" })
        .eq("source", src)
        .select("id");
      if (error) throw new Error(error.message);
      invalidateBooksCache();
      return NextResponse.json({ updated: data?.length ?? 0 });
    }

    return NextResponse.json({ error: "Hành động không hợp lệ" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
