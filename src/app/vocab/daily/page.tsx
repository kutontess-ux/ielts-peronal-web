"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, ExternalLink, GraduationCap, History, Loader2, Newspaper, Volume2 } from "lucide-react";
import { levelColor } from "@/lib/mock";
import { notifyDueUpdated } from "@/lib/due-events";
import ExportButton from "@/components/ExportPanel";
import type { DailyGroup, DailyWord } from "@/app/api/daily/route";

type Mode = "today" | "yesterday" | "7d" | "custom";

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
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Newspaper size={19} strokeWidth={1.6} className="text-brand-hover" />
          <h2 className="text-lg font-bold">{news.length} từ từ báo mới</h2>
          {news.length > 0 && (
            <div className="ml-auto">
              <ExportButton words={news} filename={`tu-bao-${date}`} label={`Xuất ${news.length} từ`} />
            </div>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {news.map((w) => (
            <div key={w.id} className="rounded-2xl bg-card p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xl font-bold">
                  {w.word}
                  <span className="text-sm font-normal text-muted">
                    {w.ipa} · {w.pos}
                  </span>
                  <button onClick={() => speak(w.word)} title="Phát âm" className="text-muted hover:text-white">
                    <Volume2 size={17} />
                  </button>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${levelColor[w.level]}`}>{w.level}</span>
              </div>
              <div className="mt-1 font-semibold text-brand-hover">{w.vi}</div>
              <div className="mt-1 text-xs text-muted">{w.en}</div>
              {(w.source_sentence || w.example) && (
                <div className="mt-3 rounded-xl bg-bg/60 p-3 text-sm italic text-muted">
                  “{w.source_sentence || w.example}”
                </div>
              )}
              {w.article_url && (
                <a
                  href={w.article_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-brand-hover hover:underline"
                >
                  {w.article_title || "Xem bài báo gốc"} <ExternalLink size={12} />
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <GraduationCap size={19} strokeWidth={1.6} className="text-brand-hover" />
          <h2 className="text-lg font-bold">{ielts.length} từ IELTS</h2>
          {ielts.length > 0 && (
            <div className="ml-auto">
              <ExportButton words={ielts} filename={`tu-ielts-${date}`} label={`Xuất ${ielts.length} từ`} />
            </div>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {ielts.map((w) => (
            <div key={w.id} className="rounded-2xl bg-card p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xl font-bold">
                  {w.word}
                  <span className="text-sm font-normal text-muted">
                    {w.ipa} · {w.pos}
                  </span>
                  <button onClick={() => speak(w.word)} title="Phát âm" className="text-muted hover:text-white">
                    <Volume2 size={17} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${levelColor[w.level]}`}>{w.level}</span>
                  <span className="rounded-full bg-line px-3 py-1 text-xs font-semibold">{w.topic}</span>
                </div>
              </div>
              <div className="mt-1 font-semibold text-brand-hover">{w.vi}</div>
              <div className="mt-2 text-sm text-muted">{w.en}</div>
              {w.example && (
                <div className="mt-3 rounded-xl bg-bg/60 p-3 text-sm italic text-muted">“{w.example}”</div>
              )}
            </div>
          ))}
        </div>
      </section>
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
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");

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

      // Chỉ gọi POST (đọc RSS + AI) đúng 1 lần trong ngày nếu hôm nay chưa có từ nào
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
      setToday(j.today);
      setYesterday(j.yesterday);
      setGroups(j.groups ?? []);
      setHistory(j.history ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  const switchMode = (next: Mode, customDate?: string) => {
    setMode(next);
    if (next === "today") loadDay(today || undefined);
    else if (next === "yesterday") loadDay(yesterday);
    else if (next === "7d") load7Days();
    else if (next === "custom" && customDate) loadDay(customDate);
  };

  const speak = (word: string) => {
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-GB";
    speechSynthesis.speak(u);
  };

  const allSingle = [...news, ...ielts];
  const all7d = groups.flatMap((g) => [...g.news, ...g.ielts]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">Từ vựng hằng ngày</h1>
          <p className="text-muted">
            {mode === "7d"
              ? `Tổng hợp 7 ngày qua · ${all7d.length} từ đã lưu`
              : date
                ? `Ngày ${date} · 5 từ báo & 5 từ IELTS (chỉ tạo 1 lần/ngày)`
                : "Đang tải..."}
          </p>
        </div>

        {mode !== "7d" && allSingle.length > 0 && (
          <ExportButton words={allSingle} filename={`tu-hang-ngay-${date}`} label="Xuất văn bản (Quizlet)" />
        )}
        {mode === "7d" && all7d.length > 0 && (
          <ExportButton words={all7d} filename="tu-hang-ngay-7-ngay" label={`Xuất cả ${all7d.length} từ (7 ngày)`} />
        )}
      </div>

      {/* Thanh lịch sử nhanh: Hôm nay | Hôm qua | 7 ngày qua | Chọn ngày */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => switchMode("today")}
          className={`rounded-full px-5 py-2 text-sm font-bold transition ${
            mode === "today" ? "bg-white text-bg" : "bg-card text-muted hover:text-white"
          }`}
        >
          Hôm nay
        </button>
        <button
          onClick={() => switchMode("yesterday")}
          className={`rounded-full px-5 py-2 text-sm font-bold transition ${
            mode === "yesterday" ? "bg-white text-bg" : "bg-card text-muted hover:text-white"
          }`}
        >
          Hôm qua
        </button>
        <button
          onClick={() => switchMode("7d")}
          className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold transition ${
            mode === "7d" ? "bg-white text-bg" : "bg-card text-muted hover:text-white"
          }`}
        >
          <History size={15} /> 7 ngày qua
        </button>

        {history.length > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm">
            <Calendar size={15} className="text-muted" />
            <select
              value={mode === "7d" ? "" : date}
              onChange={(e) => e.target.value && switchMode("custom", e.target.value)}
              className="bg-transparent outline-none"
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
            <div className="font-bold text-white">
              {generating ? "Đang tạo 10 từ vựng hôm nay..." : "Đang tải dữ liệu..."}
            </div>
            <div className="text-sm">
              {generating
                ? "Agent đang đọc RSS báo BBC/Guardian, lọc trùng với kho và bổ sung nghĩa (chỉ chạy 1 lần trong ngày)."
                : "Đang lấy danh sách từ đã lưu từ Supabase."}
            </div>
          </div>
        </div>
      )}

      {err && <div className="rounded-xl bg-rose-400/15 p-4 text-sm text-rose-300">Lỗi tải từ hằng ngày: {err}</div>}

      {!loading && !err && mode !== "7d" && (
        allSingle.length === 0 ? (
          <div className="rounded-2xl bg-card p-10 text-center text-muted">
            Ngày <b className="text-white">{date}</b> chưa có từ vựng hằng ngày nào được lưu.
          </div>
        ) : (
          <WordCards news={news} ielts={ielts} date={date} speak={speak} />
        )
      )}

      {!loading && !err && mode === "7d" && (
        groups.length === 0 ? (
          <div className="rounded-2xl bg-card p-10 text-center text-muted">
            Trong 7 ngày qua chưa có dữ liệu từ vựng hằng ngày.
          </div>
        ) : (
          <div className="space-y-10">
            {groups.map((g) => {
              const dayTotal = g.news.length + g.ielts.length;
              return (
                <div key={g.date} className="space-y-4 rounded-3xl border border-line bg-card/40 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                    <div className="text-lg font-bold">
                      {g.date === today ? `${g.date} (Hôm nay)` : g.date === yesterday ? `${g.date} (Hôm qua)` : g.date}
                      <span className="ml-2 text-sm font-medium text-muted">({dayTotal} từ)</span>
                    </div>
                    <ExportButton words={[...g.news, ...g.ielts]} filename={`tu-hang-ngay-${g.date}`} label={`Xuất ${dayTotal} từ`} />
                  </div>
                  <WordCards news={g.news} ielts={g.ielts} date={g.date} speak={speak} />
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
