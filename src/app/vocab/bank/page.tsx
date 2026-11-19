"use client";

import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { CharacterLoader } from "@/components/CharacterLoader";
import { ArrowLeft, BookMarked, Bot, Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, Package, Repeat, RotateCcw, Search, Trash2, Upload, Volume2 } from "lucide-react";
import { LEVEL_INFO, levelColor, type Word } from "@/lib/mock";
import { topicIcon } from "@/lib/icons";
import { enrollWordsInSrs } from "@/lib/srs";
import { notifyDueUpdated } from "@/lib/due-events";
import { setActivityLabel } from "@/lib/activity";
import ExportButton from "@/components/ExportPanel";
import { BadgePickerModal, CardBadge, EditBadgeButton, useCardBadges } from "@/components/CardBadgePicker";
import { useMe } from "@/lib/use-me";
import BookSection from "./BookSection";
import { speakWord } from "@/lib/tts";

type Tab = "all" | "topic" | "level" | "book";
type Sel = { kind: "topic" | "level"; value: string } | null;
type Sort = "az" | "za" | "level-asc" | "level-desc";

const PAGE_SIZE = 30;
const LEVELS = ["A2", "B1", "B2", "C1", "C2"];
const LV: Record<string, number> = { A2: 0, B1: 1, B2: 2, C1: 3, C2: 4 };
const LEVEL_BAR: Record<string, string> = {
  A2: "bg-slate-400", B1: "bg-emerald-400", B2: "bg-sky-400", C1: "bg-violet-400", C2: "bg-pink-400",
};

type PreviewItem = {
  input: string; status: "new" | "duplicate" | "invalid"; lemma: string; norm_key?: string; existingId?: number;
  ipa?: string; pos?: string; meaning_vi?: string; definition_en?: string; example?: string;
  cefr_level?: string; topic?: string; is_awl?: boolean; collocations?: string[]; synonyms?: string[];
};
type Preview = {
  items: PreviewItem[];
  existingIds?: number[];
  summary: { total: number; new: number; duplicate: number; invalid: number };
};

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let p = start; p <= end; p++) pages.push(p);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

