import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { Word } from "@/lib/mock";
import { computeNextReview, type ReviewGrade } from "@/lib/srs";

export type ReviewWord = Word & {
  reps: number;
  interval_days: number;
  ease: number;
};

// Lấy danh sách từ đến hạn ôn tập (chưa từng ôn hoặc due_at <= hiện tại)
export async function GET() {
  try {
    const db = supabaseAdmin();
    const [{ data: wordsData, error: wErr }, { data: revData, error: rErr }] = await Promise.all([
      db
        .from("words")
        .select("id,lemma,ipa,pos,meaning_vi,definition_en,example,cefr_level,topic,is_awl")
        .eq("status", "approved")
        .order("created_at", { ascending: true })
        .limit(1000),
      db.from("reviews").select("word_id,due_at,interval_days,ease,reps,lapses"),
    ]);
    if (wErr) throw new Error(wErr.message);
    if (rErr) throw new Error(rErr.message);

    const revMap = new Map((revData ?? []).map((r) => [r.word_id as number, r]));
    const now = Date.now();

    const dueWords: ReviewWord[] = [];
    let masteredCount = 0;

    for (const r of wordsData ?? []) {
      const rev = revMap.get(r.id as number);
      if (rev && Number(rev.interval_days) >= 7) masteredCount++;

      const isDue = !!rev && new Date(rev.due_at as string).getTime() <= now;
      if (isDue) {
        dueWords.push({
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
          reps: rev?.reps ?? 0,
          interval_days: Number(rev?.interval_days ?? 0),
          ease: Number(rev?.ease ?? 2.5),
        });
      }
    }

    return NextResponse.json({
      dueCount: dueWords.length,
      enrolledCount: revMap.size,
      totalWords: (wordsData ?? []).length,
      masteredCount,
      words: dueWords.slice(0, 50),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Chuyển từ vào hàng chờ ôn tập ngắt quãng (giữ nguyên lịch nếu từ đã có trong reviews)
export async function PUT(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { wordIds?: number[] };
    const ids = Array.from(
      new Set((body.wordIds ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0))
    );
    if (ids.length === 0) {
      return NextResponse.json({ error: "Chưa có từ nào để chuyển" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const nowIso = new Date().toISOString();
    let enrolled = 0;

    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500).map((word_id) => ({
        word_id,
        due_at: nowIso,
        interval_days: 0,
        ease: 2.5,
        reps: 0,
        lapses: 0,
      }));
      const { data, error } = await db
        .from("reviews")
        .upsert(chunk, { onConflict: "word_id", ignoreDuplicates: true })
        .select("word_id");
      if (error) throw new Error(error.message);
      enrolled += data?.length ?? 0;
    }

    return NextResponse.json({ ok: true, enrolled, totalRequested: ids.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Xoá toàn bộ danh sách từ cần ôn tập ngắt quãng (giữ nguyên từ trong Kho)
export async function DELETE() {
  try {
    const db = supabaseAdmin();
    const { error } = await db.from("reviews").delete().gt("word_id", 0);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Cập nhật lịch ôn tập ngắt quãng (5p / 10p / 1d / 2d -> 4d -> 7d)
export async function POST(req: Request) {
  try {
    const { wordId, grade } = (await req.json()) as { wordId: number; grade: ReviewGrade };
    if (!wordId || !["again", "hard", "good", "easy"].includes(grade)) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: existing } = await db
      .from("reviews")
      .select("interval_days,ease,reps,lapses")
      .eq("word_id", wordId)
      .maybeSingle();

    const prevLapses = Number(existing?.lapses ?? 0);
    const next = computeNextReview(
      {
        interval_days: Number(existing?.interval_days ?? 0),
        ease: Number(existing?.ease ?? 2.5),
        reps: Number(existing?.reps ?? 0),
      },
      grade
    );

    const now = Date.now();
    const dueAtMs = now + next.delayMs;

    const { error } = await db.from("reviews").upsert(
      {
        word_id: wordId,
        due_at: new Date(dueAtMs).toISOString(),
        interval_days: next.interval_days,
        ease: next.ease,
        reps: next.reps,
        lapses: prevLapses + next.lapsesDelta,
        last_reviewed_at: new Date(now).toISOString(),
      },
      { onConflict: "word_id" }
    );
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      interval_days: next.interval_days,
      reps: next.reps,
      ease: next.ease,
      due_at: new Date(dueAtMs).toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
