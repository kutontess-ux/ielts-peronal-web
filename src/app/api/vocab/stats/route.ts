import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import type { supabaseAdmin } from "@/lib/supabase";
import { countUserWords } from "@/lib/user-words";
import type { Word } from "@/lib/mock";
import {
  clampLevel,
  DEFAULT_USER_SETTINGS,
  type LeitnerLevel,
  type UserSettings,
} from "@/lib/srs";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86400 * 1000;
const SOON_WINDOW_MS = 48 * 60 * 60 * 1000;

function getVnDayStartIso(nowMs = Date.now()): string {
  const vnNow = new Date(nowMs + VN_OFFSET_MS);
  const startUtcMs =
    Date.UTC(
      vnNow.getUTCFullYear(),
      vnNow.getUTCMonth(),
      vnNow.getUTCDate(),
      0,
      0,
      0,
      0
    ) - VN_OFFSET_MS;
  return new Date(startUtcMs).toISOString();
}

async function loadUserSettings(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string
): Promise<UserSettings> {
  const { data, error } = await db
    .from("user_settings")
    .select("daily_review_limit,daily_new_limit,session_size")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return DEFAULT_USER_SETTINGS;
  return {
    daily_review_limit:
      data.daily_review_limit ?? DEFAULT_USER_SETTINGS.daily_review_limit,
    daily_new_limit:
      data.daily_new_limit ?? DEFAULT_USER_SETTINGS.daily_new_limit,
    session_size: data.session_size ?? DEFAULT_USER_SETTINGS.session_size,
  };
}

export type AtRiskWord = {
  id: number;
  word: string;
  ipa: string;
  pos: string;
  vi: string;
  level: Word["level"];
  level_srs: LeitnerLevel;
  lapses: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  risk: "overdue" | "due-soon" | "lapsed";
};

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;
    const db = ctx.db;
    const userId = ctx.user.id;

    const nowMs = Date.now();
    const soonMs = nowMs + SOON_WINDOW_MS;
    const startIso = getVnDayStartIso(nowMs);

    const [settings, totalPersonalWords, reviewedTodayRes, reviewsRes] =
      await Promise.all([
        loadUserSettings(db, userId),
        countUserWords(db, userId),
        db
          .from("reviews")
          .select("word_id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("last_reviewed_at", startIso),
        db
          .from("reviews")
          .select(
            "word_id,level,lapses,next_review_at,last_reviewed_at,words!inner(id,lemma,ipa,pos,meaning_vi,cefr_level,status)"
          )
          .eq("user_id", userId)
          .eq("words.status", "approved")
          .limit(2000),
      ]);

    if (reviewedTodayRes.error) throw new Error(reviewedTodayRes.error.message);
    if (reviewsRes.error) throw new Error(reviewsRes.error.message);

    const rows = reviewsRes.data ?? [];
    const levelCounts: Record<LeitnerLevel, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    let reviewedEverCount = 0;
    let dueNowCount = 0;
    let dueSoonCount = 0;
    const atRiskCandidates: { item: AtRiskWord; score: number; nextMs: number }[] = [];

    for (const row of rows) {
      const lv = clampLevel(row.level ?? 1);
      levelCounts[lv] += 1;

      if (row.last_reviewed_at) {
        reviewedEverCount += 1;
      }

      const lapses = Number(row.lapses ?? 0);
      const nextMs = new Date(row.next_review_at as string).getTime();
      const isOverdue = nextMs <= nowMs;
      const isDueSoon = !isOverdue && nextMs <= soonMs;

      if (isOverdue) dueNowCount += 1;
      else if (isDueSoon) dueSoonCount += 1;

      if (isOverdue || isDueSoon || lapses > 0) {
        const w = Array.isArray(row.words) ? row.words[0] : row.words;
        if (!w) continue;
        const risk: AtRiskWord["risk"] = isOverdue
          ? "overdue"
          : isDueSoon
            ? "due-soon"
            : "lapsed";
        const score =
          (isOverdue ? 3000 : isDueSoon ? 2000 : 1000) +
          lapses * 100 +
          (6 - lv) * 20;

        atRiskCandidates.push({
          score,
          nextMs,
          item: {
            id: w.id,
            word: w.lemma,
            ipa: w.ipa ?? "",
            pos: w.pos ?? "",
            vi: w.meaning_vi ?? "",
            level: (w.cefr_level ?? "B2") as Word["level"],
            level_srs: lv,
            lapses,
            next_review_at: row.next_review_at as string,
            last_reviewed_at: (row.last_reviewed_at as string | null) ?? null,
            risk,
          },
        });
      }
    }

    atRiskCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.nextMs - b.nextMs;
    });

    return NextResponse.json({
      reviewedToday: reviewedTodayRes.count ?? 0,
      dailyReviewLimit: settings.daily_review_limit,
      enrolledCount: rows.length,
      reviewedEverCount,
      totalWords: totalPersonalWords,
      masteredCount: levelCounts[5],
      levelCounts,
      dueNowCount,
      dueSoonCount,
      atRiskWords: atRiskCandidates.slice(0, 40).map((c) => c.item),
      dayWindowHours: Math.round(DAY_MS / (60 * 60 * 1000)),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
