"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, Flame, Library, MoreVertical, Newspaper, PenLine, Repeat, Trash2, type LucideIcon } from "lucide-react";
import { HorizontalCarousel } from "@/components/HorizontalCarousel";
import { fetchDueSummaryCached } from "@/lib/due-events";
import { useMe } from "@/lib/use-me";
import { useStudySets } from "@/lib/study-sets";
import {
  clearStudyDraftByMode,
  getInProgressStudyDrafts,
  type InProgressStudyDraft,
} from "@/lib/study-drafts";

import { QuizletSetIcon } from "@/components/QuizletSetIcon";

type ReadingItem = {
  id: number;
  title: string;
  source_name: string;
  score_correct: number | null;
  score_total: number | null;
  studied_at: string;
};

type WritingSummary = {
  currentStreak: number;
  completedToday: boolean;
  todayTitle: string;
  queuedCount: number;
  latestSubmissionId: number | null;
  latestSubmissionTitle: string | null;
  latestBand: number | null;
};

export default function Home() {
  const { isAdmin } = useMe();
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [totalWords, setTotalWords] = useState<number | null>(null);
  const [recentPassages, setRecentPassages] = useState<ReadingItem[]>([]);
  const [writingSummary, setWritingSummary] = useState<WritingSummary | null>(null);
  const [authMsg, setAuthMsg] = useState("");
  const studySets = useStudySets();
  const [inProgressDrafts, setInProgressDrafts] = useState<InProgressStudyDraft[]>([]);
  const [openDraftMenu, setOpenDraftMenu] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setInProgressDrafts(getInProgressStudyDrafts(studySets));
    });
    return () => cancelAnimationFrame(rafId);
  }, [studySets, draftVersion]);

  useEffect(() => {
    if (!openDraftMenu) return;
    const close = () => setOpenDraftMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openDraftMenu]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [revSummary, readingRes, writingRes] = await Promise.allSettled([
        fetchDueSummaryCached(),
        fetch("/api/reading", { cache: "no-store" }),
        fetch("/api/writing", { cache: "no-store" }),
      ]);
      if (!active) return;

      if (revSummary.status === "fulfilled") {
        const s = revSummary.value;
        if (!s.ok) {
          setAuthMsg(s.error || "Bạn cần đăng nhập để xem dữ liệu học tập của mình.");
          setDueCount(0);
        } else {
          setDueCount(s.dueCount);
          setTotalWords(s.totalWords);
        }
      } else {
        setDueCount(0);
      }

      if (readingRes.status === "fulfilled") {
        const r = readingRes.value;
        const body = await r.json().catch(() => ({}));
        if (active && r.ok) {
          setRecentPassages((body.passages ?? []).slice(0, 4));
        }
      }

      if (writingRes.status === "fulfilled") {
        const r = writingRes.value;
        const body = await r.json().catch(() => ({}));
        if (active && r.ok) {
          const latest = (body.submissions ?? [])[0];
          setWritingSummary({
            currentStreak: body.streak?.currentStreak ?? 0,
            completedToday: Boolean(body.streak?.completedToday),
            todayTitle:
              body.todaySchedule?.title ?? "Luyện viết đoạn ngắn 15p & Chấm chữa 4 tiêu chí",
            queuedCount: (body.prompts ?? []).filter(
              (p: { status?: string }) => p.status === "queued"
            ).length,
            latestSubmissionId: latest?.id ?? null,
            latestSubmissionTitle:
              latest?.topic || latest?.prompt_snapshot?.slice(0, 60) || null,
            latestBand:
              latest?.overall_band !== null && latest?.overall_band !== undefined
                ? Number(latest.overall_band)
                : null,
          });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const recentStudySets = useMemo(() => {
    return [...studySets]
      .filter((s) => s.wordIds.length > 0)
      .sort((a, b) => {
        const ta = a.lastStudiedAt ? new Date(a.lastStudiedAt).getTime() : 0;
        const tb = b.lastStudiedAt ? new Date(b.lastStudiedAt).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, 4);
  }, [studySets]);

  const JUMP: { title: string; sub: string; badge: string; href: string; icon: LucideIcon; cta: string; mobileHidden?: boolean }[] = [
    {
      title: "Ôn tập",
      sub:
        dueCount === null
          ? "Đang kiểm tra..."
          : dueCount > 0
          ? `${dueCount} từ đến hạn ôn hôm nay`
          : "Đã ôn xong hôm nay!",
      badge: dueCount !== null && dueCount > 0 ? `${dueCount} từ cần ôn` : "SRS Leitner",
      href: "/vocab/review",
      icon: Repeat,
      cta: dueCount && dueCount > 0 ? "Ôn ngay" : "Xem",
    },
    {
      title: "Từ hằng ngày",
      sub: "5 từ báo + 5 từ IELTS theo ngày",
      badge: "10 từ / ngày",
      href: "/vocab/daily",
      icon: Newspaper,
      cta: "Xem từ mới",
    },
    {
      title: "Phân tích Reading",
      sub: recentPassages[0]
        ? `Gần nhất: ${recentPassages[0].title}`
        : "Lưu bài đọc & tra từ theo ngữ cảnh",
      badge: recentPassages[0]?.source_name || "Reading",
      href: recentPassages[0] ? `/reading/${recentPassages[0].id}` : "/reading",
      icon: BookOpen,
      cta: recentPassages[0] ? "Mở bài" : "Bắt đầu",
      mobileHidden: true,
    },
    {
      title: "Kỷ luật Writing",
      sub: writingSummary
        ? writingSummary.completedToday
          ? `Đã hoàn thành hôm nay · 🔥 ${writingSummary.currentStreak} ngày`
          : `${writingSummary.todayTitle}${
              writingSummary.currentStreak > 0
                ? ` · 🔥 ${writingSummary.currentStreak} ngày`
                : ""
            }`
        : "Luyện viết hằng ngày & chấm chữa 4 tiêu chí",
      badge: writingSummary ? `🔥 ${writingSummary.currentStreak} ngày` : "Writing",
      href: "/writing",
      icon: PenLine,
      cta: writingSummary?.completedToday ? "Xem sổ tay" : "Viết ngay",
      mobileHidden: true,
    },
  ];

  const SHORTCUTS: { title: string; sub: string; tag: string; href: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; mobileHidden?: boolean }[] = [
    ...recentStudySets.map((s) => ({
      title: s.title,
      sub: `${s.wordIds.length} thẻ · Tác giả: bạn`,
      tag: "",
      href: `/vocab?setId=${encodeURIComponent(s.id)}`,
      icon: QuizletSetIcon,
    })),
    {
      title: "Kho từ vựng",
      sub: totalWords !== null ? `${totalWords} từ cá nhân trong kho` : "Từ đã học, tra cứu & tải lên cá nhân",
      tag: totalWords !== null ? `${totalWords} từ` : "Kho từ",
      href: "/vocab/stats?tab=bank",
      icon: Library,
    },
    {
      title: "Thẻ ghi nhớ (Flashcards)",
      sub: "Học từ vựng & lật thẻ ghi nhớ thông minh",
      tag: "Flashcards",
      href: "/vocab",
      icon: QuizletSetIcon,
    },
    ...recentPassages.map((p) => ({
      title: p.title,
      sub: `${p.source_name || "Reading"}${
        p.score_correct !== null && p.score_total !== null ? ` · ${p.score_correct}/${p.score_total} câu đúng` : ""
      }`,
      tag: p.score_correct !== null && p.score_total !== null ? `${p.score_correct}/${p.score_total}` : "Reading",
      href: `/reading/${p.id}`,
      icon: BookOpen,
      mobileHidden: true,
    })),
  ];

  const visibleJump = isMobile ? JUMP.filter((j) => !j.mobileHidden) : JUMP;
  const visibleShortcuts = isMobile ? SHORTCUTS.filter((s) => !s.mobileHidden) : SHORTCUTS;

  return (
    <div className="space-y-7 sm:space-y-10">
      {authMsg && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          <span>{authMsg} (Dữ liệu trong cơ sở dữ liệu vẫn còn nguyên vẹn.)</span>
          <Link
            href="/login"
            className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg"
          >
            Đi tới trang Đăng nhập
          </Link>
        </div>
      )}

      {/* 1. Học tiếp - Dạng lướt ngang giống Quizlet */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-bold tracking-[-0.01em] text-ink md:text-lg">Học tiếp</h2>
        </div>

        <HorizontalCarousel
          itemCount={inProgressDrafts.length + visibleJump.length}
          showDots
          stepMode="card"
          ariaLabel="Học tiếp"
        >
          {inProgressDrafts.map((d) => {
            const menuKey = `${d.setId}:${d.mode}`;
            return (
              <div
                key={menuKey}
                className="relative flex w-[88%] shrink-0 snap-start flex-col justify-between rounded-[20px] border border-line bg-card p-5 shadow-[0_2px_10px_rgba(40,46,62,0.05)] transition hover:border-brand/50 dark:shadow-none sm:w-[420px] sm:p-6 md:w-[460px]"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 break-words text-[17px] font-bold text-ink sm:text-xl">
                        {d.title}
                      </div>
                    </div>

                    <div
                      className="relative shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        aria-label="Tuỳ chọn tiến độ"
                        onClick={() =>
                          setOpenDraftMenu((prev) =>
                            prev === menuKey ? null : menuKey
                          )
                        }
                        className="-mr-1.5 -mt-1 rounded-full p-1.5 text-muted transition hover:bg-bg hover:text-ink"
                      >
                        <MoreVertical size={18} />
                      </button>

                      {openDraftMenu === menuKey && (
                        <div className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-2xl border border-line bg-card p-1.5 shadow-xl">
                          <button
                            type="button"
                            onClick={() => {
                              clearStudyDraftByMode(d.setId, d.mode);
                              setOpenDraftMenu(null);
                              setDraftVersion((v) => v + 1);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400"
                          >
                            <Trash2 size={14} /> Xoá tiến độ dở
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Thanh tiến trình xanh lá kiểu Quizlet */}
                  <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-[#23b26d] transition-all"
                      style={{ width: `${d.progressPct}%` }}
                    />
                  </div>
                  <div className="mt-2.5 text-[13px] font-normal text-muted sm:text-sm">
                    {d.progressText}
                  </div>
                </div>

                <div className="mt-5">
                  <Link
                    href={d.href}
                    className="block w-full rounded-full bg-brand px-6 py-2.5 text-center text-[14px] font-bold text-white transition hover:bg-brand-hover sm:py-3 sm:text-[15px]"
                  >
                    Tiếp tục
                  </Link>
                </div>
              </div>
            );
          })}

          {visibleJump.map((j) => (
            <div
              key={j.title}
              className="flex w-[88%] shrink-0 snap-start flex-col justify-between rounded-[20px] border border-line bg-card p-5 shadow-[0_2px_10px_rgba(40,46,62,0.05)] transition hover:border-brand/50 dark:shadow-none sm:w-[420px] sm:p-6 md:w-[460px]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {isAdmin && (
                    <span className="mb-2 inline-block rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-bold text-brand dark:text-brand-hover">
                      {j.badge}
                    </span>
                  )}
                  <div className="break-words text-[17px] font-bold text-ink sm:text-xl">{j.title}</div>
                  <div className="mt-1 line-clamp-2 text-[13px] text-muted sm:text-sm">{j.sub}</div>
                </div>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#eaf4ff] text-[#0077cc] dark:bg-brand/15 dark:text-brand-hover sm:h-16 sm:w-16">
                  <j.icon size={28} strokeWidth={1.5} />
                </div>
              </div>
              <div className="mt-5">
                <Link
                  href={j.href}
                  className="block w-full rounded-full bg-brand px-6 py-2.5 text-center text-[14px] font-bold text-white transition hover:bg-brand-hover sm:py-3 sm:text-[15px]"
                >
                  {j.cta}
                </Link>
              </div>
            </div>
          ))}
        </HorizontalCarousel>
      </section>

      {/* 2. Gần đây - Dạng danh sách phẳng 2 hàng giống Quizlet trên mobile, thẻ trên PC */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-bold tracking-[-0.01em] text-ink md:text-lg">
            <span className="md:hidden">Gần đây</span>
            <span className="hidden md:inline">Gần đây &amp; Truy cập nhanh</span>
          </h2>
        </div>

        {/* Mobile: Danh sách phẳng cuộn ngang 2 hàng giống Quizlet */}
        <div className="grid auto-cols-[84%] grid-flow-col grid-rows-2 gap-x-4 gap-y-4 overflow-x-auto pb-1 no-scrollbar md:hidden">
          {visibleShortcuts.map((item) => (
            <Link
              key={item.href + item.title}
              href={item.href}
              className="flex items-start gap-3.5 rounded-xl py-0.5 transition active:opacity-75"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#eaf4ff] text-[#0077cc] dark:bg-brand/15 dark:text-brand-hover">
                <item.icon size={22} strokeWidth={1.7} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[15px] font-bold leading-snug text-ink">
                  {item.title}
                </div>
                <div className="mt-0.5 truncate text-[13px] text-muted">
                  {item.sub}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* PC: Carousel thẻ như cũ */}
        <div className="hidden md:block">
          <HorizontalCarousel
            itemCount={visibleShortcuts.length}
            stepMode="page"
            ariaLabel="Gần đây và truy cập nhanh"
          >
            {visibleShortcuts.map((item) => (
              <Link
                key={item.href + item.title}
                href={item.href}
                className="flex w-[270px] shrink-0 snap-start flex-col justify-between rounded-2xl border border-line bg-card p-4 transition hover:border-brand-hover md:w-[calc((100%-28px)/3)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg text-brand-hover">
                    <item.icon size={18} strokeWidth={1.6} />
                  </div>
                  {item.tag && (
                    <span className="truncate rounded-full bg-bg px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                      {item.tag}
                    </span>
                  )}
                </div>
                <div className="mt-4 min-w-0">
                  <div className="line-clamp-1 text-sm font-bold text-ink">{item.title}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                    <span className="truncate">{item.sub}</span>
                    <ChevronRight size={14} className="shrink-0 text-muted" />
                  </div>
                </div>
              </Link>
            ))}
          </HorizontalCarousel>
        </div>
      </section>

      {/* 3. Kỹ năng - Ẩn trên mobile, giữ nguyên 3 cột trên PC */}
      <section className="hidden md:block">
        <h2 className="mb-3.5 text-lg font-bold">Kỹ năng</h2>

        <HorizontalCarousel
          itemCount={3}
          stepMode="card"
          ariaLabel="Kỹ năng IELTS"
        >
          <Link
            href="/vocab"
            className="w-[78%] shrink-0 snap-start rounded-2xl border border-line bg-card p-5 transition hover:border-brand-hover sm:w-[270px] md:w-[calc((100%-28px)/3)]"
          >
            <Library size={28} strokeWidth={1.5} className="text-brand-hover" />
            <div className="mt-3 font-bold">Từ vựng</div>
            <div className="mt-1 text-sm text-muted">
              {totalWords !== null ? `${totalWords} từ · Flashcards & SRS` : "Flashcards, Kho từ & SRS"}
            </div>
          </Link>

          <Link
            href="/reading"
            className="w-[78%] shrink-0 snap-start rounded-2xl border border-line bg-card p-5 transition hover:border-brand-hover sm:w-[270px] md:w-[calc((100%-28px)/3)]"
          >
            <BookOpen size={28} strokeWidth={1.5} className="text-brand-hover" />
            <div className="mt-3 font-bold">Reading</div>
            <div className="mt-1 text-sm text-muted">Phân tích bài đọc &amp; lưu từ vựng</div>
          </Link>

          <Link
            href="/writing"
            className="w-[78%] shrink-0 snap-start rounded-2xl border border-line bg-card p-5 transition hover:border-brand-hover sm:w-[270px] md:w-[calc((100%-28px)/3)]"
          >
            <div className="flex items-center justify-between gap-2">
              <PenLine size={28} strokeWidth={1.5} className="text-brand-hover" />
              {writingSummary && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    writingSummary.completedToday
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-orange-500/15 text-orange-700 dark:text-orange-300"
                  }`}
                >
                  <Flame size={13} /> {writingSummary.currentStreak} ngày
                </span>
              )}
            </div>
            <div className="mt-3 font-bold">Writing</div>
            <div className="mt-1 line-clamp-2 text-sm text-muted">
              {writingSummary
                ? writingSummary.completedToday
                  ? "✓ Đã hoàn thành kỷ luật 3 bước hôm nay"
                  : `Hôm nay: ${writingSummary.todayTitle}`
                : "Luyện viết kỷ luật hằng ngày & chấm 4 tiêu chí"}
            </div>
          </Link>
        </HorizontalCarousel>
      </section>
    </div>
  );
}
