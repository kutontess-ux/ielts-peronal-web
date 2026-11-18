"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  ListChecks,
  PenLine,
  Target,
} from "lucide-react";
import {
  computeWritingStreak,
  type WritingStreakSummary,
} from "@/lib/writing-frameworks";

type SubmissionItem = {
  id: number;
  overall_band: number | null;
  tr_band: number | null;
  cc_band: number | null;
  lr_band: number | null;
  gra_band: number | null;
  discipline_completed: boolean;
  studied_at: string;
  created_at: string;
};

type ErrorStats = {
  grammar: number;
  lexical: number;
  coherence: number;
  task_response: number;
  total: number;
};

const INITIAL_STREAK: WritingStreakSummary = {
  currentStreak: 0,
  longestStreak: 0,
  completedToday: false,
  hasWrittenToday: false,
  hasGradedToday: false,
  totalCompletedDays: 0,
  last14Days: [],
};

const ERROR_GROUPS: {
  key: keyof Omit<ErrorStats, "total">;
  label: string;
  barCls: string;
}[] = [
  { key: "grammar", label: "Ngữ pháp & Cấu trúc (GRA)", barCls: "bg-rose-500" },
  { key: "lexical", label: "Từ vựng & Collocations (LR)", barCls: "bg-amber-500" },
  { key: "coherence", label: "Mạch lạc & Từ nối (CC)", barCls: "bg-sky-500" },
  { key: "task_response", label: "Lập luận & Trả lời đề (TR/TA)", barCls: "bg-emerald-500" },
];

