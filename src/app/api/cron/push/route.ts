import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { DEFAULT_NOTIFICATION_SETTINGS, DEFAULT_USER_SETTINGS } from "@/lib/srs";
import { isWebPushConfigured, sendPushNotification, type StoredPushSubscription } from "@/lib/web-push";
import { pregenerateDailyForActiveUsers, type PregenerateSummary } from "@/lib/daily-generator";

export const maxDuration = 60;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function getVnTodayInfo(nowMs = Date.now()) {
  const vnNow = new Date(nowMs + VN_OFFSET_MS);
  const y = vnNow.getUTCFullYear();
  const m = vnNow.getUTCMonth();
  const d = vnNow.getUTCDate();
  const hour = vnNow.getUTCHours();
  const startUtcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - VN_OFFSET_MS;
  const dayStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return {
    dayStr,
    hour,
    startIso: new Date(startUtcMs).toISOString(),
    nowIso: new Date(nowMs).toISOString(),
  };
}

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

    const { dayStr, hour, startIso, nowIso } = getVnTodayInfo();
    const url = new URL(req.url);
    const rawSlot = url.searchParams.get("slot");
    const slot: "morning" | "evening" =
      rawSlot === "morning" || rawSlot === "evening"
        ? rawSlot
        : hour < 14
          ? "morning"
          : "evening";

    const db = supabaseAdmin();

    // Dự phòng tạo sẵn từ vựng hằng ngày vào khung giờ sáng nếu cron đầu ngày chưa chạy
    let dailyPregen: PregenerateSummary | { error: string } | null = null;
    if (slot === "morning") {
      try {
        dailyPregen = await pregenerateDailyForActiveUsers(db, {
          day: dayStr,
          timeBudgetMs: 35_000,
        });
      } catch (e) {
        dailyPregen = { error: (e as Error).message };
      }
    }

    if (!isWebPushConfigured()) {
      return NextResponse.json(
        {
          error: "VAPID keys chưa được cấu hình (NEXT_PUBLIC_VAPID_PUBLIC_KEY & VAPID_PRIVATE_KEY).",
          dailyPregen,
        },
        { status: 500 }
      );
    }

    const { data: subs, error: subErr } = await db
      .from("push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth");

    if (subErr) throw new Error(subErr.message);
    if (!subs || subs.length === 0) {
      return NextResponse.json({ ok: true, slot, day: dayStr, usersChecked: 0, sent: 0, dailyPregen });
    }

    const subsByUser = new Map<string, StoredPushSubscription[]>();
    for (const s of subs) {
      const uid = String(s.user_id);
      const list = subsByUser.get(uid) ?? [];
      list.push(s);
      subsByUser.set(uid, list);
    }

    const userIds = Array.from(subsByUser.keys());
    const { data: settingsRows } = await db
      .from("user_settings")
      .select(
        "user_id,daily_review_limit,notify_daily_vocab,notify_review_due,notify_morning,notify_evening"
      )
      .in("user_id", userIds);

    const settingsByUser = new Map<string, Record<string, unknown>>();
    for (const row of settingsRows ?? []) {
      settingsByUser.set(String(row.user_id), row);
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const expiredEndpoints: string[] = [];

    for (const userId of userIds) {
      const userSubs = subsByUser.get(userId) ?? [];
      const cfg = settingsByUser.get(userId);

      const notifyMorning =
        typeof cfg?.notify_morning === "boolean"
          ? cfg.notify_morning
          : DEFAULT_NOTIFICATION_SETTINGS.notify_morning;
      const notifyEvening =
        typeof cfg?.notify_evening === "boolean"
          ? cfg.notify_evening
          : DEFAULT_NOTIFICATION_SETTINGS.notify_evening;
      const notifyReviewDue =
        typeof cfg?.notify_review_due === "boolean"
          ? cfg.notify_review_due
          : DEFAULT_NOTIFICATION_SETTINGS.notify_review_due;
      const notifyDailyVocab =
        typeof cfg?.notify_daily_vocab === "boolean"
          ? cfg.notify_daily_vocab
          : DEFAULT_NOTIFICATION_SETTINGS.notify_daily_vocab;
      const dailyLimit =
        typeof cfg?.daily_review_limit === "number"
          ? cfg.daily_review_limit
          : DEFAULT_USER_SETTINGS.daily_review_limit;

      if ((slot === "morning" && !notifyMorning) || (slot === "evening" && !notifyEvening)) {
        skipped += 1;
        continue;
      }

      if (!notifyReviewDue && !notifyDailyVocab) {
        skipped += 1;
        continue;
      }

      let dueCount = 0;
      if (notifyReviewDue) {
        const [{ count: overdueCount }, { count: reviewedToday }] = await Promise.all([
          db
            .from("reviews")
            .select("word_id,words!inner(status)", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("words.status", "approved")
            .lte("next_review_at", nowIso),
          db
            .from("reviews")
            .select("word_id", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("last_reviewed_at", startIso),
        ]);
        dueCount = Math.min(overdueCount ?? 0, Math.max(0, dailyLimit - (reviewedToday ?? 0)));
      }

      let dailyCount = 0;
      if (notifyDailyVocab) {
        const { count } = await db
          .from("daily_words")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("day", dayStr);
        dailyCount = count ?? 0;
      }

      const needSrs = notifyReviewDue && dueCount > 0;
      const needDaily = notifyDailyVocab && (slot === "morning" || dailyCount === 0);

      if (!needSrs && !needDaily) {
        skipped += 1;
        continue;
      }

      let title = "LonTonVocab";
      let body = "";
      let targetUrl = "/notifications";

      if (slot === "morning") {
        title = "Chào buổi sáng! Nhắc học từ vựng";
        if (needSrs && needDaily) {
          body = `Bạn có ${dueCount} từ SRS đến hạn ôn & 10 từ vựng hôm nay (báo + IELTS) đang chờ.`;
          targetUrl = "/vocab/review";
        } else if (needSrs) {
          body = `Bạn có ${dueCount} từ SRS đến hạn ôn tập sáng nay.`;
          targetUrl = "/vocab/review";
        } else {
          body = "10 từ vựng hôm nay (5 từ báo + 5 từ IELTS) đã sẵn sàng!";
          targetUrl = "/vocab/daily";
        }
      } else {
        if (needSrs && needDaily) {
          title = `Nhắc học buổi tối (${dueCount} từ cần ôn)`;
          body = `Đừng quên ôn ${dueCount} từ SRS sắp quên và xem 10 từ vựng hôm nay nhé!`;
          targetUrl = "/vocab/review";
        } else if (needSrs) {
          title = `Ôn tập buổi tối (${dueCount} từ đến hạn)`;
          body = `Còn ${dueCount} từ sắp quên đang chờ bạn ôn tập hôm nay.`;
          targetUrl = "/vocab/review";
        } else {
          title = "10 từ vựng hôm nay đang chờ";
          body = "Dành 5 phút xem 5 từ báo + 5 từ IELTS hôm nay nhé!";
          targetUrl = "/vocab/daily";
        }
      }

      for (const sub of userSubs) {
        const res = await sendPushNotification(sub, {
          title,
          body,
          url: targetUrl,
          tag: `lontonvocab-${slot}-${dayStr}`,
        });
        if (res.ok) {
          sent += 1;
        } else {
          failed += 1;
          if (res.expired) expiredEndpoints.push(sub.endpoint);
        }
      }
    }

    if (expiredEndpoints.length > 0) {
      await db.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
    }

    return NextResponse.json({
      ok: true,
      slot,
      day: dayStr,
      usersChecked: userIds.length,
      sent,
      skipped,
      failed,
      removedExpired: expiredEndpoints.length,
      dailyPregen,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
