import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Mở http://localhost:3000/api/health để kiểm tra kết nối database
export async function GET() {
  try {
    const db = supabaseAdmin();
    const tables = ["words", "imports", "daily_words", "reviews"];
    const result: Record<string, string> = {};
    for (const t of tables) {
      const { error, count } = await db.from(t).select("*", { count: "exact" }).limit(1);
      result[t] = error ? `CHƯA CÓ BẢNG: ${error.message}` : `OK (${count} dòng)`;
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
