import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase-server";
import { getVnDayStartIso } from "@/lib/ai-quota";
import { claimLegacyDataForUser, getLegacyCounts } from "@/lib/legacy-claim";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;
    const db = ctx.db;

    const startIso = getVnDayStartIso();

    const [
      profilesRes,
      aiLogsRes,
      reviewsRes,
      wordsCountRes,
      legacyRes,
    ] = await Promise.all([
      db
        .from("profiles")
        .select("id,email,full_name,avatar_url,role,is_active,daily_ai_limit,created_at")
        .order("created_at", { ascending: true }),
      db.from("ai_usage_logs").select("user_id").gte("created_at", startIso),
      db.from("reviews").select("user_id").not("user_id", "is", null),
      db.from("words").select("id", { count: "exact", head: true }).eq("status", "approved"),
      getLegacyCounts(db),
    ]);

    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const aiMap = new Map<string, number>();
    for (const r of aiLogsRes.data ?? []) {
      const uid = String(r.user_id);
      aiMap.set(uid, (aiMap.get(uid) ?? 0) + 1);
    }

    const reviewCountMap = new Map<string, number>();
    for (const r of reviewsRes.data ?? []) {
      const uid = String(r.user_id);
      reviewCountMap.set(uid, (reviewCountMap.get(uid) ?? 0) + 1);
    }

    const users = (profilesRes.data ?? []).map((p) => ({
      ...p,
      aiUsedToday: aiMap.get(p.id) ?? 0,
      enrolledWords: reviewCountMap.get(p.id) ?? 0,
    }));

    return NextResponse.json({
      users,
      totalWords: wordsCountRes.count ?? 0,
      totalAiToday: aiLogsRes.data?.length ?? 0,
      legacyCounts: legacyRes.legacyCounts,
      totalLegacy: legacyRes.totalLegacy,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const body = (await req.json().catch(() => ({}))) as {
      userId?: string;
      role?: "admin" | "member";
      is_active?: boolean;
      daily_ai_limit?: number;
    };

    const targetId = String(body.userId ?? "").trim();
    if (!targetId) {
      return NextResponse.json({ error: "Thiếu userId" }, { status: 400 });
    }

    if (targetId === ctx.user.id && (body.is_active === false || body.role === "member")) {
      return NextResponse.json(
        { error: "Không thể tự khoá hoặc hạ quyền Admin của chính bạn." },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.role === "admin" || body.role === "member") {
      patch.role = body.role;
    }
    if (typeof body.is_active === "boolean") {
      patch.is_active = body.is_active;
    }
    if (body.daily_ai_limit !== undefined) {
      const limit = Math.max(0, Math.min(1000, Math.round(Number(body.daily_ai_limit))));
      if (Number.isFinite(limit)) patch.daily_ai_limit = limit;
    }

    const { data, error } = await ctx.db
      .from("profiles")
      .update(patch)
      .eq("id", targetId)
      .select("id,email,full_name,avatar_url,role,is_active,daily_ai_limit,created_at")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ user: data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "claim_legacy") {
      return NextResponse.json({ error: "Hành động không hợp lệ" }, { status: 400 });
    }

    await claimLegacyDataForUser(ctx.db, ctx.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
