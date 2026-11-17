"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, Layers, Library, Newspaper, PenLine, Repeat, type LucideIcon } from "lucide-react";

type ReadingItem = {
  id: number;
  title: string;
  source_name: string;
  score_correct: number | null;
  score_total: number | null;
  studied_at: string;
};

export default function Home() {
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [totalWords, setTotalWords] = useState<number | null>(null);
  const [recentPassages, setRecentPassages] = useState<ReadingItem[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [revRes, readingRes] = await Promise.allSettled([
        fetch("/api/reviews", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/reading", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (!active) return;

      if (revRes.status === "fulfilled") {
        setDueCount(revRes.value.dueCount ?? 0);
        setTotalWords(revRes.value.totalWords ?? null);
      } else {
        setDueCount(0);
      }

      if (readingRes.status === "fulfilled") {
        setRecentPassages((readingRes.value.passages ?? []).slice(0, 2));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const JUMP: { title: string; sub: string; href: string; icon: LucideIcon; cta: string }[] = [
    {
      title: "Ôn tập ngắt quãng",
      sub:
        dueCount === null
          ? "Đang kiểm tra..."
          : dueCount > 0
          ? `${dueCount} từ đến hạn ôn hôm nay`
          : "Đã ôn xong hôm nay!",
      href: "/vocab/review",
      icon: Repeat,
      cta: dueCount && dueCount > 0 ? "Ôn ngay" : "Xem",
    },
    {
      title: "Từ hằng ngày",
      sub: "5 từ báo + 5 từ IELTS theo ngày",
      href: "/vocab/daily",
      icon: Newspaper,
      cta: "Xem từ mới",
    },
    {
      title: "Phân tích Reading",
      sub: recentPassages[0]
        ? `Gần nhất: ${recentPassages[0].title}`
        : "Lưu bài đọc & tra từ theo ngữ cảnh",
      href: recentPassages[0] ? `/reading/${recentPassages[0].id}` : "/reading",
      icon: BookOpen,
      cta: recentPassages[0] ? "Mở bài" : "Bắt đầu",
    },
  ];

  const SHORTCUTS: { title: string; sub: string; href: string; icon: LucideIcon }[] = [
    {
      title: "Kho từ vựng",
      sub: totalWords !== null ? `${totalWords} từ đang lưu trong kho` : "Quản lý, lọc & chia bộ sách",
      href: "/vocab/bank",
      icon: Library,
    },
    {
      title: "Thẻ ghi nhớ (Flashcards)",
      sub: "Học từ vựng kiểu Quizlet",
      href: "/vocab",
      icon: Layers,
    },
    ...recentPassages.map((p) => ({
      title: p.title,
      sub: `${p.source_name || "Reading"}${
        p.score_correct !== null && p.score_total !== null ? ` · ${p.score_correct}/${p.score_total} câu đúng` : ""
      }`,
      href: `/reading/${p.id}`,
      icon: BookOpen,
    })),
  ];

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 text-lg font-bold">Tiếp tục học</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {JUMP.map((j) => (
            <div
              key={j.title}
              className="flex min-h-40 flex-col justify-between rounded-3xl border border-line bg-card p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-bold sm:text-xl">{j.title}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-muted">{j.sub}</div>
                </div>
                <j.icon size={36} strokeWidth={1.2} className="shrink-0 text-brand-hover" />
              </div>
              <Link
                href={j.href}
                className="mt-5 w-fit rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
              >
                {j.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">Truy cập nhanh & Gần đây</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {SHORTCUTS.map((item) => (
            <Link
              key={item.href + item.title}
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-xl border border-line/60 bg-card/80 p-3 transition hover:border-line hover:bg-card dark:border-transparent dark:bg-card/40"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-brand-hover">
                  <item.icon size={19} strokeWidth={1.6} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{item.title}</div>
                  <div className="truncate text-xs text-muted">{item.sub}</div>
                </div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-muted" />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">Kỹ năng</h2>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <Link
            href="/vocab"
            className="rounded-2xl border-2 border-transparent bg-card p-5 transition hover:border-brand-hover"
          >
            <Library size={30} strokeWidth={1.4} className="text-brand-hover" />
            <div className="mt-3 font-bold">Từ vựng</div>
            <div className="text-sm text-muted">
              {totalWords !== null ? `${totalWords} từ · Flashcards & SRS` : "Flashcards, Kho từ & SRS"}
            </div>
          </Link>

          <Link
            href="/reading"
            className="rounded-2xl border-2 border-transparent bg-card p-5 transition hover:border-brand-hover"
          >
            <BookOpen size={30} strokeWidth={1.4} className="text-brand-hover" />
            <div className="mt-3 font-bold">Reading</div>
            <div className="text-sm text-muted">Phân tích bài đọc & lưu từ vựng</div>
          </Link>

          <div className="rounded-2xl bg-card/80 p-5 opacity-60 dark:bg-card/50">
            <PenLine size={30} strokeWidth={1.4} />
            <div className="mt-3 font-bold">Writing</div>
            <div className="text-sm text-muted">Sắp có</div>
          </div>
        </div>
      </section>
    </div>
  );
}