export default function WritingStatsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [streak, setStreak] = useState<WritingStreakSummary>(INITIAL_STREAK);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [errorStats, setErrorStats] = useState<ErrorStats>({
    grammar: 0,
    lexical: 0,
    coherence: 0,
    task_response: 0,
    total: 0,
  });

  // Band trung bình: mặc định chỉ hiện Tổng; dí chuột hoặc click mới hiện đầy đủ 4 tiêu chí
  const [bandHovered, setBandHovered] = useState(false);
  const [bandPinned, setBandPinned] = useState(false);
  const showBandDetail = bandHovered || bandPinned;

  useEffect(() => {
    let active = true;
    (async () => {
      const fallbackStreak = computeWritingStreak([]);
      try {
        const res = await fetch("/api/writing", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setStreak(fallbackStreak);
          setError(j.error || "Không tải được dữ liệu thống kê Writing");
          return;
        }
        setStreak(j.streak ?? fallbackStreak);
        setSubmissions(j.submissions ?? []);
        if (j.errorStats) setErrorStats(j.errorStats);
      } catch (e) {
        if (active) {
          setStreak(fallbackStreak);
          setError((e as Error).message);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const bandStats = useMemo(() => {
    const graded = submissions.filter(
      (s) => s.overall_band !== null && s.overall_band !== undefined
    );
    if (graded.length === 0) return null;
    const avg = (arr: (number | null)[]) => {
      const nums = arr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
      if (nums.length === 0) return 0;
      return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
    };
    return {
      count: graded.length,
      overall: avg(graded.map((s) => s.overall_band)),
      tr: avg(graded.map((s) => s.tr_band)),
      cc: avg(graded.map((s) => s.cc_band)),
      lr: avg(graded.map((s) => s.lr_band)),
      gra: avg(graded.map((s) => s.gra_band)),
    };
  }, [submissions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/writing"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-2 text-xs font-bold text-muted transition hover:border-brand-hover hover:text-ink"
          >
            <ArrowLeft size={14} /> IELTS Writing
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
              <BarChart3 size={24} className="text-brand-hover" /> Thống kê Writing
            </h1>
          </div>
        </div>
        <Link
          href="/writing"
          className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg"
        >
          <PenLine size={14} /> Vào luyện viết
        </Link>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-line bg-card p-10 text-center text-sm text-muted">
          Đang tải thống kê Writing...
        </div>
      ) : (
        <>
          {/* 4 THẺ CHÍNH: CHUỖI KỶ LUẬT, QUY TẮC 3 BƯỚC, BAND TRUNG BÌNH, LỊCH NHIỆT */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Chuỗi Kỷ Luật */}
            <div className="flex flex-col justify-between rounded-2xl border border-line bg-card p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">
                  Chuỗi Kỷ Luật Writing
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    streak.completedToday
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-orange-500/15 text-orange-700 dark:text-orange-300"
                  }`}
                >
                  <Flame size={13} />
                  {streak.completedToday ? "Đã giữ chuỗi hôm nay" : "Hôm nay chưa xong"}
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-ink">{streak.currentStreak}</span>
                <span className="text-sm font-semibold text-muted">ngày liên tiếp 🔥</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-xs text-muted">
                <span>Kỷ lục: {streak.longestStreak} ngày</span>
                <span>Tổng: {streak.totalCompletedDays} ngày hoàn tất</span>
              </div>
            </div>

            {/* Card 2: Quy tắc Kỷ luật 3 Bước */}
            <div className="flex flex-col justify-between rounded-2xl border border-line bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">
                  Quy tắc Kỷ luật 3 Bước
                </span>
                <ListChecks size={16} className="text-brand-hover" />
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      streak.hasWrittenToday
                        ? "bg-emerald-500 text-white"
                        : "border border-line bg-bg text-muted"
                    }`}
                  >
                    {streak.hasWrittenToday ? <Check size={12} /> : "1"}
                  </span>
                  <span className={streak.hasWrittenToday ? "font-semibold text-ink" : "text-muted"}>
                    Bước 1: Viết đủ số từ tối thiểu
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      streak.hasGradedToday
                        ? "bg-emerald-500 text-white"
                        : "border border-line bg-bg text-muted"
                    }`}
                  >
                    {streak.hasGradedToday ? <Check size={12} /> : "2"}
                  </span>
                  <span className={streak.hasGradedToday ? "font-semibold text-ink" : "text-muted"}>
                    Bước 2: Chấm chữa chuẩn 4 tiêu chí AI
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      streak.completedToday
                        ? "bg-emerald-500 text-white"
                        : "border border-line bg-bg text-muted"
                    }`}
                  >
                    {streak.completedToday ? <Check size={12} /> : "3"}
                  </span>
                  <span className={streak.completedToday ? "font-semibold text-ink" : "text-muted"}>
                    Bước 3: Gõ sửa lại câu sai (+1 Streak)
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: Điểm Band Trung Bình (Mặc định chỉ hiện Tổng; dí chuột hoặc click mới hiện 4 tiêu chí) */}
            <div
              role="button"
              tabIndex={0}
              onMouseEnter={() => setBandHovered(true)}
              onMouseLeave={() => setBandHovered(false)}
              onClick={() => setBandPinned((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setBandPinned((prev) => !prev);
                }
              }}
              aria-expanded={showBandDetail}
              className="flex cursor-pointer flex-col justify-between rounded-2xl border border-line bg-card p-5 transition hover:border-brand-hover"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">
                  Điểm Band Trung Bình
                </span>
                <div className="flex items-center gap-1 text-brand-hover">
                  <Target size={16} />
                  {bandStats &&
                    (showBandDetail ? <ChevronUp size={15} /> : <ChevronDown size={15} />)}
                </div>
              </div>
              {bandStats ? (
                <>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-sm font-bold text-muted">Tổng:</span>
                    <span className="text-4xl font-extrabold text-brand-hover">
                      {bandStats.overall.toFixed(1)}
                    </span>
                    <span className="text-xs text-muted">({bandStats.count} bài đã chấm)</span>
                  </div>

                  {showBandDetail ? (
                    <div className="mt-3 grid grid-cols-4 gap-1.5 border-t border-line pt-3 text-center text-[11px]">
                      <div className="rounded-lg bg-bg px-1.5 py-1.5">
                        <div className="text-muted">TR/TA</div>
                        <div className="font-bold text-ink">{bandStats.tr.toFixed(1)}</div>
                      </div>
                      <div className="rounded-lg bg-bg px-1.5 py-1.5">
                        <div className="text-muted">CC</div>
                        <div className="font-bold text-ink">{bandStats.cc.toFixed(1)}</div>
                      </div>
                      <div className="rounded-lg bg-bg px-1.5 py-1.5">
                        <div className="text-muted">LR</div>
                        <div className="font-bold text-ink">{bandStats.lr.toFixed(1)}</div>
                      </div>
                      <div className="rounded-lg bg-bg px-1.5 py-1.5">
                        <div className="text-muted">GRA</div>
                        <div className="font-bold text-ink">{bandStats.gra.toFixed(1)}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 border-t border-line pt-2.5 text-[11px] text-muted">
                      Di chuột hoặc bấm vào để xem đầy đủ 4 tiêu chí
                    </div>
                  )}
                </>
              ) : (
                <div className="my-auto py-2 text-xs text-muted">
                  Chưa có bài viết nào được chấm. Hãy hoàn thành một bài viết để xem điểm Band!
                </div>
              )}
            </div>

            {/* Card 4: Lịch nhiệt 14 ngày */}
            <div className="flex flex-col justify-between rounded-2xl border border-line bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">
                  Lịch nhiệt 14 ngày gần nhất
                </span>
                <Calendar size={16} className="text-brand-hover" />
              </div>
              <div className="mt-3 grid grid-cols-7 gap-1.5">
                {streak.last14Days.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.label}: ${
                      d.completed
                        ? "Đã hoàn thành kỷ luật 3 bước"
                        : d.count > 0
                        ? `Đã viết ${d.count} bài (chưa hoàn tất bước 3)`
                        : "Chưa luyện viết"
                    }`}
                    className={`flex flex-col items-center justify-center rounded-lg py-1.5 text-[10px] font-bold transition ${
                      d.completed
                        ? "bg-emerald-500 text-white shadow-xs"
                        : d.count > 0
                        ? "border border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "border border-line bg-bg text-muted"
                    }`}
                  >
                    <span>{d.label.split("/")[0]}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" /> Đủ 3 bước
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-xs bg-amber-500/40" /> Đang làm
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-xs border border-line bg-bg" /> Trống
                </span>
              </div>
            </div>
          </section>

          {/* TỔNG QUAN SỔ TAY LỖI SAI */}
          <section className="rounded-2xl border border-line bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-ink">
                <AlertTriangle size={16} className="text-brand-hover" />
                Phân bổ lỗi sai đã ghi nhận ({errorStats.total} lỗi)
              </div>
              <span className="text-xs text-muted">
                Tổng số bài đã lưu: <b className="text-ink">{submissions.length}</b>
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ERROR_GROUPS.map((g) => {
                const count = errorStats[g.key];
                const pct =
                  errorStats.total > 0 ? Math.round((count / errorStats.total) * 100) : 0;
                return (
                  <div key={g.key} className="rounded-xl border border-line bg-bg p-3.5">
                    <div className="text-xs font-semibold text-muted">{g.label}</div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-xl font-extrabold text-ink">{count} lỗi</span>
                      <span className="text-xs font-bold text-brand-hover">{pct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-card">
                      <div className={`h-full rounded-full ${g.barCls}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
