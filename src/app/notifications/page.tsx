"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BellOff,
  CheckCircle2,
  Flame,
  Newspaper,
  PenLine,
  Repeat,
  type LucideIcon,
} from "lucide-react";
import { markNotifSeenToday, notifySettingsUpdated } from "@/lib/due-events";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "@/lib/srs";

type NotifKey = "notify_review_due" | "notify_writing_streak" | "notify_daily_vocab";

export default function Notifications() {
  const [perm, setPerm] = useState<string>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
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

    fetch("/api/reviews", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setDueCount(j.dueCount ?? 0))
      .catch(() => setDueCount(0));

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
  }, []);

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

  const enable = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") {
      new Notification("IELTS Personal", {
        body: dueCount && dueCount > 0 ? `Bạn có ${dueCount} từ cần ôn hôm nay` : "Đã bật nhắc học hằng ngày!",
      });
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
    sub: string;
    href: string;
    cta: string;
  }[] = [];

  if (settings.notify_review_due && dueCount && dueCount > 0) {
    items.push({
      key: "notify_review_due",
      icon: Repeat,
      title: `${dueCount} từ đến hạn ôn tập`,
      sub: "Ôn đúng lúc để không quên từ",
      href: "/vocab/review",
      cta: "Ôn ngay",
    });
  }

  if (settings.notify_writing_streak) {
    if (!writingInfo || !writingInfo.completedToday) {
      items.push({
        key: "notify_writing_streak",
        icon: PenLine,
        title:
          writingInfo && writingInfo.currentStreak > 0
            ? `Kỷ luật Writing hôm nay (Giữ chuỗi 🔥 ${writingInfo.currentStreak} ngày)`
            : "Nhiệm vụ Kỷ luật Writing hôm nay",
        sub: `${
          writingInfo?.todayTitle ?? "Luyện viết đoạn ngắn 15 phút theo lộ trình"
        } · Đủ 3 bước: Viết → Chấm AI → Gõ lại câu sai`,
        href: "/writing",
        cta: "Viết ngay",
      });
    } else {
      items.push({
        key: "notify_writing_streak",
        icon: Flame,
        title: `Đã hoàn thành Kỷ luật Writing hôm nay (🔥 ${writingInfo.currentStreak} ngày)`,
        sub: "Bạn đã hoàn tất đủ 3 bước kỷ luật hôm nay. Xem lại sổ tay lỗi sai hoặc luyện thêm.",
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
      sub: "Xem 5 từ báo + 5 từ IELTS riêng của bạn hôm nay",
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
          {allMuted ? "Bật lại tất cả thông báo" : "Ngừng tất cả thông báo"}
        </button>
      </div>

      <section className="rounded-2xl bg-card p-5">
        <div className="font-bold">Nhắc ôn tập tự động</div>
        <p className="mt-1 text-sm text-muted">
          Hệ thống tính lịch ôn cho từng từ (lặp lại ngắt quãng) và nhắc bạn khi từ sắp quên.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-6">
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
          <button
            onClick={enable}
            disabled={perm === "granted"}
            className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg disabled:bg-emerald-500/20 disabled:text-emerald-700 dark:disabled:bg-emerald-500/30 dark:disabled:text-emerald-300"
          >
            {perm === "granted" ? "✓ Đã bật thông báo trình duyệt" : "Bật thông báo trình duyệt"}
          </button>
        </div>
        {perm === "denied" && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">
            Trình duyệt đang chặn thông báo, hãy cho phép trong cài đặt trang.
          </p>
        )}
      </section>

      {/* Tuỳ chọn bật/tắt từng loại thông báo (đặc biệt cho người không có nhu cầu tìm từ hằng ngày) */}
      <section className="rounded-2xl bg-card p-5">
        <div className="font-bold">Tuỳ chọn kênh thông báo</div>
        <p className="mt-1 text-sm text-muted">
          Tắt những mục bạn không có nhu cầu theo dõi (khi tắt Từ vựng hằng ngày, hệ thống cũng ngừng tự động gọi AI tìm từ mỗi ngày).
        </p>
        <div className="mt-4 space-y-3">
          {(
            [
              {
                key: "notify_daily_vocab",
                label: "Tìm & nhắc Từ vựng hằng ngày",
                desc: "Gợi ý 5 từ báo + 5 từ IELTS riêng của bạn mỗi ngày",
              },
              {
                key: "notify_review_due",
                label: "Nhắc ôn tập (SRS)",
                desc: "Hiện thông báo và chấm đỏ khi có từ đến hạn ôn",
              },
              {
                key: "notify_writing_streak",
                label: "Nhắc Kỷ luật Writing hằng ngày",
                desc: "Nhắc hoàn thành bài viết 15 phút & giữ chuỗi streak",
              },
            ] as const
          ).map((opt) => {
            const enabled = settings[opt.key];
            return (
              <div
                key={opt.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/70 bg-bg/50 px-4 py-3 dark:border-line"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{opt.label}</div>
                  <div className="text-xs text-muted">{opt.desc}</div>
                </div>
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
          Bạn đã ôn hết từ đến hạn hôm nay! Không còn thông báo nhắc ôn tập nào.
        </div>
      )}

      {allMuted ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card/60 p-5 text-sm text-muted">
          <div className="flex items-center gap-2.5">
            <BellOff size={18} />
            <span>Bạn đã ngừng nhận tất cả thông báo nhắc học.</span>
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
            Bật lại thông báo
          </button>
        </div>
      ) : (
        <section className="space-y-3">
          {items.map((n) => (
            <div key={n.title} className="flex flex-wrap items-center gap-4 rounded-2xl bg-card p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bg text-brand-hover">
                <n.icon size={21} strokeWidth={1.6} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{n.title}</div>
                <div className="text-sm text-muted">{n.sub}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={savingKey === n.key}
                  onClick={() => updateSettings({ [n.key]: false }, n.key)}
                  className="rounded-full border border-line px-3.5 py-2 text-xs font-semibold text-muted transition hover:border-rose-400/50 hover:text-rose-500 disabled:opacity-50"
                >
                  Ngừng nhận
                </button>
                <Link
                  href={n.href}
                  className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
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