function WordCard({
  w,
  onDelete,
  picking,
  checked,
  onToggleSelect,
}: {
  w: Word;
  onDelete?: (w: Word) => void;
  picking: boolean;
  checked: boolean;
  onToggleSelect?: (id: number) => void;
}) {
  const [flipped, setFlipped] = useState(false);

  const handleActivate = () => {
    if (picking) {
      onToggleSelect?.(w.id);
    } else {
      setFlipped((prev) => !prev);
    }
  };

  const borderCls = checked
    ? "border-brand"
    : "border-line/70 dark:border-transparent";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={picking ? checked : flipped}
      aria-label={picking ? `Chọn ${w.word}` : flipped ? `Úp thẻ ${w.word}` : `Lật thẻ ${w.word}`}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
      className="group cursor-pointer select-none [perspective:1000px] focus:outline-none"
    >
      <div
        className={`grid h-full transition-transform duration-500 [transform-style:preserve-3d] ${
          !picking && flipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        {/* Mặt trước: chỉ hiển thị từ vựng và cấp độ CEFR */}
        <div
          className={`col-start-1 row-start-1 flex min-h-[168px] flex-col justify-between rounded-2xl border-2 bg-card p-3.5 transition-colors group-hover:bg-card-hover sm:p-4 [backface-visibility:hidden] [transform:rotateY(0deg)] ${borderCls} ${
            !picking && flipped ? "pointer-events-none" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              {picking && (
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleSelect?.(w.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 h-4 w-4 accent-brand"
                />
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                title="Phát âm"
                aria-label={`Phát âm ${w.word}`}
                onClick={(e) => {
                  e.stopPropagation();
                  speakWord(w.word);
                }}
                className="rounded-full p-1 text-muted transition hover:bg-bg hover:text-ink"
              >
                <Volume2 size={15} />
              </button>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${levelColor[w.level]}`}>{w.level}</span>
              {onDelete && !picking && (
                <button
                  type="button"
                  title="Xoá từ này"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(w);
                  }}
                  className="rounded-full p-1 text-muted opacity-0 transition hover:bg-rose-500/20 hover:text-rose-600 dark:hover:text-rose-300 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="my-2 flex flex-1 items-center justify-center px-1 text-center">
            <div className="break-words text-xl font-bold tracking-tight text-ink">{w.word}</div>
          </div>

          <div className="text-center text-[11px] font-medium text-muted/75">
            {picking ? "Bấm để chọn" : "Bấm để lật"}
          </div>
        </div>

        {/* Mặt sau: hiển thị đầy đủ thông tin từ vựng */}
        <div
          className={`col-start-1 row-start-1 flex min-h-[168px] flex-col justify-between rounded-2xl border-2 bg-card p-3.5 transition-colors group-hover:bg-card-hover sm:p-4 [backface-visibility:hidden] [transform:rotateY(180deg)] ${borderCls} ${
            !picking && flipped ? "" : "pointer-events-none"
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="break-words text-lg font-bold">{w.word}</div>
                <div className="break-words text-xs text-muted">{w.ipa} · {w.pos}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  title="Phát âm"
                  aria-label={`Phát âm ${w.word}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    speakWord(w.word);
                  }}
                  className="rounded-full p-1 text-muted transition hover:bg-bg hover:text-ink"
                >
                  <Volume2 size={15} />
                </button>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${levelColor[w.level]}`}>{w.level}</span>
                {onDelete && !picking && (
                  <button
                    type="button"
                    title="Xoá từ này"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(w);
                    }}
                    className="rounded-full p-1 text-muted opacity-0 transition hover:bg-rose-500/20 hover:text-rose-600 dark:hover:text-rose-300 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 break-words text-sm font-semibold text-brand-hover">{w.vi}</div>
            <div className="mt-1 break-words text-xs leading-relaxed text-muted">{w.en}</div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-line px-2.5 py-0.5 text-[11px] font-semibold">
              {createElement(topicIcon(w.topic), { size: 12, strokeWidth: 1.75 })} {w.topic}
            </span>
            {w.awl && <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[11px] font-bold text-orange-700 dark:bg-orange-400/20 dark:text-orange-300">AWL</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function WordGrid({
  list,
  onDelete,
  selectedIds,
  onToggleSelect,
  onTogglePage,
}: {
  list: Word[];
  onDelete?: (w: Word) => void;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onTogglePage?: (pageIds: number[], allSelected: boolean) => void;
}) {
  const listKey = useMemo(() => list.map((w) => w.id).join(","), [list]);
  const [pageState, setPageState] = useState<{ key: string; page: number }>({ key: listKey, page: 1 });

  if (list.length === 0) return <div className="py-10 text-center text-muted">Không tìm thấy từ nào.</div>;

  const picking = !!selectedIds;
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const rawPage = pageState.key === listKey ? pageState.page : 1;
  const page = Math.min(Math.max(1, rawPage), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, list.length);
  const paged = list.slice(start, end);

  const pageIds = paged.map((w) => w.id);
  const allPageSelected = picking && pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const pageNumbers = getPageNumbers(page, totalPages);

  const goPage = (nextPage: number) => {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    setPageState({ key: listKey, page: clamped });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          Hiển thị <b className="text-ink">{start + 1}–{end}</b> / {list.length} từ
          {totalPages > 1 && ` · Trang ${page}/${totalPages}`}
        </span>
        {picking && onTogglePage && (
          <button
            type="button"
            onClick={() => onTogglePage(pageIds, allPageSelected)}
            className="rounded-full border border-line bg-card px-3 py-1 font-semibold text-ink transition hover:border-brand"
          >
            {allPageSelected ? `Bỏ chọn ${paged.length} từ trang này` : `Chọn ${paged.length} từ trang này`}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {paged.map((w) => (
          <WordCard
            key={w.id}
            w={w}
            onDelete={onDelete}
            picking={picking}
            checked={selectedIds?.has(w.id) ?? false}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <nav aria-label="Phân trang kho từ vựng" className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <span className="text-xs text-muted">
            Trang {page} / {totalPages} ({PAGE_SIZE} từ/trang)
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              aria-label="Trang trước"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-brand disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Trước
            </button>
            {pageNumbers.map((item, idx) =>
              item === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-muted">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => goPage(item)}
                  aria-label={`Trang ${item}`}
                  aria-current={item === page ? "page" : undefined}
                  className={`min-w-[34px] rounded-full px-2.5 py-1.5 text-xs font-bold transition ${
                    item === page
                      ? "bg-brand text-white"
                      : "border border-line bg-card text-muted hover:border-brand hover:text-ink"
                  }`}
                >
                  {item}
                </button>
              )
            )}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              aria-label="Trang sau"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-brand disabled:opacity-40"
            >
              Sau <ChevronRight size={14} />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

function LevelBar({ list }: { list: Word[] }) {
  const total = list.length || 1;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-bg">
      {LEVELS.map((l) => (
        <div key={l} className={LEVEL_BAR[l]} style={{ width: `${(list.filter((w) => w.level === l).length / total) * 100}%` }} />
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${active ? "bg-brand text-white" : "bg-bg text-muted hover:text-ink"}`}>
      {children}
    </button>
  );
}

/* ---------- Nạp hàng loạt: dán -> agent kiểm tra -> duyệt -> lưu ---------- */
function ImportPanel({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "check" | "save" | "enroll">("");
  const [err, setErr] = useState("");
  const [prev, setPrev] = useState<Preview | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [done, setDone] = useState("");

  const check = async () => {
    setBusy("check"); setErr(""); setPrev(null); setDone("");
    try {
      const r = await fetch("/api/import/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setPrev(j); setOff(new Set());
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };

  const news = prev?.items.filter((i) => i.status === "new") ?? [];
  const chosen = news.filter((i) => !off.has(i.norm_key!));
  const existingIds = prev?.existingIds ?? [];

  const save = async () => {
    if (!prev) return;
    setBusy("save"); setErr("");
    try {
      const r = await fetch("/api/import/commit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: chosen, stats: { total: prev.summary.total, duplicates: prev.summary.duplicate, invalid: prev.summary.invalid } }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setDone(`Đã lưu ${j.added} từ mới vào kho cá nhân${j.skipped ? ` (bỏ qua ${j.skipped} từ trùng)` : ""}.`);
      setPrev(null); setText(""); onSaved(); notifyDueUpdated();
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };

  const enrollExisting = async () => {
    if (existingIds.length === 0 || busy !== "") return;
    setBusy("enroll"); setErr("");
    try {
      const res = await enrollWordsInSrs(existingIds);
      notifyDueUpdated();
      setDone(
        res.enrolled > 0
          ? res.deferred > 0
            ? `Đã chuyển ${res.enrolled} từ có sẵn vào Ôn tập (${res.deferred} từ được dời lịch sang từ ${res.scheduledFromDay ?? "ngày sau"} do hôm nay đã đủ chỉ tiêu).`
            : `Đã chuyển ${res.enrolled} từ có sẵn vào Ôn tập ngắt quãng (không tốn lượt AI).`
          : "Các từ có sẵn này đều đã nằm trong hàng đợi Ôn tập ngắt quãng của bạn."
      );
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy("");
  };

  return (
    <div className="space-y-4 rounded-2xl border-2 border-dashed border-brand-hover bg-card p-5">
      <div className="font-bold">Nạp từ cá nhân (dán danh sách từ hoặc cả đoạn văn)</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="h-32 w-full rounded-xl border border-line p-3 outline-none focus:border-brand-hover" placeholder={"sustainable\nmitigate\ncarbon footprint\n..."} />
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={check} disabled={!text.trim() || busy !== ""} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-40">
          {busy === "check" ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} strokeWidth={1.75} />}
          {busy === "check" ? "Agent đang kiểm tra..." : "Cho agent kiểm tra"}
        </button>
        <span className="text-sm text-muted">Từ đã có trong từ điển hệ thống được lấy miễn phí (0 lượt AI); chỉ từ mới hoàn toàn mới dùng AI. Tối đa 300 từ/lần.</span>
      </div>
      {err && <div className="rounded-xl bg-rose-500/15 p-3 text-sm text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">{err}</div>}
      {done && <div className="flex items-center gap-2 rounded-xl bg-emerald-500/15 p-3 text-sm text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"><Check size={16} /> {done}</div>}

      {prev && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-xl bg-emerald-500/15 p-3 dark:bg-emerald-400/15"><b className="text-lg text-emerald-700 dark:text-emerald-300">{prev.summary.new}</b><br />từ mới</div>
            <div className="rounded-xl bg-amber-500/15 p-3 dark:bg-amber-400/15"><b className="text-lg text-amber-700 dark:text-amber-300">{prev.summary.duplicate}</b><br />đã có trong kho cá nhân</div>
            <div className="rounded-xl bg-rose-500/15 p-3 dark:bg-rose-400/15"><b className="text-lg text-rose-700 dark:text-rose-300">{prev.summary.invalid}</b><br />không hợp lệ (bỏ qua)</div>
          </div>

          {existingIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-bg/70 px-4 py-3 text-sm">
              <div className="text-muted">
                Có <b className="text-ink">{existingIds.length}</b> từ đã có trong kho cá nhân của bạn — đưa vào ôn tập với <b className="text-emerald-600 dark:text-emerald-400">0 lượt AI</b>.
              </div>
              <button
                type="button"
                onClick={enrollExisting}
                disabled={busy !== ""}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-40"
              >
                {busy === "enroll" ? <Loader2 size={14} className="animate-spin" /> : <Repeat size={14} />}
                Đưa {existingIds.length} từ có sẵn vào Ôn tập
              </button>
            </div>
          )}

          {news.length > 0 && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Duyệt từ mới ({chosen.length}/{news.length} được chọn)</span>
                <button className="text-muted hover:text-ink" onClick={() => setOff(off.size ? new Set() : new Set(news.map((n) => n.norm_key!)))}>
                  {off.size ? "Chọn tất cả" : "Bỏ chọn tất cả"}
                </button>
              </div>
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {news.map((i) => {
                  const on = !off.has(i.norm_key!);
                  return (
                    <label key={i.norm_key} className={`flex cursor-pointer items-start gap-3 rounded-xl bg-bg/60 p-3 ${on ? "" : "opacity-40"}`}>
                      <input type="checkbox" checked={on} onChange={() => { const s = new Set(off); if (on) s.add(i.norm_key!); else s.delete(i.norm_key!); setOff(s); }} className="mt-1 h-4 w-4 accent-[#4255ff]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <b>{i.lemma}</b>
                          <span className="text-xs text-muted">{i.ipa} · {i.pos}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${levelColor[i.cefr_level ?? "B2"]}`}>{i.cefr_level}</span>
                          <span className="rounded-full bg-line px-2 py-0.5 text-[11px]">{i.topic}</span>
                          {i.is_awl && <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-bold text-orange-700 dark:bg-orange-400/20 dark:text-orange-300">AWL</span>}
                        </div>
                        <div className="text-sm text-brand-hover">{i.meaning_vi}</div>
                        <div className="truncate text-xs text-muted">{i.definition_en}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <button onClick={save} disabled={chosen.length === 0 || busy !== ""} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40">
                {busy === "save" && <Loader2 size={16} className="animate-spin" />} Lưu {chosen.length} từ vào kho
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Bank() {
  const [words, setWords] = useState<Word[]>([]);
  const [bookWords, setBookWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [sel, setSel] = useState<Sel>(null);
  const [importing, setImporting] = useState(false);
  const { isAdmin } = useMe();

  // Bộ lọc cho tab Tất cả
  const [q, setQ] = useState("");
  const [levels, setLevels] = useState<string[]>([]);
  const [topicsSel, setTopicsSel] = useState<string[]>([]);
  const [pos, setPos] = useState<string[]>([]);
  const [awl, setAwl] = useState<"all" | "yes" | "no">("all");
  const [sort, setSort] = useState<Sort>("az");
  const [showFilters, setShowFilters] = useState(true);

  // Bộ lọc chéo bên trong Chủ đề / Cấp độ
  const [subQuery, setSubQuery] = useState("");
  const [subFilter, setSubFilter] = useState<string[]>([]);
  const [showSubFilters, setShowSubFilters] = useState(true);

  // Chọn nhiều để xoá / chuyển vào ôn tập ngắt quãng & tuỳ chỉnh icon/ảnh thẻ chủ đề
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [enrollingSelected, setEnrollingSelected] = useState(false);
  const [bankMsg, setBankMsg] = useState<{ text: string; isErr?: boolean } | null>(null);
  const { badges, saveBadge } = useCardBadges();
  const [editingTopicBadge, setEditingTopicBadge] = useState<string | null>(null);

  const deleteWord = async (w: Word) => {
    if (!window.confirm(`Xoá từ "${w.word}" khỏi kho cá nhân của bạn?`)) return;
    setActivityLabel("/api/words", `Đang xoá từ "${w.word}"...`);
    const r = await fetch(`/api/words?id=${w.id}`, { method: "DELETE" });
    if (r.ok) {
      setWords((prev) => prev.filter((x) => x.id !== w.id));
      notifyDueUpdated();
    }
  };

  const deleteBookWord = async (w: Word) => {
    if (!isAdmin) return;
    if (!window.confirm(`Xoá từ "${w.word}" khỏi Bộ sách cộng đồng?`)) return;
    setActivityLabel("/api/words", `Đang xoá từ "${w.word}" khỏi bộ sách...`);
    const r = await fetch(`/api/words?scope=book&id=${w.id}`, { method: "DELETE" });
    if (r.ok) {
      setBookWords((prev) => prev.filter((x) => x.id !== w.id));
      setWords((prev) => prev.filter((x) => x.id !== w.id));
      notifyDueUpdated();
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Xoá ${selectedIds.size} từ đã chọn khỏi kho cá nhân của bạn?`)) return;
    const ids = Array.from(selectedIds);
    setActivityLabel("/api/words", `Đang xoá ${ids.length} từ khỏi kho cá nhân...`);
    const r = await fetch("/api/words", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (r.ok) {
      setWords((prev) => prev.filter((x) => !selectedIds.has(x.id)));
      setSelectedIds(new Set());
      setSelectMode(false);
      notifyDueUpdated();
    }
  };

  const enrollSelected = async () => {
    if (selectedIds.size === 0 || enrollingSelected) return;
    setEnrollingSelected(true);
    setBankMsg(null);
    try {
      const res = await enrollWordsInSrs(Array.from(selectedIds));
      notifyDueUpdated();
      setSelectedIds(new Set());
      setSelectMode(false);
      setBankMsg({
        text:
          res.enrolled > 0
            ? res.deferred > 0
              ? `Đã chuyển ${res.enrolled} từ vào Ôn tập (${res.deferred} từ được dời lịch sang từ ${res.scheduledFromDay ?? "ngày sau"} do hôm nay đã đủ chỉ tiêu).`
              : `Đã chuyển ${res.enrolled} từ mới vào Ôn tập ngắt quãng.`
            : "Các từ đã chọn đều đã nằm sẵn trong Ôn tập ngắt quãng.",
      });
    } catch (e) {
      setBankMsg({ text: (e as Error).message, isErr: true });
    } finally {
      setEnrollingSelected(false);
    }
  };

  const toggleSelectId = (id: number) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const togglePageIds = (pageIds: number[], allPageSelected: boolean) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) n.delete(id);
      } else {
        for (const id of pageIds) n.add(id);
      }
      return n;
    });

  const renderGrid = (list: Word[]) => (
    <WordGrid
      list={list}
      onDelete={deleteWord}
      selectedIds={selectMode ? selectedIds : undefined}
      onToggleSelect={toggleSelectId}
      onTogglePage={togglePageIds}
    />
  );

  const load = useCallback(async () => {
    try {
      const [personalRes, booksRes] = await Promise.all([
        fetch("/api/words", { cache: "no-store" }),
        fetch("/api/words?scope=books", { cache: "no-store" }),
      ]);
      const [personalJson, booksJson] = await Promise.all([
        personalRes.json(),
        booksRes.json(),
      ]);
      if (!personalRes.ok) throw new Error(personalJson.error || "Không tải được kho cá nhân");
      if (!booksRes.ok) throw new Error(booksJson.error || "Không tải được bộ sách cộng đồng");
      setWords(personalJson.words ?? []);
      setBookWords(booksJson.words ?? []);
      setLoadErr("");
    } catch (e) { setLoadErr((e as Error).message); }
    setLoading(false);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => {
      clearTimeout(t);
    };
  }, [load]);

  const allTopics = Array.from(new Set(words.map((w) => w.topic))).sort();
  const allPos = Array.from(new Set(words.map((w) => w.pos).filter(Boolean)));
  const presentLevels = LEVELS.filter((l) => words.some((w) => w.level === l));
  const POS_LABEL: Record<string, string> = { n: "Danh từ", v: "Động từ", adj: "Tính từ", adv: "Trạng từ", phr: "Cụm từ", prep: "Giới từ", conj: "Liên từ" };

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const filtered = useMemo(() => {
    const r = words.filter(
      (w) =>
        (w.word + w.vi + w.en).toLowerCase().includes(q.toLowerCase()) &&
        (levels.length === 0 || levels.includes(w.level)) &&
        (topicsSel.length === 0 || topicsSel.includes(w.topic)) &&
        (pos.length === 0 || pos.includes(w.pos)) &&
        (awl === "all" || (awl === "yes" ? !!w.awl : !w.awl))
    );
    return r.sort((a, b) =>
      sort === "az" ? a.word.localeCompare(b.word)
      : sort === "za" ? b.word.localeCompare(a.word)
      : sort === "level-asc" ? LV[a.level] - LV[b.level] || a.word.localeCompare(b.word)
      : LV[b.level] - LV[a.level] || a.word.localeCompare(b.word)
    );
  }, [words, q, levels, topicsSel, pos, awl, sort]);

  const activeCount = levels.length + topicsSel.length + pos.length + (awl !== "all" ? 1 : 0) + (q ? 1 : 0);
  const reset = () => { setQ(""); setLevels([]); setTopicsSel([]); setPos([]); setAwl("all"); setSort("az"); };

  const baseSelected = useMemo(
    () => (sel ? words.filter((w) => (sel.kind === "topic" ? w.topic === sel.value : w.level === sel.value)) : []),
    [words, sel]
  );

  // Các lựa chọn bộ lọc chéo (trong Chủ đề thì lọc Cấp độ; trong Cấp độ thì lọc Chủ đề)
  const subOptions = useMemo(() => {
    if (!sel) return [];
    if (sel.kind === "topic") return LEVELS.filter((l) => baseSelected.some((w) => w.level === l));
    return Array.from(new Set(baseSelected.map((w) => w.topic))).sort();
  }, [sel, baseSelected]);

  const selected = useMemo(
    () =>
      baseSelected.filter((w) => {
        const matchQ = (w.word + w.vi + w.en).toLowerCase().includes(subQuery.toLowerCase());
        if (!matchQ) return false;
        if (subFilter.length === 0) return true;
        return sel?.kind === "topic" ? subFilter.includes(w.level) : subFilter.includes(w.topic);
      }),
    [baseSelected, subQuery, subFilter, sel]
  );

  const openSel = (next: Sel) => {
    setSel(next);
    setSubQuery("");
    setSubFilter([]);
  };

  const changeTab = (t: Tab) => {
    setTab(t);
    openSel(null);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Package size={26} strokeWidth={1.5} className="text-brand-hover" />
            Kho từ vựng cá nhân <span className="text-base font-medium text-muted">({words.length} từ)</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Lưu riêng những từ bạn đã nạp, tra ở Reading, học ở Từ hôm nay, Writing Coach &amp; Thẻ ghi nhớ — không trùng với tài khoản khác.
          </p>
        </div>
        <button onClick={() => setImporting(!importing)} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg">
          <Upload size={17} strokeWidth={1.75} /> Nạp từ vựng hàng loạt
        </button>
      </div>

      {importing && <ImportPanel onSaved={load} />}

      {loading && (
        <div className="flex justify-center py-10">
          <CharacterLoader mode="reading" indicator="dots" size="md" />
        </div>
      )}
      {loadErr && <div className="rounded-xl bg-rose-500/15 p-4 text-sm text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">Không tải được kho: {loadErr}</div>}

      {!loading && !loadErr && words.length === 0 && tab !== "book" && (
        <div className="rounded-2xl bg-card p-10 text-center">
          <Package size={40} strokeWidth={1.2} className="mx-auto text-brand-hover" />
          <div className="mt-3 text-lg font-bold">Kho cá nhân đang trống</div>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted">
            Bấm “Nạp từ vựng hàng loạt” ở trên để tự tải từ lên, tra từ khi đọc Reading, học ở “Từ hôm nay”, hoặc chọn từ từ tab “Bộ sách” chuyển vào ôn tập — tất cả sẽ tự lưu vào kho riêng của bạn.
          </p>
        </div>
      )}

      {!loading && !loadErr && (
        <>
          <div className="flex flex-wrap gap-2">
            {([["all", "Tất cả"], ["topic", "Chủ đề"], ["level", "Cấp độ"], ["book", "Bộ sách"]] as [Tab, string][]).map(([k, l]) => (
              <button key={k} onClick={() => changeTab(k)} className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold transition ${tab === k ? "bg-ink text-bg" : "bg-card text-muted hover:text-ink"}`}>
                {k === "book" && <BookMarked size={15} strokeWidth={1.8} />}
                {l}
              </button>
            ))}
          </div>

          {words.length > 0 && tab === "all" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full max-w-md">
                  <Search size={17} strokeWidth={1.75} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm từ, nghĩa hoặc định nghĩa..." className="w-full rounded-full border border-line py-2.5 pl-11 pr-5 outline-none focus:border-brand-hover" />
                </div>
                <button onClick={() => setShowFilters(!showFilters)} className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2.5 text-sm font-semibold hover:bg-card-hover">
                  Bộ lọc{activeCount > 0 && <span className="rounded-full bg-brand px-2 text-xs text-white">{activeCount}</span>}
                  <ChevronDown size={16} strokeWidth={1.75} className={showFilters ? "rotate-180" : ""} />
                </button>
                <div className="ml-auto flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); setBankMsg(null); }}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                      selectMode ? "bg-ink text-bg" : "bg-card text-muted hover:text-ink"
                    }`}
                  >
                    <Check size={15} /> {selectMode ? "Huỷ chọn" : "Chọn nhiều"}
                  </button>
                  {selectMode && selectedIds.size > 0 && (
                    <>
                      <button
                        onClick={enrollSelected}
                        disabled={enrollingSelected}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-50"
                      >
                        {enrollingSelected ? <Loader2 size={14} className="animate-spin" /> : <Repeat size={14} />}
                        Chuyển {selectedIds.size} từ vào ôn tập
                      </button>
                      <button
                        onClick={deleteSelected}
                        className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-400"
                      >
                        Xoá {selectedIds.size} từ
                      </button>
                    </>
                  )}
                  <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-full border border-line px-4 py-2.5 text-sm">
                    <option value="az">Từ A → Z</option>
                    <option value="za">Từ Z → A</option>
                    <option value="level-asc">Cấp độ thấp → cao</option>
                    <option value="level-desc">Cấp độ cao → thấp</option>
                  </select>
                  <ExportButton words={filtered} filename="kho-tu-vung" label={`Xuất ${filtered.length} từ`} />
                </div>
              </div>

              {bankMsg && (
                <div
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${
                    bankMsg.isErr
                      ? "bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300"
                      : "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
                  }`}
                >
                  <Repeat size={15} /> {bankMsg.text}
                </div>
              )}

              {showFilters && (
                <div className="space-y-4 rounded-2xl bg-card p-5">
                  <div>
                    <div className="mb-2 text-xs font-semibold text-muted">Cấp độ</div>
                    <div className="flex flex-wrap gap-2">{presentLevels.map((l) => <Chip key={l} active={levels.includes(l)} onClick={() => toggle(levels, setLevels, l)}>{l}</Chip>)}</div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-semibold text-muted">Chủ đề</div>
                    <div className="flex flex-wrap gap-2">{allTopics.map((t) => <Chip key={t} active={topicsSel.includes(t)} onClick={() => toggle(topicsSel, setTopicsSel, t)}>{t}</Chip>)}</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-xs font-semibold text-muted">Từ loại</div>
                      <div className="flex flex-wrap gap-2">{allPos.map((p) => <Chip key={p} active={pos.includes(p)} onClick={() => toggle(pos, setPos, p)}>{POS_LABEL[p] ?? p}</Chip>)}</div>
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-semibold text-muted">Academic Word List (AWL)</div>
                      <div className="flex flex-wrap gap-2">
                        {([["all", "Tất cả"], ["yes", "Thuộc AWL"], ["no", "Không thuộc AWL"]] as const).map(([k, l]) => <Chip key={k} active={awl === k} onClick={() => setAwl(k)}>{l}</Chip>)}
                      </div>
                    </div>
                  </div>
                  <button onClick={reset} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><RotateCcw size={15} strokeWidth={1.75} /> Xoá bộ lọc</button>
                </div>
              )}

              {renderGrid(filtered)}
            </div>
          )}

          {(tab === "topic" || tab === "level") && sel && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => openSel(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
                  <ArrowLeft size={16} strokeWidth={1.75} /> Quay lại tất cả {tab === "topic" ? "chủ đề" : "cấp độ"}
                </button>
                <div className="ml-auto"><ExportButton words={selected} filename={`tu-vung-${sel.value}`} label={`Xuất ${selected.length} từ`} /></div>
              </div>
              <h2 className="text-xl font-bold">
                {sel.kind === "topic" ? sel.value : LEVEL_INFO[sel.value]?.title ?? sel.value}
                <span className="ml-2 text-base font-medium text-muted">({selected.length} / {baseSelected.length} từ)</span>
              </h2>

              {/* Bộ lọc chéo: Chủ đề lọc theo Cấp độ; Cấp độ lọc theo Chủ đề */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full max-w-xs">
                  <Search size={16} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    value={subQuery}
                    onChange={(e) => setSubQuery(e.target.value)}
                    placeholder="Tìm từ hoặc nghĩa..."
                    className="w-full rounded-full border border-line py-2 pl-10 pr-4 text-sm outline-none focus:border-brand-hover"
                  />
                </div>
                <button
                  onClick={() => setShowSubFilters((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-semibold hover:bg-card-hover"
                >
                  Bộ lọc{subFilter.length > 0 && <span className="rounded-full bg-brand px-2 text-xs text-white">{subFilter.length}</span>}
                  <ChevronDown size={16} strokeWidth={1.75} className={showSubFilters ? "rotate-180 transition" : "transition"} />
                </button>
              </div>

              {showSubFilters && (
                <div className="space-y-3 rounded-2xl bg-card p-4">
                  <div className="text-xs font-semibold text-muted">
                    {sel.kind === "topic" ? "Lọc theo cấp độ CEFR:" : "Lọc theo chủ đề:"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Chip active={subFilter.length === 0} onClick={() => setSubFilter([])}>
                      Tất cả ({baseSelected.length})
                    </Chip>
                    {subOptions.map((opt) => {
                      const cnt = baseSelected.filter((w) => (sel.kind === "topic" ? w.level === opt : w.topic === opt)).length;
                      return (
                        <Chip key={opt} active={subFilter.includes(opt)} onClick={() => toggle(subFilter, setSubFilter, opt)}>
                          {opt} ({cnt})
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              )}

              {renderGrid(selected)}
            </div>
          )}

          {tab === "topic" && !sel && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {allTopics.map((t) => {
                  const list = words.filter((w) => w.topic === t);
                  const Ic = topicIcon(t);
                  const badgeKey = `topic:${t}`;
                  return (
                    <div
                      key={t}
                      onClick={() => openSel({ kind: "topic", value: t })}
                      className="group cursor-pointer rounded-2xl border-2 border-transparent bg-card p-5 text-left transition hover:border-brand-hover"
                    >
                      <div className="flex items-start justify-between">
                        <CardBadge custom={badges[badgeKey]} FallbackIcon={Ic} size={30} />
                        <EditBadgeButton
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTopicBadge(t);
                          }}
                        />
                      </div>
                      <div className="mt-3 font-bold">{t}</div>
                      <div className="mb-3 text-xs text-muted">{list.length} từ</div>
                      <LevelBar list={list} />
                    </div>
                  );
                })}
              </div>
              {editingTopicBadge && (
                <BadgePickerModal
                  title={editingTopicBadge}
                  current={badges[`topic:${editingTopicBadge}`]}
                  onSelect={(val) => saveBadge(`topic:${editingTopicBadge}`, val)}
                  onClose={() => setEditingTopicBadge(null)}
                />
              )}
            </>
          )}

          {tab === "level" && !sel && (
            <div className="grid gap-4 md:grid-cols-3">
              {presentLevels.map((l) => {
                const list = words.filter((w) => w.level === l);
                return (
                  <button key={l} onClick={() => openSel({ kind: "level", value: l })} className="rounded-2xl border-2 border-transparent bg-card p-6 text-left transition hover:border-brand-hover">
                    <span className={`rounded-full px-3 py-1 text-sm font-bold ${levelColor[l]}`}>{l}</span>
                    <div className="mt-4 text-lg font-bold">{LEVEL_INFO[l]?.title ?? l}</div>
                    <div className="mb-3 text-sm text-muted">{LEVEL_INFO[l]?.desc}</div>
                    <div className="text-2xl font-bold">{list.length} <span className="text-sm font-medium text-muted">từ</span></div>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "book" && (
            <BookSection
              words={bookWords}
              onReload={load}
              isAdmin={isAdmin}
              WordGrid={({ list }) => (
                <WordGrid list={list} onDelete={isAdmin ? deleteBookWord : undefined} />
              )}
            />
          )}
        </>
      )}
    </div>
  );
}
