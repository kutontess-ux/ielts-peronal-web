"use client";

import Link from "next/link";
import { BarChart3, BookOpen, CheckCircle2, Settings2 } from "lucide-react";
import { VoiceSettingsButton } from "@/components/VoiceSettingsModal";
import { LEITNER_INTERVAL_DAYS, type LeitnerLevel } from "@/lib/srs";

type ReviewOverviewProps = {
  enrolledCount: number;
  totalWords: number;
  dueCount: number;
  totalOverdueCount: number;
  reviewedToday: number;
  dailyReviewLimit: number;
  dailyLimitRemaining: number;
  levelCounts: Record<LeitnerLevel, number>;
  startingSession: boolean;
  onStartSession: () => void;
  onOpenSettings: () => void;
};

const LEVEL_BAR_STYLES: Record<
  LeitnerLevel,
  { bar: string; text: string; hint: string }
> = {
  1: {
    bar: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    hint: `${LEITNER_INTERVAL_DAYS[1]} ngày`,
  },
  2: {
    bar: "bg-amber-400",
    text: "text-amber-600 dark:text-amber-300",
    hint: `${LEITNER_INTERVAL_DAYS[2]} ngày`,
  },
  3: {
    bar: "bg-sky-400",
    text: "text-sky-600 dark:text-sky-300",
    hint: `${LEITNER_INTERVAL_DAYS[3]} ngày`,
  },
  4: {
    bar: "bg-indigo-500",
    text: "text-indigo-600 dark:text-indigo-300",
    hint: `${LEITNER_INTERVAL_DAYS[4]} ngày`,
  },
  5: {
    bar: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-300",
    hint: `${LEITNER_INTERVAL_DAYS[5]}+ ngày`,
  },
};

const LEVELS: LeitnerLevel[] = [1, 2, 3, 4, 5];

