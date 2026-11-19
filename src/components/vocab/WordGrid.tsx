"use client";

import { createElement, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2, Volume2 } from "lucide-react";
import { levelColor, type Word } from "@/lib/mock";
import { topicIcon } from "@/lib/icons";
import { speakWord } from "@/lib/tts";

const PAGE_SIZE = 30;
const LEVELS = ["A2", "B1", "B2", "C1", "C2"];
const LEVEL_BAR: Record<string, string> = {
  A2: "bg-slate-400",
  B1: "bg-emerald-400",
  B2: "bg-sky-400",
  C1: "bg-violet-400",
  C2: "bg-pink-400",
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

export function WordCard({
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
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${levelColor[w.level]}`}>
                {w.level}
              </span>
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
                <div className="break-words text-xs text-muted">
                  {w.ipa} · {w.pos}
                </div>
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
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${levelColor[w.level]}`}>
                  {w.level}
                </span>
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
            {w.awl && (
              <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[11px] font-bold text-orange-700 dark:bg-orange-400/20 dark:text-orange-300">
                AWL
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WordGrid({
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
  const [pageState, setPageState] = useState<{ key: string; page: number }>({
    key: listKey,
    page: 1,
  });

  if (list.length === 0) {
    return <div className="py-10 text-center text-muted">Không tìm thấy từ nào.</div>;
  }

  const picking = !!selectedIds;
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const rawPage = pageState.key === listKey ? pageState.page : 1;
  const page = Math.min(Math.max(1, rawPage), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, list.length);
  const paged = list.slice(start, end);

  const pageIds = paged.map((w) => w.id);
  const allPageSelected =
    picking && pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
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
            {allPageSelected
              ? `Bỏ chọn ${paged.length} từ trang này`
              : `Chọn ${paged.length} từ trang này`}
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
        <nav
          aria-label="Phân trang kho từ vựng"
          className="flex flex-wrap items-center justify-between gap-3 pt-2"
        >
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

export function LevelBar({ list }: { list: Word[] }) {
  const total = list.length || 1;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-bg">
      {LEVELS.map((l) => (
        <div
          key={l}
          className={LEVEL_BAR[l]}
          style={{ width: `${(list.filter((w) => w.level === l).length / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
        active ? "bg-brand text-white" : "bg-bg text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
