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
    return NextResponse.json({
      database: result,
      ai_config: {
        has_gemini_key: !!process.env.GEMINI_API_KEY,
        gemini_model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
        has_gemini_key_2: !!process.env.GEMINI_API_KEY_2,
        gemini_model_2: process.env.GEMINI_MODEL_2 || "gemini-2.5-flash-lite",
        has_openai_key: !!process.env.OPENAI_API_KEY,
        openai_model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        openai_fallback_disabled: process.env.DISABLE_OPENAI_FALLBACK === "true",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
