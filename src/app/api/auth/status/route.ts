import { NextResponse, connection } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSupabasePublicEnv } from "@/lib/supabase-server";

export async function GET() {
  await connection();
  const { url, anonKey } = getSupabasePublicEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmailsConfigured = Boolean((process.env.ADMIN_EMAILS || "").trim());

  let migrationReady = false;
  let migrationError: string | null = null;
  if (url && secretKey) {
    try {
      const db = supabaseAdmin();
      const { error } = await db
        .from("profiles")
        .select("id,role,is_active,daily_ai_limit", { head: true, count: "exact" });
      migrationReady = !error;
      if (error) migrationError = error.message;
    } catch (e) {
      migrationReady = false;
      migrationError = (e as Error).message;
    }
  }

  return NextResponse.json({
    authConfigured: Boolean(url && anonKey),
    secretConfigured: Boolean(url && secretKey),
    adminEmailsConfigured,
    migrationReady,
    migrationError,
  });
}
