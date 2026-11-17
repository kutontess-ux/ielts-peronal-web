import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/lib/srs";

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("user_settings")
      .select("daily_review_limit,daily_new_limit,session_size")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      // Fallback nếu chưa chạy migration bảng user_settings
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
    const body = (await req.json().catch(() => ({}))) as Partial<UserSettings>;
    const nextSettings: UserSettings = {
      daily_review_limit: clampInt(body.daily_review_limit, 5, 500, DEFAULT_USER_SETTINGS.daily_review_limit),
      daily_new_limit: clampInt(body.daily_new_limit, 0, 200, DEFAULT_USER_SETTINGS.daily_new_limit),
      session_size: clampInt(body.session_size, 5, 50, DEFAULT_USER_SETTINGS.session_size),
    };

    const db = supabaseAdmin();
    const { error } = await db.from("user_settings").upsert(
      {
        id: 1,
        ...nextSettings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, ...nextSettings });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