export function ReviewOverview({
  enrolledCount,
  totalWords,
  dueCount,
  totalOverdueCount,
  reviewedToday,
  dailyReviewLimit,
  dailyLimitRemaining,
  levelCounts,
  startingSession,
  onStartSession,
  onOpenSettings,
}: ReviewOverviewProps) {
  const maxCount = Math.max(1, ...LEVELS.map((lv) => levelCounts[lv] ?? 0));
  const hitDailyLimit = dailyLimitRemaining === 0 && totalOverdueCount > 0;
  const unEnrolledCount = Math.max(0, totalWords - enrolledCount);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Thanh tiện ích trên cùng */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/vocab/stats"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-bold text-muted transition hover:border-brand hover:text-ink"
        >
          <BarChart3 size={14} /> Thống kê chi tiết
        </Link>
        <div className="flex items-center gap-2">
          <VoiceSettingsButton variant="compact" />
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-bold transition hover:bg-card-hover"
          >
            <Settings2 size={14} /> Cài đặt
          </button>
        </div>
      </div>

      {/* Khung tổng quan chính theo phong cách MochiVocab */}
      <div className="flex flex-col items-center rounded-3xl border border-line bg-card px-5 py-8 shadow-xl sm:px-10 sm:py-10">
        {/* Pill tổng số từ trong sổ tay */}
        <div className="inline-flex items-center gap-3 rounded-full border border-line bg-bg/80 py-1.5 pl-1.5 pr-5 shadow-xs">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-card shadow-xs">
            <BookOpen size={18} className="text-rose-500" strokeWidth={2.1} />
          </span>
          <span className="text-sm font-medium text-ink sm:text-base">
            Sổ tay đã có <b className="font-extrabold">{enrolledCount}</b> từ
          </span>
        </div>

        {/* Biểu đồ 5 cột Level 1–5 */}
        <div className="mt-10 w-full max-w-md">
          <div className="grid h-56 grid-cols-5 items-end gap-3 px-2 sm:h-64 sm:gap-5">
            {LEVELS.map((lv) => {
              const count = levelCounts[lv] ?? 0;
              const ratio = count / maxCount;
              const barHeightPx = count > 0 ? Math.max(26, Math.round(ratio * 192)) : 0;
              const style = LEVEL_BAR_STYLES[lv];

              return (
                <div
                  key={lv}
                  title={`Level ${lv} · Chu kỳ ${style.hint}: ${count} từ`}
                  className="flex h-full flex-col items-center justify-end"
                >
                  <span
                    className={`mb-1.5 text-xs font-bold sm:text-sm ${
                      count > 0 ? "text-ink" : "text-muted"
                    }`}
                  >
                    {count} từ
                  </span>
                  {count > 0 && (
                    <div
                      className={`w-full max-w-[54px] rounded-t-2xl transition-all duration-500 ease-out sm:rounded-t-[20px] ${style.bar}`}
                      style={{ height: `${barHeightPx}px` }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Đường trục ngang */}
          <div className="h-1.5 w-full rounded-full bg-line" />

          {/* Nhãn Level 1 - 5 */}
          <div className="mt-2.5 grid grid-cols-5 gap-3 px-2 text-center sm:gap-5">
            {LEVELS.map((lv) => (
              <div key={lv} className="flex flex-col items-center">
                <span className="text-base font-extrabold text-ink sm:text-lg">{lv}</span>
                <span className="text-[11px] font-medium text-muted">
                  {LEVEL_BAR_STYLES[lv].hint}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Trạng thái đến giờ ôn & Nút CTA */}
        <div className="mt-10 flex flex-col items-center text-center">
          {dueCount > 0 ? (
            <>
              <p className="text-base font-semibold text-ink sm:text-lg">
                Đến giờ ôn tập: <b className="font-extrabold">{dueCount} từ</b>
              </p>
              {totalOverdueCount > dailyLimitRemaining && (
                <p className="mt-1 text-xs text-muted">
                  Hôm nay đã ôn {reviewedToday}/{dailyReviewLimit} từ · Tổng tồn đọng:{" "}
                  {totalOverdueCount} từ
                </p>
              )}
              <button
                type="button"
                disabled={startingSession}
                onClick={onStartSession}
                className="mt-5 inline-flex min-w-[230px] items-center justify-center rounded-full bg-[#28b828] px-10 py-3.5 text-base font-extrabold text-white shadow-[0_5px_0_#1a841a] transition-all hover:bg-[#24aa24] active:translate-y-[3px] active:shadow-[0_2px_0_#1a841a] disabled:opacity-60 sm:text-lg"
              >
                {startingSession ? "Đang tải..." : "Ôn tập ngay"}
              </button>
            </>
          ) : enrolledCount === 0 ? (
            <>
              <p className="text-base font-semibold text-ink">
                Chưa có từ nào trong sổ tay ôn tập
              </p>
              <p className="mt-1 max-w-sm text-xs text-muted">
                Hãy học một Học phần hoặc chọn từ trong Kho từ vựng để đưa vào 5 cấp độ ôn tập.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                <Link
                  href="/vocab"
                  className="rounded-full bg-[#28b828] px-7 py-3 text-sm font-extrabold text-white shadow-[0_4px_0_#1a841a] transition-all hover:bg-[#24aa24] active:translate-y-[2px] active:shadow-[0_2px_0_#1a841a]"
                >
                  Đi tới Thẻ ghi nhớ
                </Link>
                <Link
                  href="/vocab/bank"
                  className="rounded-full bg-line px-6 py-3 text-sm font-bold text-ink transition hover:bg-card-hover"
                >
                  Xem Kho từ vựng
                </Link>
              </div>
            </>
          ) : hitDailyLimit ? (
            <>
              <p className="inline-flex items-center gap-1.5 text-base font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={18} /> Đã đạt chỉ tiêu hôm nay ({reviewedToday}/{dailyReviewLimit} từ)
              </p>
              <p className="mt-1 max-w-sm text-xs text-muted">
                Còn {totalOverdueCount} từ tồn đọng sẽ được ưu tiên vào ngày mai. Bạn có thể tăng giới hạn trong Cài đặt nếu muốn ôn thêm.
              </p>
              <button
                type="button"
                onClick={onOpenSettings}
                className="mt-5 rounded-full bg-line px-6 py-2.5 text-sm font-bold text-ink transition hover:bg-card-hover"
              >
                Điều chỉnh giới hạn ngày
              </button>
            </>
          ) : (
            <>
              <p className="inline-flex items-center gap-1.5 text-base font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={18} /> Tuyệt vời! Hiện không có từ nào đến hạn
              </p>
              <p className="mt-1 text-xs text-muted">
                Hôm nay bạn đã ôn {reviewedToday}/{dailyReviewLimit} từ. Hãy học thêm từ mới hoặc quay lại sau.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                <Link
                  href="/vocab"
                  className="rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover hover:text-bg"
                >
                  Học thêm từ mới
                </Link>
                <Link
                  href="/vocab/bank"
                  className="rounded-full bg-line px-6 py-2.5 text-sm font-bold text-ink transition hover:bg-card-hover"
                >
                  Mở Kho từ vựng
                </Link>
              </div>
            </>
          )}

          {unEnrolledCount > 0 && (
            <Link
              href="/vocab/bank"
              className="mt-5 text-xs font-semibold text-muted underline-offset-4 transition hover:text-ink hover:underline"
            >
              Còn {unEnrolledCount} từ trong Kho từ vựng chưa đưa vào sổ tay ôn →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
