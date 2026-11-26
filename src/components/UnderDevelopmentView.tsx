"use client";

import Link from "next/link";
import { Clock, Home, Layers } from "lucide-react";

export function UnderDevelopmentView({
  title = "Tính năng",
  description = "Tính năng này hiện đang được hoàn thiện và sẽ sớm ra mắt. Bạn có thể tiếp tục học Từ vựng trong thời gian chờ đợi.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="mx-auto my-8 max-w-xl rounded-3xl border border-line bg-card p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
        <Clock size={28} strokeWidth={1.75} />
      </div>
      <div className="mt-4 inline-block rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
        Đang phát triển
      </div>
      <h1 className="mt-3 text-xl font-bold text-ink">{title} đang phát triển</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover"
        >
          <Home size={16} />
          Về Trang chủ
        </Link>
        <Link
          href="/vocab"
          className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-brand-hover"
        >
          <Layers size={16} />
          Học Từ vựng
        </Link>
      </div>
    </div>
  );
}
