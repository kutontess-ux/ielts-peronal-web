"use client";

import { useCallback, useEffect, useState } from "react";
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
  Sparkles,
  Volume2,
} from "lucide-react";
import { levelColor } from "@/lib/mock";
import { notifyDueUpdated, notifySettingsUpdated } from "@/lib/due-events";
import ExportButton from "@/components/ExportPanel";
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

export default function Daily() {
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

  const generateToday = useCallback(async () => {
    setLoading(true);
    setGenerating(true);
    setErr("");
    try {
      const pr = await fetch("/api/daily", { method: "POST" });
      const pj = await pr.json();
      if (!pr.ok) throw new Error(pj.error);
      setNews(pj.news ?? []);
      setIelts(pj.ielts ?? []);
      setHistory((h) => (h.includes(pj.date) ? h : [pj.date, ...h]));
      if (pj.generated) notifyDueUpdated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  }, []);

  const loadDay = useCallback(async (targetDate?: string) => {
    setLoading(true);
    setErr("");
    try {
      const qs = targetDate ? `?date=${encodeURIComponent(targetDate)}` : "";
      const r = await fetch(`/api/daily${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);

      setDate(j.date);
      setToday(j.today);
      setYesterday(j.yesterday);
      setHistory(j.history ?? []);
      if (typeof j.dailyEnabled === "boolean") {
        setDailyEnabled(j.dailyEnabled);
      }

      // Chỉ tự động gọi POST (đọc RSS + AI) nếu user đang bật nhận từ hằng ngày và hôm nay chưa đủ 10 từ
      if (j.needsGenerate) {
        setGenerating(true);
        const pr = await fetch("/api/daily", { method: "POST" });
        const pj = await pr.json();
        if (!pr.ok) throw new Error(pj.error);
        setNews(pj.news ?? []);
        setIelts(pj.ielts ?? []);
        setHistory((h) => (h.includes(pj.date) ? h : [pj.date, ...h]));
        if (pj.generated) notifyDueUpdated();
      } else {
        setNews(j.news ?? []);
        setIelts(j.ielts ?? []);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  }, []);

  const load7Days = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/daily?range=7d", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const nextGroups = (j.groups ?? []) as DailyGroup[];
      setToday(j.today);
      setYesterday(j.yesterday);
      if (typeof j.dailyEnabled === "boolean") {
        setDailyEnabled(j.dailyEnabled);
      }
      setGroups(nextGroups);
      setOpenDates(new Set(nextGroups[0] ? [nextGroups[0].date] : []));
      setHistory(j.history ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void loadDay();
    });
    return () => cancelAnimationFrame(id);
  }, [loadDay]);

  const switchMode = (next: Mode, customDate?: string) => {
    setMode(next);
    if (next === "today") loadDay(today || undefined);
    else if (next === "yesterday") loadDay(yesterday);
    else if (next === "7d") load7Days();
    else if (next === "custom" && customDate) loadDay(customDate);
  };

  const speak = (word: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-GB";
    speechSynthesis.speak(u);
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

        {history.length > 0 && (
          <div className="flex w-full items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm sm:ml-auto sm:w-auto">
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
