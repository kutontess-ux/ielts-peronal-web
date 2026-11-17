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

      const isDue = !rev || new Date(rev.due_at as string).getTime() <= now;
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
      totalWords: (wordsData ?? []).length,
      masteredCount,
      words: dueWords.slice(0, 50),
    });
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
