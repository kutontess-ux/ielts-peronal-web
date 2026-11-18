"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  Clock,
  Flame,
  Layers,
  Loader2,
  Repeat,
  Trophy,
  Volume2,
} from "lucide-react";
import { levelColor, type Word } from "@/lib/mock";
import {
  LEITNER_INTERVAL_DAYS,
  type LeitnerLevel,
} from "@/lib/srs";
import { speakWord } from "@/lib/tts";
import {
  getVnTodayKey,
  useStudyHistory,
  useStudySets,
} from "@/lib/study-sets";
import type { AtRiskWord } from "@/app/api/vocab/stats/route";
import { useMe } from "@/lib/use-me";

type StatsPayload = {
  reviewedToday: number;
  dailyReviewLimit: number;
  enrolledCount: number;
  reviewedEverCount: number;
  totalWords: number;
  masteredCount: number;
  levelCounts: Record<LeitnerLevel, number>;
  dueNowCount: number;
  dueSoonCount: number;
  atRiskWords: AtRiskWord[];
};

const LEVEL_META: {
  level: LeitnerLevel;
  title: string;
  interval: string;
  barCls: string;
  badgeCls: string;
}[] = [
  {
    level: 1,
    title: "Level 1",
    interval: `${LEITNER_INTERVAL_DAYS[1]} ngày`,
    barCls: "bg-rose-500",
    badgeCls: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
  {
    level: 2,
    title: "Level 2",
    interval: `${LEITNER_INTERVAL_DAYS[2]} ngày`,
    barCls: "bg-orange-500",
    badgeCls: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  },
  {
    level: 3,
    title: "Level 3",
    interval: `${LEITNER_INTERVAL_DAYS[3]} ngày`,
    barCls: "bg-amber-500",
    badgeCls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  {
    level: 4,
    title: "Level 4",
    interval: `${LEITNER_INTERVAL_DAYS[4]} ngày`,
    barCls: "bg-sky-500",
    badgeCls: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  {
    level: 5,
    title: "Level 5",
    interval: `${LEITNER_INTERVAL_DAYS[5]}+ ngày`,
    barCls: "bg-emerald-500",
    badgeCls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
];

function formatRelativeDue(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const absHours = Math.round(Math.abs(diffMs) / (60 * 60 * 1000));
  const absDays = Math.round(Math.abs(diffMs) / (24 * 60 * 60 * 1000));

  if (diffMs <= 0) {
    if (absHours < 1) return "Đến hạn ngay";
    if (absHours < 24) return `Quá hạn ${absHours} giờ`;
    return `Quá hạn ${absDays} ngày`;
  }
  if (absHours < 1) return "Còn dưới 1 giờ";
  if (absHours < 24) return `Còn ${absHours} giờ`;
  return `Còn ${absDays} ngày`;
}

export default function VocabStatsPage() {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | "overdue" | "due-soon" | "lapsed">("all");
  const [todayKey, setTodayKey] = useState("");
  const { isAdmin } = useMe();

  const studySets = useStudySets();
  const studyHistory = useStudyHistory();

  const loadStats = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/vocab/stats", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Không tải được thống kê");
      setData(j as StatsPayload);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setTodayKey(getVnTodayKey());
      void loadStats();
    });
    return () => cancelAnimationFrame(id);
  }, [loadStats]);

  const speak = (word: string) => {
    speakWord(word);
  };

  const setStats = useMemo(() => {
    const todayLogs = studyHistory.filter((h) => h.dateKey === todayKey);
    const uniqueAll = new Set(studyHistory.map((h) => h.setId ?? h.title));
    const uniqueToday = new Set(todayLogs.map((h) => h.setId ?? h.title));
    return {
      todaySessions: todayLogs.length,
      todayUniqueSets: uniqueToday.size,
      totalSessions: studyHistory.length,
      uniqueStudiedSets: uniqueAll.size,
    };
  }, [studyHistory, todayKey]);

  const filteredRiskWords = useMemo(() => {
    const list = data?.atRiskWords ?? [];
    if (riskFilter === "all") return list;
    return list.filter((w) => w.risk === riskFilter);
  }, [data, riskFilter]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/vocab"
            className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-muted transition hover:text-ink"
          >
            <ArrowLeft size={14} /> Quay lại Thẻ ghi nhớ
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BarChart3 size={24} className="text-brand-hover" /> Thống kê từ vựng
          </h1>
          <p className="text-sm text-muted">
            {isAdmin
              ? "Theo dõi tiến độ ôn tập hôm nay, học phần đã học, phân bố Level 1–5 và các từ sắp quên."
              : "Theo dõi tiến độ ôn tập hôm nay, học phần đã học và các từ cần chú ý."}
          </p>
        </div>

        <Link
          href="/vocab/review"
          className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
        >
          <Repeat size={15} /> Ôn tập ngay
        </Link>
      </div>

      {err && (
        <div className="rounded-2xl bg-rose-500/15 px-4 py-3 text-sm text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
          Lỗi tải thống kê: {err}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl bg-card p-8 text-muted">
          <Loader2 className="animate-spin" size={18} /> Đang tổng hợp số liệu...
        </div>
      ) : data ? (
        <>
          {/* 4 thẻ KPI tổng quan */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-line/60 bg-card p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-muted">
                <span>Hôm nay ôn lại</span>
                <Flame size={16} className="text-orange-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-ink">
                {data.reviewedToday} từ
              </div>
              <div className="mt-1 text-xs text-muted">
                Giới hạn ngày: {data.dailyReviewLimit} từ · Còn {data.dueNowCount} từ đến hạn
              </div>
            </div>

            <div className="rounded-2xl border border-line/60 bg-card p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-muted">
                <span>Học phần đã học</span>
                <Layers size={16} className="text-brand-hover" />
              </div>
              <div className="mt-2 text-2xl font-bold text-brand-hover">
                {setStats.todayUniqueSets} hôm nay
              </div>
              <div className="mt-1 text-xs text-muted">
                Tổng đã học: {setStats.uniqueStudiedSets}/{studySets.length} học phần ({setStats.totalSessions} lượt)
              </div>
            </div>

            <div className="rounded-2xl border border-line/60 bg-card p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-muted">
                <span>Từ đã học</span>
                <BookOpenCheck size={16} className="text-sky-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-sky-600 dark:text-sky-300">
                {data.reviewedEverCount} từ
              </div>
              <div className="mt-1 text-xs text-muted">
                Đang theo dõi: {data.enrolledCount} từ · Kho: {data.totalWords} từ
              </div>
            </div>

            <div className="rounded-2xl border border-line/60 bg-card p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-muted">
                <span>{isAdmin ? "Thành thạo (Level 5)" : "Từ đã thành thạo"}</span>
                <Trophy size={16} className="text-emerald-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-300">
                {data.masteredCount} từ
              </div>
              <div className="mt-1 text-xs text-muted">
                {data.enrolledCount > 0
                  ? `${Math.round((data.masteredCount / data.enrolledCount) * 100)}% số từ đang học`
                  : "Chưa có từ nào trong lộ trình"}
              </div>
            </div>
          </section>

          {/* Phân bố Leitner Level 1 - 5 (chỉ Admin xem) */}
          {isAdmin && (
            <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold">Phân bố Level 1 – 5 (Leitner)</h2>
                  <p className="text-xs text-muted">
                    Trả lời đúng sẽ lên Level và giãn lịch ôn; trả lời sai sẽ quay về Level 1.
                  </p>
                </div>
                <span className="rounded-full bg-bg px-3 py-1 text-xs font-bold text-muted">
                  Tổng đang học: {data.enrolledCount} từ
                </span>
              </div>

              <div className="space-y-3">
                {LEVEL_META.map((m) => {
                  const count = data.levelCounts[m.level] ?? 0;
                  const pct =
                    data.enrolledCount > 0
                      ? Math.round((count / data.enrolledCount) * 100)
                      : 0;
                  return (
                    <div key={m.level} className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 font-bold ${m.badgeCls}`}>
                            {m.title}
                          </span>
                          <span className="text-muted">Chu kỳ {m.interval}</span>
                        </div>
                        <div className="font-bold text-ink">
                          {count} từ <span className="font-normal text-muted">({pct}%)</span>
                        </div>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-bg">
                        <div
                          className={`h-full rounded-full transition-all ${m.barCls}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Danh sách từ sắp quên */}
          <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <AlertTriangle size={18} className="text-orange-500" /> Từ sắp quên
                </h2>
                <p className="text-xs text-muted">
                  {isAdmin
                    ? `Gồm từ đã đến hạn (${data.dueNowCount}), sắp đến hạn trong 48h (${data.dueSoonCount}) hoặc từng quên nhiều lần.`
                    : `Gồm các từ cần ôn (${data.dueNowCount}) và từ bạn dễ quên.`}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["all", `Tất cả (${data.atRiskWords.length})`],
                    ["overdue", "Đã đến hạn"],
                    ["due-soon", isAdmin ? "Sắp đến hạn (48h)" : "Sắp ôn"],
                    ["lapsed", "Từng quên"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRiskFilter(key)}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                      riskFilter === key
                        ? "bg-ink text-bg"
                        : "bg-bg text-muted hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredRiskWords.length === 0 ? (
              <div className="rounded-2xl bg-bg p-6 text-center text-sm text-muted">
                Không có từ nào sắp quên trong nhóm này.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRiskWords.map((w) => {
                  const lvBadge =
                    LEVEL_META.find((m) => m.level === w.level_srs)?.badgeCls ??
                    "bg-bg text-muted";
                  const memberRiskLabel =
                    w.risk === "overdue"
                      ? "Cần ôn ngay"
                      : w.risk === "due-soon"
                        ? "Sắp ôn"
                        : "Cần chú ý";
                  return (
                    <div
                      key={w.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line/60 bg-bg/60 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-ink">{w.word}</span>
                          <button
                            type="button"
                            title="Nghe phát âm"
                            onClick={() => speak(w.word)}
                            className="rounded-full p-1 text-muted hover:bg-card hover:text-ink"
                          >
                            <Volume2 size={14} />
                          </button>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${levelColor[w.level as Word["level"]] ?? ""}`}>
                            {w.level}
                          </span>
                          {isAdmin && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${lvBadge}`}>
                              Lv.{w.level_srs}
                            </span>
                          )}
                          {w.lapses > 0 && (
                            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                              Quên {w.lapses} lần
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted">{w.vi}</div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            w.risk === "overdue"
                              ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                              : w.risk === "due-soon"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : "bg-card text-muted"
                          }`}
                        >
                          <Clock size={11} />{" "}
                          {isAdmin ? formatRelativeDue(w.next_review_at) : memberRiskLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Lịch sử học học phần gần đây */}
          {studyHistory.length > 0 && (
            <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
              <h2 className="mb-3 text-lg font-bold">Lịch sử học học phần gần đây</h2>
              <div className="space-y-2">
                {studyHistory.slice(0, 10).map((h) => (
                  <div
                    key={h.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg/60 px-3.5 py-2.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-ink">{h.title}</span>
                      <span className="ml-2 text-muted">{h.wordCount} thẻ</span>
                    </div>
                    <span className="text-muted">
                      {h.dateKey === todayKey ? "Hôm nay" : h.dateKey}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
