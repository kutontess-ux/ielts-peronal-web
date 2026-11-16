import "server-only";
import { createClient } from "@supabase/supabase-js";

// Chỉ dùng phía server (Secret key bỏ qua RLS). Không import file này trong component "use client".
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong .env.local");
  return createClient(url, key, { auth: { persistSession: false } });
}
