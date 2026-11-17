import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getAiUsageToday } from "@/lib/ai-quota";

export async function GET() {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const { ctx } = auth;
  const aiUsage = await getAiUsageToday(ctx);

  return NextResponse.json({
    profile: ctx.profile,
    isAdmin: ctx.isAdmin,
    aiUsage,
  });
}
