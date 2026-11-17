import "server-only";
import { NextResponse } from "next/server";
import type { AuthContext } from "@/lib/supabase-server";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function getVnDayStartIso(nowMs = Date.now()): string {
  const vnNow = new Date(nowMs + VN_OFFSET_MS);
  const startUtcMs =
    Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate(), 0, 0, 0, 0) -
    VN_OFFSET_MS;
  return new Date(startUtcMs).toISOString();
}

export async function getAiUsageToday(
  ctx: AuthContext
): Promise<{ usedToday: number; limit: number | null }> {
  const startIso = getVnDayStartIso();
  const { count } = await ctx.db
    .from("ai_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user.id)
    .gte("created_at", startIso);

  return {
    usedToday: count ?? 0,
    limit: ctx.isAdmin ? null : ctx.profile.daily_ai_limit,
  };
}

export async function consumeAiQuota(
  ctx: AuthContext,
  endpoint: string
): Promise<NextResponse | null> {
  if (!ctx.isAdmin) {
    const { usedToday } = await getAiUsageToday(ctx);
    const limit = Math.max(0, ctx.profile.daily_ai_limit);
    if (usedToday >= limit) {
      return NextResponse.json(
        {
          error: `Bạn đã dùng hết ${usedToday}/${limit} lượt AI hôm nay. Bạn vẫn có thể học từ kho từ vựng có sẵn hoặc quay lại vào ngày mai.`,
        },
        { status: 429 }
      );
    }
  }

  await ctx.db.from("ai_usage_logs").insert({
    user_id: ctx.user.id,
    endpoint,
  });

  return null;
}
