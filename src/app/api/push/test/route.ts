import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { DEFAULT_USER_SETTINGS } from "@/lib/srs";
import { isWebPushConfigured, sendPushNotification } from "@/lib/web-push";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function getVnDayStartIso(nowMs = Date.now()): string {
  const vnNow = new Date(nowMs + VN_OFFSET_MS);
  const startUtcMs =
    Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate(), 0, 0, 0, 0) -
    VN_OFFSET_MS;
  return new Date(startUtcMs).toISOString();
}

export async function POST() {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    if (!isWebPushConfigured()) {
      return NextResponse.json(
        {
          error:
            "Server chưa cấu hình VAPID keys (NEXT_PUBLIC_VAPID_PUBLIC_KEY & VAPID_PRIVATE_KEY).",
        },
        { status: 500 }
      );
    }

    const { data: subs, error: subErr } = await ctx.db
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", ctx.user.id);

    if (subErr) throw new Error(subErr.message);
    if (!subs || subs.length === 0) {
      return NextResponse.json(
        { error: "Thiết bị này chưa đăng ký nhận thông báo đẩy. Hãy bấm 'Bật thông báo đẩy (PWA)' trước." },
        { status: 400 }
      );
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const startIso = getVnDayStartIso(nowMs);

    const [{ data: settingsRow }, { count: overdueCount }, { count: reviewedToday }] =
      await Promise.all([
        ctx.db
          .from("user_settings")
          .select("daily_review_limit")
          .eq("user_id", ctx.user.id)
          .maybeSingle(),
        ctx.db
          .from("reviews")
          .select("word_id,words!inner(status)", { count: "exact", head: true })
          .eq("user_id", ctx.user.id)
          .eq("words.status", "approved")
          .lte("next_review_at", nowIso),
        ctx.db
          .from("reviews")
          .select("word_id", { count: "exact", head: true })
          .eq("user_id", ctx.user.id)
          .gte("last_reviewed_at", startIso),
      ]);

    const limit = settingsRow?.daily_review_limit ?? DEFAULT_USER_SETTINGS.daily_review_limit;
    const dueCount = Math.min(overdueCount ?? 0, Math.max(0, limit - (reviewedToday ?? 0)));

    const body =
      dueCount > 0
        ? `Thông báo đẩy hoạt động! Bạn đang có ${dueCount} từ SRS đến hạn ôn hôm nay.`
        : "Thông báo đẩy hoạt động tốt! Bạn sẽ nhận nhắc học 10 từ mỗi ngày & ôn tập SRS.";

    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    for (const sub of subs) {
      const res = await sendPushNotification(sub, {
        title: "LonTonVocab — Thông báo thử",
        body,
        url: dueCount > 0 ? "/vocab/review" : "/vocab/daily",
        tag: "lontonvocab-test",
      });
      if (res.ok) {
        sent += 1;
      } else {
        failed += 1;
        if (res.expired) expiredEndpoints.push(sub.endpoint);
      }
    }

    if (expiredEndpoints.length > 0) {
      await ctx.db
        .from("push_subscriptions")
        .delete()
        .eq("user_id", ctx.user.id)
        .in("endpoint", expiredEndpoints);
    }

    return NextResponse.json({
      ok: sent > 0,
      sent,
      failed,
      removedExpired: expiredEndpoints.length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
