import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import {
  DEFAULT_FULL_USER_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_USER_SETTINGS,
  type FullUserSettings,
} from "@/lib/srs";
import type { supabaseAdmin } from "@/lib/supabase";

const FULL_SELECT =
  "daily_review_limit,daily_new_limit,session_size,notify_daily_vocab,notify_review_due,notify_writing_streak,notify_morning,notify_evening";
const BASE_SELECT = "daily_review_limit,daily_new_limit,session_size";

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function toBool(val: unknown, fallback: boolean): boolean {
  return typeof val === "boolean" ? val : fallback;
}

async function readFullSettings(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string
): Promise<{ settings: FullUserSettings; hasNotifCols: boolean }> {
  const fullRes = await db
    .from("user_settings")
    .select(FULL_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  if (!fullRes.error) {
    const d = fullRes.data;
    return {
      hasNotifCols: true,
      settings: {
        daily_review_limit: d?.daily_review_limit ?? DEFAULT_USER_SETTINGS.daily_review_limit,
        daily_new_limit: d?.daily_new_limit ?? DEFAULT_USER_SETTINGS.daily_new_limit,
        session_size: d?.session_size ?? DEFAULT_USER_SETTINGS.session_size,
        notify_daily_vocab: d?.notify_daily_vocab ?? DEFAULT_NOTIFICATION_SETTINGS.notify_daily_vocab,
        notify_review_due: d?.notify_review_due ?? DEFAULT_NOTIFICATION_SETTINGS.notify_review_due,
        notify_writing_streak:
          d?.notify_writing_streak ?? DEFAULT_NOTIFICATION_SETTINGS.notify_writing_streak,
        notify_morning: d?.notify_morning ?? DEFAULT_NOTIFICATION_SETTINGS.notify_morning,
        notify_evening: d?.notify_evening ?? DEFAULT_NOTIFICATION_SETTINGS.notify_evening,
      },
    };
  }

  // Fallback an toàn nếu DB chưa chạy migration thêm các cột notify_*
  const baseRes = await db
    .from("user_settings")
    .select(BASE_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  if (baseRes.error || !baseRes.data) {
    return { hasNotifCols: false, settings: DEFAULT_FULL_USER_SETTINGS };
  }

  return {
    hasNotifCols: false,
    settings: {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      daily_review_limit: baseRes.data.daily_review_limit ?? DEFAULT_USER_SETTINGS.daily_review_limit,
      daily_new_limit: baseRes.data.daily_new_limit ?? DEFAULT_USER_SETTINGS.daily_new_limit,
      session_size: baseRes.data.session_size ?? DEFAULT_USER_SETTINGS.session_size,
    },
  };
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const { settings } = await readFullSettings(ctx.db, ctx.user.id);
    return NextResponse.json(settings);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const body = (await req.json().catch(() => ({}))) as Partial<FullUserSettings>;
    const { settings: cur, hasNotifCols } = await readFullSettings(ctx.db, ctx.user.id);

    const nextSettings: FullUserSettings = {
      daily_review_limit:
        body.daily_review_limit !== undefined
          ? clampInt(body.daily_review_limit, 5, 500, cur.daily_review_limit)
          : cur.daily_review_limit,
      daily_new_limit:
        body.daily_new_limit !== undefined
          ? clampInt(body.daily_new_limit, 0, 200, cur.daily_new_limit)
          : cur.daily_new_limit,
      session_size:
        body.session_size !== undefined
          ? clampInt(body.session_size, 5, 50, cur.session_size)
          : cur.session_size,
      notify_daily_vocab: toBool(body.notify_daily_vocab, cur.notify_daily_vocab),
      notify_review_due: toBool(body.notify_review_due, cur.notify_review_due),
      notify_writing_streak: toBool(body.notify_writing_streak, cur.notify_writing_streak),
      notify_morning: toBool(body.notify_morning, cur.notify_morning),
      notify_evening: toBool(body.notify_evening, cur.notify_evening),
    };

    const payload = hasNotifCols
      ? { user_id: ctx.user.id, ...nextSettings, updated_at: new Date().toISOString() }
      : {
          user_id: ctx.user.id,
          daily_review_limit: nextSettings.daily_review_limit,
          daily_new_limit: nextSettings.daily_new_limit,
          session_size: nextSettings.session_size,
          updated_at: new Date().toISOString(),
        };

    const { error } = await ctx.db
      .from("user_settings")
      .upsert(payload, { onConflict: "user_id" });

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, ...nextSettings });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
