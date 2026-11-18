"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  Calendar,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  History,
  Loader2,
  Newspaper,
  RefreshCw,
  Sparkles,
  Volume2,
} from "lucide-react";
import { levelColor } from "@/lib/mock";
import { notifyDueUpdated, notifySettingsUpdated } from "@/lib/due-events";
import {
  getTodayVNClient,
  readDailyClientCache,
  saveDaily7dCache,
  saveDailyDayCache,
  upsertDailyCacheMeta,
} from "@/lib/daily-cache";
import { useMe } from "@/lib/use-me";
import ExportButton from "@/components/ExportPanel";
import { speakWord } from "@/lib/tts";
import { VoiceSettingsButton } from "@/components/VoiceSettingsModal";
import type { DailyGroup, DailyWord } from "@/app/api/daily/route";

type Mode = "today" | "yesterday" | "7d" | "custom";

function DailyFlipCard({
  w,
  kind,
  speak,
}: {
  w: DailyWord;
  kind: "news" | "ielts";
  speak: (word: string) => void;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={flipped ? `Úp thẻ ${w.word}` : `Lật thẻ ${w.word}`}
      onClick={() => setFlipped((prev) => !prev)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setFlipped((prev) => !prev);
        }
      }}
      className="group cursor-pointer select-none [perspective:1000px] focus:outline-none"
    >
      <div
        className={`grid h-full transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        {/* Mặt trước: chỉ hiển thị từ vựng, cấp độ CEFR và nút phát âm */}
        <div
          className={`col-start-1 row-start-1 flex min-h-[168px] flex-col justify-between rounded-2xl border-2 border-line/70 bg-card p-3.5 transition-colors group-hover:bg-card-hover dark:border-transparent sm:p-4 [backface-visibility:hidden] [transform:rotateY(0deg)] ${
            flipped ? "pointer-events-none" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-bg px-2.5 py-0.5 text-[11px] font-semibold text-muted">
              {kind === "news" ? <Newspaper size={11} /> : <GraduationCap size={11} />}
              {kind === "news" ? "Báo" : "IELTS"}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                title="Phát âm"
                onClick={(e) => {
                  e.stopPropagation();
                  speak(w.word);
                }}
                className="rounded-full p-1 text-muted hover:bg-bg hover:text-ink"
              >
                <Volume2 size={15} />
              </button>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${levelColor[w.level]}`}>
                {w.level}
              </span>
            </div>
          </div>

          <div className="my-2 flex flex-1 items-center justify-center px-1 text-center">
            <div className="break-words text-xl font-bold tracking-tight text-ink">{w.word}</div>
          </div>

          <div className="text-center text-[11px] font-medium text-muted/75">Bấm để lật</div>
        </div>

        {/* Mặt sau: đầy đủ nghĩa, IPA, ví dụ & link báo gốc */}
        <div
          className={`col-start-1 row-start-1 flex min-h-[168px] flex-col justify-between rounded-2xl border-2 border-line/70 bg-card p-3.5 transition-colors group-hover:bg-card-hover dark:border-transparent sm:p-4 [backface-visibility:hidden] [transform:rotateY(180deg)] ${
            flipped ? "" : "pointer-events-none"
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="break-words text-lg font-bold text-ink">{w.word}</div>
                <div className="break-words text-xs text-muted">
                  {w.ipa} · {w.pos}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  title="Phát âm"
                  onClick={(e) => {
                    e.stopPropagation();
                    speak(w.word);
                  }}
                  className="rounded-full p-1 text-muted hover:bg-bg hover:text-ink"
                >
                  <Volume2 size={15} />
                </button>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${levelColor[w.level]}`}>
                  {w.level}
                </span>
              </div>
            </div>

            <div className="mt-2 break-words text-sm font-semibold text-brand-hover">{w.vi}</div>
            <div className="mt-1 break-words text-xs leading-relaxed text-muted">{w.en}</div>
            {(w.source_sentence || w.example) && (
              <div className="mt-2.5 rounded-lg bg-bg/60 p-2.5 text-xs italic leading-relaxed text-muted break-words">
                “{w.source_sentence || w.example}”
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {w.topic && (
              <span className="rounded-full bg-line px-2.5 py-0.5 text-[11px] font-semibold">
                {w.topic}
              </span>
            )}
            {w.article_url && (
              <a
                href={w.article_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-hover hover:underline"
              >
                {w.article_title ? "Bài báo gốc" : "Xem bài báo"} <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WordCards({
  news,
  ielts,
  date,
  speak,
}: {
  news: DailyWord[];
  ielts: DailyWord[];
  date: string;
  speak: (w: string) => void;
}) {
  return (
    <div className="space-y-6">
      {news.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Newspaper size={18} strokeWidth={1.6} className="text-brand-hover" />
            <h2 className="text-base font-bold sm:text-lg">{news.length} từ từ báo mới</h2>
            <div className="ml-auto">
              <ExportButton words={news} filename={`tu-bao-${date}`} label={`Xuất ${news.length} từ`} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {news.map((w) => (
              <DailyFlipCard key={w.id} w={w} kind="news" speak={speak} />
            ))}
          </div>
        </section>
      )}

      {ielts.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <GraduationCap size={18} strokeWidth={1.6} className="text-brand-hover" />
            <h2 className="text-base font-bold sm:text-lg">{ielts.length} từ IELTS</h2>
            <div className="ml-auto">
              <ExportButton words={ielts} filename={`tu-ielts-${date}`} label={`Xuất ${ielts.length} từ`} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ielts.map((w) => (
              <DailyFlipCard key={w.id} w={w} kind="ielts" speak={speak} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type DailyDayApiResponse = {
  date: string;
  today: string;
  yesterday: string;
  dailyEnabled?: boolean;
  needsGenerate?: boolean;
  news?: DailyWord[];
  ielts?: DailyWord[];
  history?: string[];
  error?: string;
};

type DailyPostApiResponse = {
  date: string;
  generated?: boolean;
  news?: DailyWord[];
  ielts?: DailyWord[];
  error?: string;
};

type Daily7dApiResponse = {
  today: string;
  yesterday: string;
  dailyEnabled?: boolean;
  groups?: DailyGroup[];
  history?: string[];
  error?: string;
};

// Gộp các request trùng nhau nếu chuyển tab/trang trong lúc đang tải hoặc tạo từ
const inflightDayMap = new Map<string, Promise<DailyDayApiResponse>>();
let inflight7dPromise: Promise<Daily7dApiResponse> | null = null;
let inflightPostPromise: Promise<DailyPostApiResponse> | null = null;

function runPostDaily(): Promise<DailyPostApiResponse> {
  if (inflightPostPromise) return inflightPostPromise;
  inflightPostPromise = fetch("/api/daily", { method: "POST" })
    .then(async (pr) => {
      const pj = (await pr.json()) as DailyPostApiResponse;
      if (!pr.ok) throw new Error(pj.error || "Không tạo được từ hằng ngày");
      return pj;
    })
    .finally(() => {
      inflightPostPromise = null;
    });
  return inflightPostPromise;
}

export default function Daily() {
  const { me } = useMe();
  const userId = me?.profile.id ?? null;

  const [mode, setMode] = useState<Mode>("today");
  const [date, setDate] = useState<string>("");
  const [today, setToday] = useState<string>("");
  const [yesterday, setYesterday] = useState<string>("");
  const [news, setNews] = useState<DailyWord[]>([]);
  const [ielts, setIelts] = useState<DailyWord[]>([]);
  const [groups, setGroups] = useState<DailyGroup[]>([]);
  const [openDates, setOpenDates] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<string[]>([]);
  const [dailyEnabled, setDailyEnabled] = useState(true);
  const [togglingDaily, setTogglingDaily] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyDayState = useCallback(
    (
      day: string,
      entryNews: DailyWord[],
      entryIelts: DailyWord[],
      meta: {
        today: string;
        yesterday: string;
        history: string[];
        dailyEnabled?: boolean;
      }
    ) => {
      if (!mountedRef.current) return;
      setDate(day);
      setToday(meta.today);
      setYesterday(meta.yesterday);
      setHistory(meta.history);
      if (typeof meta.dailyEnabled === "boolean") {
        setDailyEnabled(meta.dailyEnabled);
      }
      setNews(entryNews);
      setIelts(entryIelts);
    },
    []
  );

  const generateToday = useCallback(async () => {
    setLoading(true);
    setGenerating(true);
    setErr("");
    try {
      const pj = await runPostDaily();
      const nextNews = pj.news ?? [];
      const nextIelts = pj.ielts ?? [];
      const cachedBefore = readDailyClientCache(userId);
      const nextToday = pj.date || cachedBefore?.today || getTodayVNClient();
      const nextYesterday = cachedBefore?.yesterday || "";
      const prevHist = cachedBefore?.history ?? [];
      const nextHistory = prevHist.includes(pj.date) ? prevHist : [pj.date, ...prevHist];

      saveDailyDayCache(
        { date: pj.date, news: nextNews, ielts: nextIelts },
        {
          userId,
          today: nextToday,
          yesterday: nextYesterday,
          history: nextHistory,
          autoGenTriedToday: true,
          invalidate7d: true,
        }
      );

      if (mountedRef.current) {
        setDate(pj.date);
        setToday(nextToday);
        setNews(nextNews);
        setIelts(nextIelts);
        setHistory((h) => (h.includes(pj.date) ? h : [pj.date, ...h]));
      }
      if (pj.generated) notifyDueUpdated();
    } catch (e) {
      if (mountedRef.current) setErr((e as Error).message);
    } finally {
      if (mountedRef.current) {
        setGenerating(false);
        setLoading(false);
      }
    }
  }, [userId]);

  const loadDay = useCallback(
    async (targetDate?: string, force = false) => {
      const cached = readDailyClientCache(userId);
      const lookupDay = targetDate || cached?.today || getTodayVNClient();
      const cachedEntry = cached?.days[lookupDay];

      if (!force && cached && cachedEntry) {
        const isPastDay = lookupDay !== cached.today;
        const isCompleteToday =
          cachedEntry.news.length >= 5 && cachedEntry.ielts.length >= 5;
        const shouldSkipFetch =
          isPastDay || isCompleteToday || !cached.dailyEnabled || Boolean(cached.autoGenTriedToday);

        if (shouldSkipFetch) {
          applyDayState(cachedEntry.date, cachedEntry.news, cachedEntry.ielts, {
            today: cached.today,
            yesterday: cached.yesterday,
            history: cached.history,
            dailyEnabled: cached.dailyEnabled,
          });
          if (mountedRef.current) {
            setErr("");
            setGenerating(false);
            setLoading(false);
          }
          return;
        }
      }

      if (mountedRef.current) {
        setLoading(true);
        setErr("");
      }

      try {
        const qs = targetDate ? `?date=${encodeURIComponent(targetDate)}` : "";
        const reqKey = `${userId ?? "anon"}:${targetDate || "today"}`;
        let reqPromise = !force ? inflightDayMap.get(reqKey) : undefined;
        if (!reqPromise) {
          reqPromise = fetch(`/api/daily${qs}`, { cache: "no-store" })
            .then(async (r) => {
              const j = (await r.json()) as DailyDayApiResponse;
              if (!r.ok) throw new Error(j.error || "Không tải được từ hằng ngày");
              return j;
            })
            .finally(() => {
              inflightDayMap.delete(reqKey);
            });
          inflightDayMap.set(reqKey, reqPromise);
        }

        const j = await reqPromise;
        const dayHistory = j.history ?? [];

        // Chỉ tự động gọi POST (đọc RSS + AI) nếu user đang bật nhận từ hằng ngày,
        // hôm nay chưa đủ 10 từ và trong phiên này chưa tự chạy tạo trùng.
        const shouldAutoGenerate =
          Boolean(j.needsGenerate) && (!cached?.autoGenTriedToday || force);

        if (shouldAutoGenerate) {
          if (mountedRef.current) setGenerating(true);
          const pj = await runPostDaily();
          const nextNews = pj.news ?? [];
          const nextIelts = pj.ielts ?? [];
          const nextHistory = dayHistory.includes(pj.date) ? dayHistory : [pj.date, ...dayHistory];

          saveDailyDayCache(
            { date: pj.date, news: nextNews, ielts: nextIelts },
            {
              userId,
              today: j.today,
              yesterday: j.yesterday,
              dailyEnabled: j.dailyEnabled,
              history: nextHistory,
              autoGenTriedToday: true,
              invalidate7d: true,
            }
          );

          applyDayState(pj.date, nextNews, nextIelts, {
            today: j.today,
            yesterday: j.yesterday,
            history: nextHistory,
            dailyEnabled: j.dailyEnabled,
          });
          if (pj.generated) notifyDueUpdated();
        } else {
          const nextNews = j.news ?? [];
          const nextIelts = j.ielts ?? [];

          saveDailyDayCache(
            { date: j.date, news: nextNews, ielts: nextIelts },
            {
              userId,
              today: j.today,
              yesterday: j.yesterday,
              dailyEnabled: j.dailyEnabled,
              history: dayHistory,
            }
          );

          applyDayState(j.date, nextNews, nextIelts, {
            today: j.today,
            yesterday: j.yesterday,
            history: dayHistory,
            dailyEnabled: j.dailyEnabled,
          });
        }
      } catch (e) {
        if (mountedRef.current) setErr((e as Error).message);
      } finally {
        if (mountedRef.current) {
          setGenerating(false);
          setLoading(false);
        }
      }
    },
    [applyDayState, userId]
  );

  const load7Days = useCallback(
    async (force = false) => {
      const cached = readDailyClientCache(userId);
      if (!force && cached?.range7d) {
        if (mountedRef.current) {
          setToday(cached.today);
          setYesterday(cached.yesterday);
          setDailyEnabled(cached.dailyEnabled);
          setGroups(cached.range7d);
          setOpenDates(new Set(cached.range7d[0] ? [cached.range7d[0].date] : []));
          setHistory(cached.history);
          setErr("");
          setLoading(false);
        }
        return;
      }

      if (mountedRef.current) {
        setLoading(true);
        setErr("");
      }

      try {
        if (force || !inflight7dPromise) {
          inflight7dPromise = fetch("/api/daily?range=7d", { cache: "no-store" })
            .then(async (r) => {
              const j = (await r.json()) as Daily7dApiResponse;
              if (!r.ok) throw new Error(j.error || "Không tải được dữ liệu 7 ngày");
              return j;
            })
            .finally(() => {
              inflight7dPromise = null;
            });
        }

        const j = await inflight7dPromise;
        const nextGroups = j.groups ?? [];
        const nextHistory = j.history ?? [];

        saveDaily7dCache(nextGroups, {
          userId,
          today: j.today,
          yesterday: j.yesterday,
          dailyEnabled: j.dailyEnabled,
          history: nextHistory,
        });

        if (mountedRef.current) {
          setToday(j.today);
          setYesterday(j.yesterday);
          if (typeof j.dailyEnabled === "boolean") {
            setDailyEnabled(j.dailyEnabled);
          }
          setGroups(nextGroups);
          setOpenDates(new Set(nextGroups[0] ? [nextGroups[0].date] : []));
          setHistory(nextHistory);
        }
      } catch (e) {
        if (mountedRef.current) setErr((e as Error).message);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [userId]
  );

  const toggleDailySetting = async (nextVal?: boolean) => {
    if (togglingDaily) return;
    const target = typeof nextVal === "boolean" ? nextVal : !dailyEnabled;
    setTogglingDaily(true);
    setErr("");
    try {
      const r = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_daily_vocab: target }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Không lưu được cài đặt");
      setDailyEnabled(target);
      if (today) {
        upsertDailyCacheMeta({
          userId,
          today,
          yesterday,
          dailyEnabled: target,
        });
      }
      notifySettingsUpdated({ notify_daily_vocab: target });

      if (target && mode === "today" && (news.length < 5 || ielts.length < 5)) {
        await generateToday();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setTogglingDaily(false);
    }
  };

  const modeRef = useRef<Mode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (modeRef.current === "today") {
        void loadDay();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [loadDay]);

  const switchMode = (next: Mode, customDate?: string) => {
    setMode(next);
    if (next === "today") void loadDay(today || undefined);
    else if (next === "yesterday") void loadDay(yesterday || undefined);
    else if (next === "7d") void load7Days();
    else if (next === "custom" && customDate) void loadDay(customDate);
  };

  const refreshCurrent = () => {
    if (mode === "7d") void load7Days(true);
    else if (mode === "yesterday") void loadDay(yesterday || undefined, true);
    else if (mode === "custom" && date) void loadDay(date, true);
    else void loadDay(today || undefined, true);
  };

  const speak = (word: string) => {
    speakWord(word);
  };

  const toggleDayGroup = (d: string) => {
    setOpenDates((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const allSingle = [...news, ...ielts];
  const all7d = groups.flatMap((g) => [...g.news, ...g.ielts]);
  const allDaysExpanded = groups.length > 0 && groups.every((g) => openDates.has(g.date));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">Từ vựng hằng ngày</h1>
          <p className="text-sm text-muted">
            {mode === "7d"
              ? `Tổng hợp 7 ngày qua · ${all7d.length} từ đã lưu · Bấm thẻ để lật xem nghĩa`
              : date
                ? `Ngày ${date} · 5 từ báo & 5 từ IELTS riêng của bạn · Bấm thẻ để lật xem nghĩa`
                : "Đang tải..."}
          </p>
        </div>

        <VoiceSettingsButton variant="compact" />

        <button
          type="button"
          disabled={togglingDaily || loading}
          onClick={() => toggleDailySetting()}
          title={
            dailyEnabled
              ? "Bấm để ngừng nhận thông báo và tắt tự động tìm từ mỗi ngày"
              : "Bấm để bật lại thông báo và tự động tìm 10 từ mỗi ngày"
          }
          className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${
            dailyEnabled
              ? "border-line bg-card text-muted hover:border-rose-400/50 hover:text-rose-500"
              : "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
          }`}
        >
          {dailyEnabled ? <BellOff size={14} /> : <Bell size={14} />}
          {dailyEnabled ? "Ngừng nhận thông báo" : "Đã tắt thông báo · Bật lại"}
        </button>

        {mode !== "7d" && allSingle.length > 0 && (
          <ExportButton words={allSingle} filename={`tu-hang-ngay-${date}`} label="Xuất văn bản (Quizlet)" />
        )}
        {mode === "7d" && all7d.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {groups.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setOpenDates(allDaysExpanded ? new Set() : new Set(groups.map((g) => g.date)))
                }
                className="rounded-full border border-line bg-card px-4 py-2 text-xs font-semibold text-muted transition hover:border-brand hover:text-ink"
              >
                {allDaysExpanded ? "Thu gọn tất cả" : "Mở tất cả"}
              </button>
            )}
            <ExportButton words={all7d} filename="tu-hang-ngay-7-ngay" label={`Xuất cả ${all7d.length} từ (7 ngày)`} />
          </div>
        )}
      </div>

      {/* Thanh lịch sử nhanh: Hôm nay | Hôm qua | 7 ngày qua | Chọn ngày */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => switchMode("today")}
          className={`rounded-full px-5 py-2 text-sm font-bold transition ${
            mode === "today" ? "bg-ink text-bg" : "bg-card text-muted hover:text-ink"
          }`}
        >
          Hôm nay
        </button>
        <button
          onClick={() => switchMode("yesterday")}
          className={`rounded-full px-5 py-2 text-sm font-bold transition ${
            mode === "yesterday" ? "bg-ink text-bg" : "bg-card text-muted hover:text-ink"
          }`}
        >
          Hôm qua
        </button>
        <button
          onClick={() => switchMode("7d")}
          className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold transition ${
            mode === "7d" ? "bg-ink text-bg" : "bg-card text-muted hover:text-ink"
          }`}
        >
          <History size={15} /> 7 ngày qua
        </button>

        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          {history.length > 0 && (
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm sm:flex-initial">
              <Calendar size={15} className="shrink-0 text-muted" />
              <select
                value={mode === "7d" ? "" : date}
                onChange={(e) => e.target.value && switchMode("custom", e.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none sm:flex-initial"
              >
                <option value="" disabled>
                  Chọn ngày trong lịch sử...
                </option>
                {history.map((d) => (
                  <option key={d} value={d}>
                    {d === today ? `${d} (Hôm nay)` : d === yesterday ? `${d} (Hôm qua)` : d}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={refreshCurrent}
            disabled={loading}
            title="Làm mới dữ liệu từ máy chủ"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-2 text-xs font-semibold text-muted transition hover:border-brand hover:text-ink disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-3 rounded-2xl bg-card p-8 text-muted">
          <Loader2 className="animate-spin text-brand-hover" size={22} />
          <div>
            <div className="font-bold text-ink">
              {generating ? "Đang tạo 10 từ vựng hôm nay..." : "Đang tải dữ liệu..."}
            </div>
            <div className="text-sm">
              {generating
                ? "Agent đang đọc RSS báo BBC/Guardian, lọc trùng theo lịch sử của bạn và bổ sung nghĩa (tính 1 lượt AI trong ngày)."
                : "Đang lấy danh sách từ đã lưu từ Supabase."}
            </div>
          </div>
        </div>
      )}

      {err && <div className="rounded-xl bg-rose-500/15 p-4 text-sm text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">Lỗi tải từ hằng ngày: {err}</div>}

      {!loading && !err && mode !== "7d" && (
        allSingle.length === 0 ? (
          date === today && !dailyEnabled ? (
            <div className="rounded-2xl border border-line bg-card p-8 text-center">
              <BellOff size={30} className="mx-auto text-muted" />
              <div className="mt-3 text-base font-bold text-ink">
                Bạn đang tắt thông báo & tự động tìm từ hằng ngày
              </div>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                Hệ thống sẽ không tự chạy AI hoặc gửi nhắc nhở khi bạn không có nhu cầu tìm từ mới. Bạn vẫn có thể tìm thủ công cho hôm nay bất cứ lúc nào.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  onClick={generateToday}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
                >
                  <Sparkles size={15} />
                  Tìm 10 từ hôm nay (1 lượt AI)
                </button>
                <button
                  type="button"
                  disabled={togglingDaily}
                  onClick={() => toggleDailySetting(true)}
                  className="rounded-full border border-line bg-bg px-5 py-2.5 text-sm font-bold text-muted hover:text-ink disabled:opacity-50"
                >
                  Bật lại tự tìm mỗi ngày
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-card p-10 text-center text-muted">
              Ngày <b className="text-ink">{date}</b> chưa có từ vựng hằng ngày nào được lưu.
            </div>
          )
        ) : (
          <div className="space-y-4">
            {date === today && !dailyEnabled && (news.length < 5 || ielts.length < 5) && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card/70 px-4 py-3 text-sm">
                <span className="text-muted">
                  Chế độ tự động tìm đang tắt · Hôm nay hiện có <b className="text-ink">{allSingle.length}/10</b> từ.
                </span>
                <button
                  type="button"
                  onClick={generateToday}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg"
                >
                  <Sparkles size={13} />
                  Tìm bù cho đủ 10 từ
                </button>
              </div>
            )}
            <WordCards news={news} ielts={ielts} date={date} speak={speak} />
          </div>
        )
      )}

      {!loading && !err && mode === "7d" && (
        groups.length === 0 ? (
          <div className="rounded-2xl bg-card p-10 text-center text-muted">
            Trong 7 ngày qua chưa có dữ liệu từ vựng hằng ngày.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => {
              const dayTotal = g.news.length + g.ielts.length;
              const isOpen = openDates.has(g.date);
              const dateLabel =
                g.date === today
                  ? `${g.date} (Hôm nay)`
                  : g.date === yesterday
                    ? `${g.date} (Hôm qua)`
                    : g.date;

              return (
                <div key={g.date} className="overflow-hidden rounded-2xl border border-line bg-card/40">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() => toggleDayGroup(g.date)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleDayGroup(g.date);
                      }
                    }}
                    className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-card/70"
                  >
                    <div className="flex items-center gap-2.5">
                      {isOpen ? (
                        <ChevronDown size={18} className="text-muted" />
                      ) : (
                        <ChevronRight size={18} className="text-muted" />
                      )}
                      <span className="text-base font-bold text-ink">{dateLabel}</span>
                      <span className="rounded-full bg-bg px-2.5 py-0.5 text-xs font-semibold text-muted">
                        {dayTotal} từ · {g.news.length} báo, {g.ielts.length} IELTS
                      </span>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <ExportButton words={[...g.news, ...g.ielts]} filename={`tu-hang-ngay-${g.date}`} label={`Xuất ${dayTotal} từ`} />
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-line p-5">
                      <WordCards news={g.news} ielts={g.ielts} date={g.date} speak={speak} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
