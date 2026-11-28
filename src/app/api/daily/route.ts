import { NextResponse } from "next/server";
import { consumeAiQuota } from "@/lib/ai-quota";
import {
  dateOffsetVN,
  ensureDaily,
  isDailyInFlight,
  readDaily,
  readDailyVocabEnabled,
  readRange,
  TARGET_IELTS,
  TARGET_NEWS,
  type DailyGroup,
  type DailyWord,
} from "@/lib/daily-generator";

export type { DailyGroup, DailyWord };

export const maxDuration = 120;

// GET chỉ đọc dữ liệu riêng của user từ Supabase (nhanh, không bao giờ gọi RSS/AI)
export async function GET(req: Request) {
  try {
    const { requireAuth } = await import("@/lib/supabase-server");
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { db, user } = auth.ctx;
    const userId = user.id;

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range");
    const today = dateOffsetVN(0);
    const yesterday = dateOffsetVN(1);

    const [{ data: daysData }, dailyEnabled] = await Promise.all([
      db
        .from("daily_words")
        .select("day")
        .eq("user_id", userId)
        .order("day", { ascending: false })
        .limit(1000),
      readDailyVocabEnabled(db, userId),
    ]);
    const history = Array.from(new Set((daysData ?? []).map((d) => String(d.day))));

    if (range === "7d") {
      const fromDay = dateOffsetVN(6);
      const groups = await readRange(db, userId, fromDay, today);
      return NextResponse.json({ today, yesterday, dailyEnabled, range: "7d", groups, history });
    }

    const day = searchParams.get("date") || today;
    const result = await readDaily(db, userId, day);
    const isIncompleteToday =
      day === today && (result.news.length < TARGET_NEWS || result.ielts.length < TARGET_IELTS);
    const needsGenerate = dailyEnabled && isIncompleteToday;

    return NextResponse.json({
      date: day,
      today,
      yesterday,
      dailyEnabled,
      needsGenerate,
      ...result,
      history,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST tạo hoặc bù đủ 5 từ báo + 5 từ IELTS riêng cho user hôm nay (tính 1 lượt daily_ai_limit)
export async function POST() {
  try {
    const { requireAuth } = await import("@/lib/supabase-server");
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;
    const userId = ctx.user.id;

    const today = dateOffsetVN(0);
    const existing = await readDaily(ctx.db, userId, today);
    if (existing.news.length >= TARGET_NEWS && existing.ielts.length >= TARGET_IELTS) {
      return NextResponse.json({ date: today, generated: false, ...existing });
    }

    if (!isDailyInFlight(userId, today)) {
      const quotaErr = await consumeAiQuota(ctx, "daily-vocab");
      if (quotaErr) return quotaErr;
    }

    await ensureDaily(ctx.db, userId, today);
    const created = await readDaily(ctx.db, userId, today);
    return NextResponse.json({ date: today, generated: true, ...created });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
