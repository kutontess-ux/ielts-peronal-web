import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/lib/srs";

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const { data, error } = await ctx.db
      .from("user_settings")
      .select("daily_review_limit,daily_new_limit,session_size")
      .eq("user_id", ctx.user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(DEFAULT_USER_SETTINGS);
    }

    const settings: UserSettings = {
      daily_review_limit: data?.daily_review_limit ?? DEFAULT_USER_SETTINGS.daily_review_limit,
      daily_new_limit: data?.daily_new_limit ?? DEFAULT_USER_SETTINGS.daily_new_limit,
      session_size: data?.session_size ?? DEFAULT_USER_SETTINGS.session_size,
    };

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

    const body = (await req.json().catch(() => ({}))) as Partial<UserSettings>;
    const nextSettings: UserSettings = {
      daily_review_limit: clampInt(body.daily_review_limit, 5, 500, DEFAULT_USER_SETTINGS.daily_review_limit),
      daily_new_limit: clampInt(body.daily_new_limit, 0, 200, DEFAULT_USER_SETTINGS.daily_new_limit),
      session_size: clampInt(body.session_size, 5, 50, DEFAULT_USER_SETTINGS.session_size),
    };

    const { error } = await ctx.db.from("user_settings").upsert(
      {
        user_id: ctx.user.id,
        ...nextSettings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, ...nextSettings });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
