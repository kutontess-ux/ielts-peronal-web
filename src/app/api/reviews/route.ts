import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { Word } from "@/lib/mock";
import {
  clampLevel,
  computeLeitnerReview,
  DEFAULT_USER_SETTINGS,
  type LeitnerLevel,
  type UserSettings,
} from "@/lib/srs";

export type ReviewWord = Word & {
  level_srs: LeitnerLevel;
  level5_streak: number;
  lapses: number;
  next_review_at: string;
};

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86400 * 1000;

function getVnDayBounds(nowMs = Date.now()) {
  const vnNow = new Date(nowMs + VN_OFFSET_MS);
  const y = vnNow.getUTCFullYear();
  const m = vnNow.getUTCMonth();
  const d = vnNow.getUTCDate();
  const startUtcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - VN_OFFSET_MS;
  const endUtcMs = startUtcMs + DAY_MS;
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
    startUtcMs,
  };
}

function toVnDateKey(ms: number): string {
  const vn = new Date(ms + VN_OFFSET_MS);
  const y = vn.getUTCFullYear();
  const m = String(vn.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vn.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function loadUserSettings(db: ReturnType<typeof supabaseAdmin>): Promise<UserSettings> {
  const { data, error } = await db
    .from("user_settings")
    .select("daily_review_limit,daily_new_limit,session_size")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) return DEFAULT_USER_SETTINGS;
  return {
    daily_review_limit: data.daily_review_limit ?? DEFAULT_USER_SETTINGS.daily_review_limit,
    daily_new_limit: data.daily_new_limit ?? DEFAULT_USER_SETTINGS.daily_new_limit,
    session_size: data.session_size ?? DEFAULT_USER_SETTINGS.session_size,
  };
}

// Lấy danh sách từ đến hạn ôn tập theo thứ tự ưu tiên: level ASC, next_review_at ASC
export async function GET() {
  try {
    const db = supabaseAdmin();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const { startIso } = getVnDayBounds(nowMs);

    const [settings, dueRes, statsRes, wordsCountRes, reviewedTodayRes] = await Promise.all([
      loadUserSettings(db),
      db
        .from("reviews")
        .select(
          "word_id,level,next_review_at,level5_streak,lapses,words!inner(id,lemma,ipa,pos,meaning_vi,definition_en,example,cefr_level,topic,is_awl,status)"
        )
        .eq("words.status", "approved")
        .lte("next_review_at", nowIso)
        .order("level", { ascending: true })
        .order("next_review_at", { ascending: true })
        .limit(200),
      db.from("reviews").select("level"),
      db.from("words").select("id", { count: "exact", head: true }).eq("status", "approved"),
      db
        .from("reviews")
        .select("word_id", { count: "exact", head: true })
        .gte("last_reviewed_at", startIso),
    ]);

    if (dueRes.error) throw new Error(dueRes.error.message);
    if (statsRes.error) throw new Error(statsRes.error.message);
    if (wordsCountRes.error) throw new Error(wordsCountRes.error.message);

    // Đếm tổng số từ quá hạn thực tế (không giới hạn bởi .limit(200))
    const { count: overdueExactCount, error: overdueErr } = await db
      .from("reviews")
      .select("word_id,words!inner(status)", { count: "exact", head: true })
      .eq("words.status", "approved")
      .lte("next_review_at", nowIso);

    if (overdueErr) throw new Error(overdueErr.message);

    const totalOverdueCount = overdueExactCount ?? (dueRes.data?.length ?? 0);
    const reviewedToday = reviewedTodayRes.count ?? 0;
    const dailyLimitRemaining = Math.max(0, settings.daily_review_limit - reviewedToday);
    const dueCount = Math.min(totalOverdueCount, dailyLimitRemaining);
    const sessionLimit = Math.min(settings.session_size, dailyLimitRemaining);

    const levelCounts: Record<LeitnerLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of statsRes.data ?? []) {
      const lv = clampLevel((row as { level?: number }).level ?? 1);
      levelCounts[lv] += 1;
    }

    const words: ReviewWord[] = (dueRes.data ?? []).slice(0, sessionLimit).map((row) => {
      const w = Array.isArray(row.words) ? row.words[0] : row.words;
      return {
        id: w.id,
        word: w.lemma,
        ipa: w.ipa ?? "",
        pos: w.pos ?? "",
        vi: w.meaning_vi ?? "",
        en: w.definition_en ?? "",
        example: w.example ?? "",
        level: (w.cefr_level ?? "B2") as Word["level"],
        topic: w.topic ?? "Other",
        awl: Boolean(w.is_awl),
        level_srs: clampLevel(row.level ?? 1),
        level5_streak: Number(row.level5_streak ?? 0),
        lapses: Number(row.lapses ?? 0),
        next_review_at: row.next_review_at as string,
      };
    });

    return NextResponse.json({
      dueCount,
      totalOverdueCount,
      reviewedToday,
      dailyReviewLimit: settings.daily_review_limit,
      dailyLimitRemaining,
      enrolledCount: statsRes.data?.length ?? 0,
      totalWords: wordsCountRes.count ?? 0,
      masteredCount: levelCounts[5],
      levelCounts,
      settings,
      words,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Chuyển từ vào hàng chờ ôn tập Leitner (tự động dời lịch sang các ngày trống nếu chạm ngưỡng ngày)
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
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const { startUtcMs, startIso } = getVnDayBounds(nowMs);
    const settings = await loadUserSettings(db);

    // Lọc ra các từ chưa có trong reviews
    const { data: existingRows, error: exErr } = await db
      .from("reviews")
      .select("word_id")
      .in("word_id", ids);
    if (exErr) throw new Error(exErr.message);

    const existingSet = new Set((existingRows ?? []).map((r) => Number(r.word_id)));
    const newIds = ids.filter((id) => !existingSet.has(id));

    if (newIds.length === 0) {
      return NextResponse.json({ ok: true, enrolled: 0, deferred: 0, totalRequested: ids.length });
    }

    // Đếm tải hiện tại theo từng ngày trong tương lai để phân bổ hợp lý
    const [{ data: scheduledRows }, { count: reviewedTodayCount }] = await Promise.all([
      db.from("reviews").select("next_review_at,last_reviewed_at"),
      db
        .from("reviews")
        .select("word_id", { count: "exact", head: true })
        .gte("last_reviewed_at", startIso),
    ]);

    const todayKey = toVnDateKey(nowMs);
    const totalLoadByDay = new Map<string, number>();
    const newLoadByDay = new Map<string, number>();

    // Tính số đã ôn hôm nay vào tải của hôm nay
    totalLoadByDay.set(todayKey, reviewedTodayCount ?? 0);

    for (const r of scheduledRows ?? []) {
      const nextMs = new Date(r.next_review_at as string).getTime();
      const dayKey = nextMs <= startUtcMs + DAY_MS ? todayKey : toVnDateKey(nextMs);
      totalLoadByDay.set(dayKey, (totalLoadByDay.get(dayKey) ?? 0) + 1);
      if (!r.last_reviewed_at) {
        newLoadByDay.set(dayKey, (newLoadByDay.get(dayKey) ?? 0) + 1);
      }
    }

    let dayOffset = 0;
    let deferred = 0;
    let firstDeferredDay: string | undefined;

    const toInsert = newIds.map((word_id) => {
      while (dayOffset < 365) {
        const targetStartMs = startUtcMs + dayOffset * DAY_MS;
        const key = toVnDateKey(targetStartMs);
        const dayTotal = totalLoadByDay.get(key) ?? 0;
        const dayNew = newLoadByDay.get(key) ?? 0;

        if (dayTotal < settings.daily_review_limit && dayNew < settings.daily_new_limit) {
          totalLoadByDay.set(key, dayTotal + 1);
          newLoadByDay.set(key, dayNew + 1);
          if (dayOffset > 0) {
            deferred += 1;
            if (!firstDeferredDay) firstDeferredDay = key;
          }
          const nextReviewIso =
            dayOffset === 0
              ? nowIso
              : new Date(targetStartMs + 8 * 60 * 60 * 1000).toISOString(); // 08:00 sáng VN ngày được xếp
          return {
            word_id,
            level: 1,
            next_review_at: nextReviewIso,
            level5_streak: 0,
            lapses: 0,
          };
        }
        dayOffset += 1;
      }

      // Fallback nếu toàn bộ 365 ngày đều đầy
      deferred += 1;
      return {
        word_id,
        level: 1,
        next_review_at: new Date(startUtcMs + 365 * DAY_MS).toISOString(),
        level5_streak: 0,
        lapses: 0,
      };
    });

    let enrolled = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { data, error } = await db
        .from("reviews")
        .upsert(chunk, { onConflict: "word_id", ignoreDuplicates: true })
        .select("word_id");
      if (error) throw new Error(error.message);
      enrolled += data?.length ?? 0;
    }

    return NextResponse.json({
      ok: true,
      enrolled,
      deferred,
      scheduledFromDay: firstDeferredDay,
      totalRequested: ids.length,
    });
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

// Cập nhật lịch ôn tập ngắt quãng theo Leitner 5 cấp độ
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      wordId?: number;
      isCorrect?: boolean;
      isRetryInSession?: boolean;
    };

    const wordId = Number(body.wordId);
    if (!wordId || typeof body.isCorrect !== "boolean") {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: existing } = await db
      .from("reviews")
      .select("level,level5_streak,lapses")
      .eq("word_id", wordId)
      .maybeSingle();

    const prevLapses = Number(existing?.lapses ?? 0);
    const next = computeLeitnerReview(
      {
        level: Number(existing?.level ?? 1),
        level5_streak: Number(existing?.level5_streak ?? 0),
      },
      body.isCorrect,
      Boolean(body.isRetryInSession)
    );

    const now = Date.now();
    const nextReviewAt = new Date(now + next.delayMs).toISOString();

    const { error } = await db.from("reviews").upsert(
      {
        word_id: wordId,
        level: next.level,
        next_review_at: nextReviewAt,
        level5_streak: next.level5_streak,
        lapses: prevLapses + next.lapsesDelta,
        last_reviewed_at: new Date(now).toISOString(),
      },
      { onConflict: "word_id" }
    );
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      level: next.level,
      level5_streak: next.level5_streak,
      next_review_at: nextReviewAt,
      label: next.label,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
