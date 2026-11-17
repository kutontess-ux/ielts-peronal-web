"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Newspaper, Repeat, type LucideIcon } from "lucide-react";
import { markNotifSeenToday } from "@/lib/due-events";

export default function Notifications() {
  const [perm, setPerm] = useState<string>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [times, setTimes] = useState({ morning: true, evening: true });
  const [dueCount, setDueCount] = useState<number | null>(null);

  useEffect(() => {
    markNotifSeenToday();
    fetch("/api/reviews", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setDueCount(j.dueCount ?? 0))
      .catch(() => setDueCount(0));
  }, []);

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

  const items: { icon: LucideIcon; title: string; sub: string; href: string; cta: string }[] = [];
  if (dueCount && dueCount > 0) {
    items.push({
      icon: Repeat,
      title: `${dueCount} từ đến hạn ôn tập`,
      sub: "Ôn đúng lúc để không quên từ",
      href: "/vocab/review",
      cta: "Ôn ngay",
    });
  }
  items.push({
    icon: Newspaper,
    title: "Từ vựng hằng ngày",
    sub: "Xem 5 từ báo + 5 từ IELTS hôm nay",
    href: "/vocab/daily",
    cta: "Xem",
  });

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold">Thông báo</h1>

      <section className="rounded-2xl bg-card p-5">
        <div className="font-bold">Nhắc ôn tập tự động</div>
        <p className="mt-1 text-sm text-muted">
          Hệ thống tính lịch ôn cho từng từ (lặp lại ngắt quãng) và nhắc bạn khi từ sắp quên.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          {([["morning", "Sáng 08:00"], ["evening", "Tối 20:00"]] as const).map(([k, l]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={times[k]}
                onChange={(e) => setTimes((t) => ({ ...t, [k]: e.target.checked }))}
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
        {perm === "denied" && <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">Trình duyệt đang chặn thông báo, hãy cho phép trong cài đặt trang.</p>}
      </section>

      {dueCount === 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/15 p-4 text-sm text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
          <CheckCircle2 size={20} strokeWidth={1.75} />
          Bạn đã ôn hết từ đến hạn hôm nay! Không còn thông báo nhắc ôn tập nào.
        </div>
      )}

      <section className="space-y-3">
        {items.map((n) => (
          <div key={n.title} className="flex items-center gap-4 rounded-2xl bg-card p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-bg text-brand-hover">
              <n.icon size={21} strokeWidth={1.6} />
            </div>
            <div className="flex-1">
              <div className="font-bold">{n.title}</div>
              <div className="text-sm text-muted">{n.sub}</div>
            </div>
            <Link href={n.href} className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg">{n.cta}</Link>
          </div>
        ))}
      </section>
    </div>
  );
}
