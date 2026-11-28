import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { dateOffsetVN, pregenerateDailyForActiveUsers } from "@/lib/daily-generator";

export const maxDuration = 120;

function verifyCronAuth(req: Request): boolean {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return true;
  const authHeader = (req.headers.get("authorization") ?? "").trim();
  if (authHeader === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(req: Request) {
  try {
    if (!verifyCronAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const requestedDay = (url.searchParams.get("date") ?? "").trim();
    const day = /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) ? requestedDay : dateOffsetVN(0);

    const db = supabaseAdmin();
    const summary = await pregenerateDailyForActiveUsers(db, {
      day,
      timeBudgetMs: 100_000,
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
