"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  Flame,
  Newspaper,
  PenLine,
  Repeat,
  Send,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { fetchDueSummaryCached, markNotifSeenToday, notifySettingsUpdated } from "@/lib/due-events";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "@/lib/srs";
import { useMe } from "@/lib/use-me";
import {
  getExistingPushSubscription,
  isIosDevice,
  isPushSupported,
  isStandalonePwa,
  registerServiceWorker,
  urlBase64ToUint8Array,
} from "@/lib/push-client";

type NotifKey = "notify_review_due" | "notify_writing_streak" | "notify_daily_vocab";

export default function Notifications() {
  const { isAdmin, meLoaded } = useMe();
  const [perm, setPerm] = useState<string>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [pushSupported, setPushSupported] = useState(false);
  const [pushConfigured, setPushConfigured] = useState<boolean | null>(null);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushDeviceCount, setPushDeviceCount] = useState(0);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [writingInfo, setWritingInfo] = useState<{
    completedToday: boolean;
    currentStreak: number;
    todayTitle: string;
  } | null>(null);

  useEffect(() => {
    markNotifSeenToday();

    const supported = isPushSupported();
    setPushSupported(supported);
    if (isIosDevice() && !isStandalonePwa()) {
      setShowIosHint(true);
    }

    if (supported) {
      registerServiceWorker()
        .then(() => getExistingPushSubscription())
        .then((sub) => {
          setPushSubscribed(Boolean(sub));
        })
        .catch(() => {});
    }

    fetch("/api/push/subscribe", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setPushConfigured(Boolean(j.configured));
        setVapidPublicKey(j.publicKey ?? null);
        setPushDeviceCount(Number(j.subscriptionCount ?? 0));
      })
      .catch(() => {});

    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setSettings({
          notify_daily_vocab:
            typeof j.notify_daily_vocab === "boolean"
              ? j.notify_daily_vocab
              : DEFAULT_NOTIFICATION_SETTINGS.notify_daily_vocab,
          notify_review_due:
            typeof j.notify_review_due === "boolean"
              ? j.notify_review_due
              : DEFAULT_NOTIFICATION_SETTINGS.notify_review_due,
          notify_writing_streak:
            typeof j.notify_writing_streak === "boolean"
              ? j.notify_writing_streak
              : DEFAULT_NOTIFICATION_SETTINGS.notify_writing_streak,
          notify_morning:
            typeof j.notify_morning === "boolean"
              ? j.notify_morning
              : DEFAULT_NOTIFICATION_SETTINGS.notify_morning,
          notify_evening:
            typeof j.notify_evening === "boolean"
              ? j.notify_evening
              : DEFAULT_NOTIFICATION_SETTINGS.notify_evening,
        });
      })
      .catch(() => {});

    fetchDueSummaryCached()
      .then((s) => setDueCount(s.ok ? s.dueCount : 0))
      .catch(() => setDueCount(0));
  }, []);

  useEffect(() => {
    if (!meLoaded || !isAdmin) return;
    fetch("/api/writing", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) {
          setWritingInfo({
            completedToday: Boolean(j.streak?.completedToday),
            currentStreak: j.streak?.currentStreak ?? 0,
            todayTitle:
              j.todaySchedule?.title ?? "Viết đoạn ngắn 15p & Chấm chữa 4 tiêu chí",
          });
        }
      })
      .catch(() => {});
  }, [meLoaded, isAdmin]);

  const updateSettings = async (patch: Partial<NotificationSettings>, keyTag = "bulk") => {
    const prev = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSavingKey(keyTag);
    try {
      const r = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error("Save failed");
      notifySettingsUpdated(next);
    } catch {
      setSettings(prev);
    } finally {
      setSavingKey(null);
    }
  };

  const enablePush = async () => {
    setPushMsg(null);
    if (!isPushSupported()) {
      setPushMsg({
        type: "err",
        text: isIosDevice()
          ? "Trên iPhone/iPad, hãy mở bằng Safari → Chia sẻ → Thêm vào màn hình chính (PWA) rồi mở lại app để bật thông báo."
          : "Trình duyệt này chưa hỗ trợ Web Push PWA.",
      });
      return;
    }

    setPushBusy(true);
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") {
        setPushMsg({
          type: "err",
          text: "Bạn chưa cấp quyền thông báo. Hãy cho phép trong cài đặt trình duyệt/thiết bị.",
        });
        return;
      }

      if (!vapidPublicKey) {
        setPushMsg({
          type: "err",
          text: "Server chưa cấu hình NEXT_PUBLIC_VAPID_PUBLIC_KEY. Xem hướng dẫn biến môi trường trên Vercel.",
        });
        return;
      }

      const reg = await registerServiceWorker();
      if (!reg) {
        setPushMsg({ type: "err", text: "Không thể đăng ký Service Worker (/sw.js)." });
        return;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Lưu đăng ký thông báo thất bại");
      }

      setPushSubscribed(true);
      setPushDeviceCount((c) => Math.max(1, c));
      setPushMsg({
        type: "ok",
        text: "Đã bật thông báo đẩy PWA! Bạn sẽ nhận nhắc học dù đã đóng ứng dụng.",
      });
    } catch (e) {
      setPushMsg({ type: "err", text: (e as Error).message });
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    setPushMsg(null);
    setPushBusy(true);
    try {
      const sub = await getExistingPushSubscription();
      const endpoint = sub?.endpoint;
      if (sub) {
        await sub.unsubscribe().catch(() => {});
      }
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      setPushSubscribed(false);
      setPushDeviceCount((c) => Math.max(0, c - 1));
      setPushMsg({ type: "ok", text: "Đã tắt thông báo đẩy trên thiết bị này." });
    } catch (e) {
      setPushMsg({ type: "err", text: (e as Error).message });
    } finally {
      setPushBusy(false);
    }
  };

  const sendTestPush = async () => {
    setPushMsg(null);
    setPushBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sent?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gửi thông báo thử thất bại");
      }
      setPushMsg({
        type: "ok",
        text: `Đã gửi thông báo thử tới ${data.sent ?? 1} thiết bị! Hãy kiểm tra thanh thông báo.`,
      });
    } catch (e) {
      setPushMsg({ type: "err", text: (e as Error).message });
    } finally {
      setPushBusy(false);
    }
  };

  const allMuted =
    !settings.notify_daily_vocab &&
    !settings.notify_review_due &&
    !settings.notify_writing_streak;

  const items: {
    key: NotifKey;
    icon: LucideIcon;
    title: string;
    sub?: string;
    href: string;
    cta: string;
  }[] = [];

  if (settings.notify_review_due && dueCount && dueCount > 0) {
    items.push({
      key: "notify_review_due",
      icon: Repeat,
      title: `${dueCount} từ cần ôn`,
      href: "/vocab/review",
      cta: "Ôn ngay",
    });
  }

  if (isAdmin && settings.notify_writing_streak) {
    if (!writingInfo || !writingInfo.completedToday) {
      items.push({
        key: "notify_writing_streak",
        icon: PenLine,
        title:
          writingInfo && writingInfo.currentStreak > 0
            ? `Writing hôm nay · 🔥 ${writingInfo.currentStreak} ngày`
            : "Writing hôm nay",
        sub: writingInfo?.todayTitle,
        href: "/writing",
        cta: "Viết ngay",
      });
    } else {
      items.push({
        key: "notify_writing_streak",
        icon: Flame,
        title: `Đã xong Writing hôm nay · 🔥 ${writingInfo.currentStreak} ngày`,
        href: "/writing",
        cta: "Xem",
      });
    }
  }

  if (settings.notify_daily_vocab) {
    items.push({
      key: "notify_daily_vocab",
      icon: Newspaper,
      title: "Từ vựng hằng ngày",
      href: "/vocab/daily",
      cta: "Xem",
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Thông báo</h1>
        <button
          type="button"
          disabled={savingKey !== null}
          onClick={() =>
            updateSettings(
              allMuted
                ? {
                    notify_daily_vocab: true,
                    notify_review_due: true,
                    notify_writing_streak: true,
                  }
                : {
                    notify_daily_vocab: false,
                    notify_review_due: false,
                    notify_writing_streak: false,
                  },
              "all"
            )
          }
          className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${
            allMuted
              ? "border-brand bg-brand/10 text-brand-hover hover:bg-brand hover:text-white"
              : "border-line bg-card text-muted hover:border-rose-400/50 hover:text-rose-500"
          }`}
        >
          <BellOff size={14} />
          {allMuted ? "Bật tất cả" : "Tắt tất cả"}
        </button>
      </div>

      <section className="rounded-2xl bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-bold">Lịch nhắc</div>
          {pushSubscribed && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <Bell size={13} />
              Đang bật{pushDeviceCount > 1 ? ` (${pushDeviceCount} thiết bị)` : ""}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-6">
          {(
            [
              ["notify_morning", "Sáng 08:00"],
              ["notify_evening", "Tối 20:00"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={settings[k]}
                disabled={savingKey === k}
                onChange={(e) => updateSettings({ [k]: e.target.checked }, k)}
                className="h-4 w-4 accent-[#4255ff]"
              />
              {l}
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {!pushSubscribed ? (
            <button
              type="button"
              onClick={enablePush}
              disabled={pushBusy || !pushSupported}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-hover hover:text-bg disabled:opacity-50"
            >
              <Bell size={15} />
              {pushBusy ? "Đang bật..." : "Bật thông báo"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={sendTestPush}
                disabled={pushBusy}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-hover hover:text-bg disabled:opacity-50"
              >
                <Send size={14} />
                {pushBusy ? "Đang gửi..." : "Gửi thử"}
              </button>
              <button
                type="button"
                onClick={disablePush}
                disabled={pushBusy}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-bg/60 px-4 py-2 text-xs font-bold text-muted transition hover:border-rose-400/50 hover:text-rose-500 disabled:opacity-50"
              >
                <BellOff size={14} />
                Tắt
              </button>
            </>
          )}
        </div>

        {perm === "denied" && (
          <p className="mt-2.5 text-xs text-rose-600 dark:text-rose-300">
            Trình duyệt đang chặn thông báo, hãy cho phép trong cài đặt rồi bật lại.
          </p>
        )}

        {showIosHint && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200">
            <Smartphone size={15} className="mt-0.5 shrink-0" />
            <span>
              Trên iOS: bấm <b>Chia sẻ</b> → <b>Thêm vào màn hình chính</b> để bật thông báo.
            </span>
          </div>
        )}

        {pushConfigured === false && isAdmin && (
          <p className="mt-2.5 text-xs text-amber-600 dark:text-amber-300">
            Chưa cấu hình VAPID keys (<code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> &amp; <code>VAPID_PRIVATE_KEY</code>).
          </p>
        )}

        {pushMsg && (
          <p
            className={`mt-2.5 text-xs font-medium ${
              pushMsg.type === "ok"
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-rose-600 dark:text-rose-300"
            }`}
          >
            {pushMsg.text}
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-card p-5">
        <div className="font-bold">Kênh thông báo</div>
        <div className="mt-3 space-y-2.5">
          {(
            [
              {
                key: "notify_daily_vocab",
                label: "Từ vựng hằng ngày",
              },
              {
                key: "notify_review_due",
                label: "Nhắc ôn tập",
              },
              ...(isAdmin
                ? [
                    {
                      key: "notify_writing_streak" as const,
                      label: "Writing hằng ngày",
                    },
                  ]
                : []),
            ] as const
          ).map((opt) => {
            const enabled = settings[opt.key];
            return (
              <div
                key={opt.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/70 bg-bg/50 px-4 py-3 dark:border-line"
              >
                <div className="min-w-0 flex-1 text-sm font-bold">{opt.label}</div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={savingKey === opt.key}
                  onClick={() => updateSettings({ [opt.key]: !enabled }, opt.key)}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                    enabled
                      ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
                      : "bg-line text-muted hover:text-ink"
                  }`}
                >
                  {enabled ? "Đang bật" : "Đã tắt"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {settings.notify_review_due && dueCount === 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/15 p-4 text-sm text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
          <CheckCircle2 size={20} strokeWidth={1.75} />
          Đã ôn hết từ hôm nay.
        </div>
      )}

      {allMuted ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card/60 p-5 text-sm text-muted">
          <div className="flex items-center gap-2.5">
            <BellOff size={18} />
            <span>Đã tắt tất cả thông báo.</span>
          </div>
          <button
            type="button"
            onClick={() =>
              updateSettings(
                {
                  notify_daily_vocab: true,
                  notify_review_due: true,
                  notify_writing_streak: true,
                },
                "all"
              )
            }
            className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg"
          >
            Bật lại
          </button>
        </div>
      ) : (
        <section className="space-y-3">
          {items.map((n) => (
            <div
              key={n.title}
              className="flex flex-col gap-3.5 rounded-2xl bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bg text-brand-hover">
                  <n.icon size={21} strokeWidth={1.6} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="break-words font-bold">{n.title}</div>
                  {n.sub && <div className="mt-0.5 break-words text-sm text-muted">{n.sub}</div>}
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2 sm:justify-start">
                <button
                  type="button"
                  disabled={savingKey === n.key}
                  onClick={() => updateSettings({ [n.key]: false }, n.key)}
                  className="whitespace-nowrap rounded-full border border-line px-3.5 py-2 text-xs font-semibold text-muted transition hover:border-rose-400/50 hover:text-rose-500 disabled:opacity-50"
                >
                  Tắt
                </button>
                <Link
                  href={n.href}
                  className="whitespace-nowrap rounded-full bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
                >
                  {n.cta}
                </Link>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
