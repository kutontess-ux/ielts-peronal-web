import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase-server";
import { getVnDayStartIso } from "@/lib/ai-quota";

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
      legacyReviewsRes,
      legacySetsRes,
      legacyFoldersRes,
      legacyPassagesRes,
      legacyNotesRes,
      legacySettingsRes,
    ] = await Promise.all([
      db
        .from("profiles")
        .select("id,email,full_name,avatar_url,role,is_active,daily_ai_limit,created_at")
        .order("created_at", { ascending: true }),
      db.from("ai_usage_logs").select("user_id").gte("created_at", startIso),
      db.from("reviews").select("user_id").not("user_id", "is", null),
      db.from("words").select("id", { count: "exact", head: true }).eq("status", "approved"),
      db.from("reviews").select("word_id", { count: "exact", head: true }).is("user_id", null),
      db.from("study_sets").select("id", { count: "exact", head: true }).is("user_id", null),
      db.from("study_folders").select("id", { count: "exact", head: true }).is("user_id", null),
      db.from("reading_passages").select("id", { count: "exact", head: true }).is("user_id", null),
      db.from("reading_notes").select("id", { count: "exact", head: true }).is("user_id", null),
      db.from("user_settings").select("id", { count: "exact", head: true }).is("user_id", null),
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

    const legacyCounts = {
      reviews: legacyReviewsRes.count ?? 0,
      study_sets: legacySetsRes.count ?? 0,
      study_folders: legacyFoldersRes.count ?? 0,
      reading_passages: legacyPassagesRes.count ?? 0,
      reading_notes: legacyNotesRes.count ?? 0,
      user_settings: legacySettingsRes.count ?? 0,
    };
    const totalLegacy = Object.values(legacyCounts).reduce((a, b) => a + b, 0);

    return NextResponse.json({
      users,
      totalWords: wordsCountRes.count ?? 0,
      totalAiToday: aiLogsRes.data?.length ?? 0,
      legacyCounts,
      totalLegacy,
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
    const db = ctx.db;
    const adminId = ctx.user.id;

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "claim_legacy") {
      return NextResponse.json({ error: "Hành động không hợp lệ" }, { status: 400 });
    }

    // 1. Các bảng chỉ có user_id không bị xung đột khoá duy nhất
    await Promise.all([
      db.from("study_folders").update({ user_id: adminId }).is("user_id", null),
      db.from("study_sets").update({ user_id: adminId }).is("user_id", null),
      db.from("reading_passages").update({ user_id: adminId }).is("user_id", null),
      db.from("reading_notes").update({ user_id: adminId }).is("user_id", null),
    ]);

    // 2. user_settings: chỉ gán nếu admin chưa có cấu hình riêng
    const { data: adminSettings } = await db
      .from("user_settings")
      .select("id")
      .eq("user_id", adminId)
      .maybeSingle();

    if (!adminSettings) {
      await db.from("user_settings").update({ user_id: adminId }).is("user_id", null);
    } else {
      await db.from("user_settings").delete().is("user_id", null);
    }

    // 3. reviews: tránh trùng (adminId, word_id) nếu admin đã ôn một vài từ trước khi bấm gộp
    const { data: adminRevRows } = await db
      .from("reviews")
      .select("word_id")
      .eq("user_id", adminId);
    const adminWordIds = new Set((adminRevRows ?? []).map((r) => Number(r.word_id)));

    const { data: legacyRevRows } = await db
      .from("reviews")
      .select("id,word_id")
      .is("user_id", null);

    const claimIds: number[] = [];
    const dupIds: number[] = [];
    for (const r of legacyRevRows ?? []) {
      if (adminWordIds.has(Number(r.word_id))) dupIds.push(Number(r.id));
      else claimIds.push(Number(r.id));
    }

    for (let i = 0; i < claimIds.length; i += 500) {
      await db.from("reviews").update({ user_id: adminId }).in("id", claimIds.slice(i, i + 500));
    }
    for (let i = 0; i < dupIds.length; i += 500) {
      await db.from("reviews").delete().in("id", dupIds.slice(i, i + 500));
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
