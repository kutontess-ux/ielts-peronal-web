import { NextResponse } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/supabase-server";
import type { Word } from "@/lib/mock";

function mapWord(r: {
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
}): Word {
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
    source: r.source ?? "import",
    synonyms: Array.isArray(r.synonyms) ? r.synonyms : [],
  };
}

// Trả kho từ vựng dùng chung (hỗ trợ cả phân trang server lẫn tải đầy đủ >10.000 từ theo lô 1.000)
export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const { searchParams } = new URL(req.url);
    const pageParam = searchParams.get("page");
    const q = (searchParams.get("q") ?? "").trim();
    const level = (searchParams.get("level") ?? "").trim();
    const topic = (searchParams.get("topic") ?? "").trim();

    if (pageParam) {
      const page = Math.max(1, Number(pageParam) || 1);
      const pageSize = Math.min(200, Math.max(10, Number(searchParams.get("pageSize")) || 30));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = ctx.db
        .from("words")
        .select("id,lemma,ipa,pos,meaning_vi,definition_en,example,cefr_level,topic,is_awl,source,synonyms", {
          count: "exact",
        })
        .eq("status", "approved");

      if (q) {
        query = query.or(`lemma.ilike.%${q}%,meaning_vi.ilike.%${q}%`);
      }
      if (level) query = query.eq("cefr_level", level);
      if (topic) query = query.eq("topic", topic);

      const { data, count, error } = await query
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw new Error(error.message);

      return NextResponse.json({
        words: (data ?? []).map(mapWord),
        total: count ?? 0,
        page,
        pageSize,
      });
    }

    // Tải toàn bộ kho qua từng batch 1.000 dòng để không bị cắt ở ngưỡng 1.000/5.000 khi kho lên 10.000+ từ
    const allRows: Word[] = [];
    const CHUNK = 1000;
    for (let from = 0; from < 20000; from += CHUNK) {
      const { data, error } = await ctx.db
        .from("words")
        .select("id,lemma,ipa,pos,meaning_vi,definition_en,example,cefr_level,topic,is_awl,source,synonyms")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .range(from, from + CHUNK - 1);

      if (error) throw new Error(error.message);
      const batch = data ?? [];
      for (const r of batch) allRows.push(mapWord(r));
      if (batch.length < CHUNK) break;
    }

    return NextResponse.json({ words: allRows, total: allRows.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Chỉ Admin mới được xoá từ khỏi kho chung
export async function DELETE(req: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const { searchParams } = new URL(req.url);
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

    return NextResponse.json({ deleted: ids.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Chỉ Admin mới được gỡ một Bộ sách tuỳ chỉnh khỏi danh sách Bộ sách cộng đồng (giữ nguyên từ vựng trong kho chung)
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
      return NextResponse.json({ updated: data?.length ?? 0 });
    }

    return NextResponse.json({ error: "Hành động không hợp lệ" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
