import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function isMissingTable(msg: string) {
  return msg.includes("reading_passages") && msg.includes("does not exist");
}

export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("reading_passages")
      .select("id,title,source_name,topic,score_correct,score_total,studied_at,created_at,content")
      .order("studied_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      if (isMissingTable(error.message)) {
        return NextResponse.json({ passages: [], needsMigration: true });
      }
      throw new Error(error.message);
    }

    const ids = (data ?? []).map((p) => p.id);
    const noteCounts = new Map<number, number>();
    if (ids.length > 0) {
      const { data: notes } = await db
        .from("reading_notes")
        .select("passage_id")
        .in("passage_id", ids);
      for (const n of notes ?? []) {
        noteCounts.set(n.passage_id, (noteCounts.get(n.passage_id) ?? 0) + 1);
      }
    }

    const passages = (data ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      source_name: p.source_name ?? "",
      topic: p.topic ?? "Other",
      word_count: p.content ? p.content.trim().split(/\s+/).length : 0,
      score_correct: p.score_correct,
      score_total: p.score_total,
      studied_at: p.studied_at,
      notes_count: noteCounts.get(p.id) ?? 0,
    }));

    return NextResponse.json({ passages, needsMigration: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title?: string;
      source_name?: string;
      topic?: string;
      content?: string;
      score_correct?: number | null;
      score_total?: number | null;
      studied_at?: string;
    };

    const title = (body.title ?? "").trim();
    const content = (body.content ?? "").trim();
    if (!title || !content) {
      return NextResponse.json({ error: "Vui lòng nhập tiêu đề và nội dung bài đọc" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin()
      .from("reading_passages")
      .insert({
        title,
        source_name: (body.source_name ?? "").trim() || null,
        topic: (body.topic ?? "").trim() || "Other",
        content,
        score_correct: body.score_correct ?? null,
        score_total: body.score_total ?? null,
        studied_at: body.studied_at || new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: number;
      title?: string;
      source_name?: string | null;
      score_correct?: number | null;
      score_total?: number | null;
      studied_at?: string;
    };
    if (!body.id) return NextResponse.json({ error: "Thiếu id bài đọc" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title.trim();
    if (body.source_name !== undefined) patch.source_name = body.source_name?.trim() || null;
    if (body.score_correct !== undefined) patch.score_correct = body.score_correct;
    if (body.score_total !== undefined) patch.score_total = body.score_total;
    if (body.studied_at !== undefined) patch.studied_at = body.studied_at;

    const { error } = await supabaseAdmin()
      .from("reading_passages")
      .update(patch)
      .eq("id", body.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Thiếu id hợp lệ" }, { status: 400 });
    }
    const { error } = await supabaseAdmin().from("reading_passages").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
