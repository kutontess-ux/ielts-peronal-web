"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ClipboardCheck,
  Folder,
  FolderInput,
  Layers,
  LayoutGrid,
  Lightbulb,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Repeat,
  Search,
  Share2,
  Shuffle,
  Sparkles,
  Star,
  Trash2,
  Volume2,
} from "lucide-react";
import { levelColor, type Word } from "@/lib/mock";
import { type StudyFolder, type StudySet } from "@/lib/study-sets";
import { speakWord } from "@/lib/tts";
import { VoiceSettingsButton } from "@/components/VoiceSettingsModal";

export default function StudySetDetail({
  studySet,
  folder,
  words,
  enrolling = false,
  onBack,
  onOpenFolder,
  onStartFlashcards,
  onStartLearn,
  onEdit,
  onMoveFolder,
  onEnroll,
  onDelete,
}: {
  studySet: StudySet;
  folder: StudyFolder | null;
  words: Word[];
  enrolling?: boolean;
  onBack: () => void;
  onOpenFolder?: (folderId: string) => void;
  onStartFlashcards: () => void;
  onStartLearn: () => void;
  onEdit: () => void;
  onMoveFolder: () => void;
  onEnroll: () => void;
  onDelete: () => void;
}) {
  const [shuffledIds, setShuffledIds] = useState<number[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [meaningFirst, setMeaningFirst] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [starred, setStarred] = useState<Record<number, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const [termQuery, setTermQuery] = useState("");
  const [termFilter, setTermFilter] = useState<"all" | "starred">("all");

  const shuffled = shuffledIds !== null;

  const deck = useMemo(() => {
    if (!shuffledIds) return words;
    const byId = new Map(words.map((w) => [w.id, w]));
    const ordered = shuffledIds
      .map((id) => byId.get(id))
      .filter((w): w is Word => !!w);
    const seen = new Set(ordered.map((w) => w.id));
    const extras = words.filter((w) => !seen.has(w.id));
    return [...ordered, ...extras];
  }, [words, shuffledIds]);

  const safeIdx = deck.length === 0 ? 0 : Math.min(idx, deck.length - 1);
  const currentCard = deck[safeIdx] ?? null;

  const goPrev = useCallback(() => {
    if (deck.length === 0) return;
    setFlipped(false);
    setShowHint(false);
    setIdx((prev) => {
      const cur = Math.min(prev, deck.length - 1);
      return (cur - 1 + deck.length) % deck.length;
    });
  }, [deck.length]);

  const goNext = useCallback(() => {
    if (deck.length === 0) return;
    setFlipped(false);
    setShowHint(false);
    setIdx((prev) => {
      const cur = Math.min(prev, deck.length - 1);
      return (cur + 1) % deck.length;
    });
  }, [deck.length]);

  const toggleShuffle = () => {
    if (words.length <= 1) return;
    if (shuffled) {
      setShuffledIds(null);
    } else {
      const next = words.map((w) => w.id);
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      setShuffledIds(next);
    }
    setIdx(0);
    setFlipped(false);
    setShowHint(false);
  };

  useEffect(() => {
    if (!autoplay || deck.length === 0) return;
    const t = setTimeout(() => {
      if (!flipped) {
        setFlipped(true);
      } else {
        setFlipped(false);
        setShowHint(false);
        setIdx((prev) => (Math.min(prev, deck.length - 1) + 1) % deck.length);
      }
    }, 2600);
    return () => clearTimeout(t);
  }, [autoplay, flipped, deck.length, safeIdx]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goPrev, goNext]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  const toggleStar = (wordId: number) => {
    setStarred((prev) => ({ ...prev, [wordId]: !prev[wordId] }));
  };

  const starredCount = useMemo(
    () => words.filter((w) => starred[w.id]).length,
    [words, starred]
  );

  const filteredTerms = useMemo(() => {
    const q = termQuery.trim().toLowerCase();
    return words.filter((w) => {
      if (termFilter === "starred" && !starred[w.id]) return false;
      if (!q) return true;
      return `${w.word} ${w.vi} ${w.en} ${w.ipa}`.toLowerCase().includes(q);
    });
  }, [words, termFilter, starred, termQuery]);

  const cardHintText = useMemo(() => {
    if (!currentCard) return "";
    if (meaningFirst) {
      const firstChar = currentCard.word.trim().charAt(0).toUpperCase();
      return `Chữ cái đầu: "${firstChar}..."${currentCard.pos ? ` · (${currentCard.pos})` : ""}`;
    }
    const parts: string[] = [];
    if (currentCard.pos) parts.push(`Từ loại: ${currentCard.pos}`);
    if (currentCard.ipa) parts.push(currentCard.ipa);
    if (currentCard.example) parts.push(`VD: "${currentCard.example}"`);
    return parts.join(" · ") || "Lật thẻ để xem định nghĩa chi tiết";
  }, [currentCard, meaningFirst]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Top breadcrumb & action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-bold text-muted transition hover:border-brand-hover hover:text-ink"
          >
            <ArrowLeft size={14} /> Học phần của bạn
          </button>
          {folder && (
            <button
              type="button"
              onClick={() => onOpenFolder?.(folder.id)}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand-hover transition hover:bg-brand/20"
            >
              <Folder size={13} /> {folder.name}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {words.length > 0 && (
            <button
              type="button"
              disabled={enrolling}
              onClick={onEnroll}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-bold text-ink transition hover:border-brand-hover disabled:opacity-50"
            >
              {enrolling ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Repeat size={13} />
              )}
              <span className="hidden sm:inline">
                {enrolling ? "Đang chuyển..." : "Chuyển vào ôn tập"}
              </span>
              <span className="sm:hidden">Ôn tập</span>
            </button>
          )}

          <button
            type="button"
            title="Chia sẻ học phần"
            onClick={() =>
              setPreviewNotice(
                "Tính năng Chia sẻ học phần sẽ được phát triển ở bước tiếp theo."
              )
            }
            className="rounded-full border border-line bg-card p-2 text-muted transition hover:border-brand-hover hover:text-ink"
          >
            <Share2 size={15} />
          </button>

          <button
            type="button"
            title="Chỉnh sửa học phần"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-bold text-ink transition hover:border-brand-hover"
          >
            <Pencil size={13} />
            <span className="hidden sm:inline">Chỉnh sửa</span>
          </button>

          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              aria-label="Tuỳ chọn học phần"
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded-full border border-line bg-card p-2 text-muted transition hover:border-brand-hover hover:text-ink"
            >
              <MoreHorizontal size={16} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-11 z-30 w-52 overflow-hidden rounded-2xl border border-line bg-card p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-bg"
                >
                  <Pencil size={14} className="text-muted" /> Chỉnh sửa học phần
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onMoveFolder();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-bg"
                >
                  <FolderInput size={14} className="text-muted" /> Chuyển thư mục
                </button>
                {words.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onEnroll();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-bg"
                  >
                    <Repeat size={14} className="text-muted" /> Chuyển vào ôn tập
                  </button>
                )}
                <div className="my-1 border-t border-line" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400"
                >
                  <Trash2 size={14} /> Xoá học phần
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Study set title & count */}
      <div>
        <h1 className="break-words text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          {studySet.title}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted sm:text-sm">
          <span>{words.length} thuật ngữ</span>
          {studySet.desc && (
            <>
              <span>·</span>
              <span className="break-words">{studySet.desc}</span>
            </>
          )}
        </div>
      </div>

      {/* Study modes row (Quizlet-style) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <button
          type="button"
          disabled={words.length === 0}
          onClick={onStartFlashcards}
          className="group flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 text-left transition hover:border-brand-hover hover:bg-card-hover disabled:opacity-45"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-hover">
            <Layers size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-ink">Thẻ ghi nhớ</div>
            <div className="text-[11px] text-muted">Lật thẻ toàn màn hình</div>
          </div>
        </button>

        <button
          type="button"
          disabled={words.length === 0}
          onClick={onStartLearn}
          className="group flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 text-left transition hover:border-brand-hover hover:bg-card-hover disabled:opacity-45"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-hover">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-ink">Học</div>
            <div className="text-[11px] text-muted">Trắc nghiệm & gõ từ</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            setPreviewNotice(
              "Chế độ Kiểm tra (Test) đang ở bản xem trước giao diện và sẽ được phát triển ở bước tiếp theo."
            )
          }
          className="group flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 text-left transition hover:border-brand-hover hover:bg-card-hover"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg text-muted group-hover:text-brand-hover">
            <ClipboardCheck size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-ink">Kiểm tra</span>
            </div>
            <div className="text-[11px] text-muted">Sắp ra mắt</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            setPreviewNotice(
              "Chế độ Ghép thẻ (Match) đang ở bản xem trước giao diện và sẽ được phát triển ở bước tiếp theo."
            )
          }
          className="group flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 text-left transition hover:border-brand-hover hover:bg-card-hover"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg text-muted group-hover:text-brand-hover">
            <LayoutGrid size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-ink">Ghép thẻ</span>
            </div>
            <div className="text-[11px] text-muted">Sắp ra mắt</div>
          </div>
        </button>
      </div>

      {previewNotice && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-xs font-medium text-brand-hover">
          <span>{previewNotice}</span>
          <button
            type="button"
            onClick={() => setPreviewNotice(null)}
            className="shrink-0 font-bold underline"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Main interactive Flashcard viewer */}
      {words.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card p-10 text-center">
          <Layers size={36} className="mx-auto text-muted" />
          <div className="mt-3 text-base font-bold">Học phần chưa có thuật ngữ nào</div>
          <p className="mt-1 text-xs text-muted">
            Nhấn Chỉnh sửa để thêm từ vào học phần này.
          </p>
          <button
            type="button"
            onClick={onEdit}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-xs font-bold text-white hover:bg-brand-hover"
          >
            <Pencil size={13} /> Chỉnh sửa học phần
          </button>
        </div>
      ) : currentCard ? (
        <div className="space-y-3.5">
          <div className="flex min-h-[290px] flex-col justify-between rounded-3xl border border-line bg-card p-5 shadow-sm transition sm:min-h-[340px] sm:p-7">
            {/* Inside card top controls */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowHint((h) => !h)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  showHint
                    ? "bg-brand/15 text-brand-hover"
                    : "text-muted hover:bg-bg hover:text-ink"
                }`}
              >
                <Lightbulb size={14} />
                <span>{showHint ? "Ẩn gợi ý" : "Hiển thị gợi ý"}</span>
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Chỉnh sửa học phần"
                  onClick={onEdit}
                  className="rounded-xl p-2 text-muted transition hover:bg-bg hover:text-ink"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  title="Phát âm"
                  onClick={() => speakWord(currentCard.word)}
                  className="rounded-xl p-2 text-muted transition hover:bg-bg hover:text-ink"
                >
                  <Volume2 size={17} />
                </button>
                <button
                  type="button"
                  title="Đánh dấu sao"
                  onClick={() => toggleStar(currentCard.id)}
                  className={`rounded-xl p-2 transition hover:bg-bg ${
                    starred[currentCard.id]
                      ? "text-amber-500"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <Star
                    size={17}
                    fill={starred[currentCard.id] ? "currentColor" : "none"}
                  />
                </button>
              </div>
            </div>

            {showHint && (
              <div className="mt-2 rounded-xl bg-bg px-3.5 py-2 text-center text-xs text-muted">
                {cardHintText}
              </div>
            )}

            {/* Flippable body */}
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="flex flex-1 flex-col items-center justify-center px-2 py-6 text-center focus:outline-none"
            >
              {(!flipped && !meaningFirst) || (flipped && meaningFirst) ? (
                <>
                  <div className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                    {currentCard.word}
                  </div>
                  {(currentCard.ipa || currentCard.pos) && (
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
                      {currentCard.ipa && <span>{currentCard.ipa}</span>}
                      {currentCard.pos && <span>· {currentCard.pos}</span>}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          levelColor[currentCard.level] ?? ""
                        }`}
                      >
                        {currentCard.level}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold text-brand-hover sm:text-3xl">
                    {currentCard.vi}
                  </div>
                  {currentCard.en && (
                    <p className="mt-2.5 max-w-xl text-sm text-muted">
                      {currentCard.en}
                    </p>
                  )}
                  {currentCard.example && (
                    <p className="mt-2 max-w-xl text-xs italic text-muted sm:text-sm">
                      “{currentCard.example}”
                    </p>
                  )}
                </>
              )}
            </button>

            <div className="text-center text-[11px] font-medium text-muted/80">
              Nhấn vào thẻ hoặc phím Space để lật · ← → để chuyển thẻ
            </div>
          </div>

          {/* Controls row below card (Quizlet-style) */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <button
              type="button"
              onClick={() => {
                setMeaningFirst((m) => !m);
                setFlipped(false);
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition ${
                meaningFirst
                  ? "border-brand bg-brand/10 text-brand-hover"
                  : "border-line bg-card text-muted hover:border-brand-hover hover:text-ink"
              }`}
            >
              <ArrowLeftRight size={14} />
              <span>{meaningFirst ? "Mặt trước: Nghĩa" : "Mặt trước: Thuật ngữ"}</span>
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Thẻ trước"
                onClick={goPrev}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card text-ink transition hover:border-brand-hover hover:bg-card-hover"
              >
                <ArrowLeft size={16} />
              </button>
              <span className="min-w-[56px] text-center text-sm font-bold tabular-nums text-ink">
                {safeIdx + 1} / {deck.length}
              </span>
              <button
                type="button"
                aria-label="Thẻ tiếp theo"
                onClick={goNext}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card text-ink transition hover:border-brand-hover hover:bg-card-hover"
              >
                <ArrowRight size={16} />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                title={autoplay ? "Tạm dừng tự phát" : "Tự động lật thẻ"}
                onClick={() => setAutoplay((a) => !a)}
                className={`rounded-xl border p-2 transition ${
                  autoplay
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-card text-muted hover:border-brand-hover hover:text-ink"
                }`}
              >
                {autoplay ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                type="button"
                title={shuffled ? "Bỏ trộn thẻ" : "Trộn ngẫu nhiên"}
                onClick={toggleShuffle}
                className={`rounded-xl border p-2 transition ${
                  shuffled
                    ? "border-brand bg-brand/15 text-brand-hover"
                    : "border-line bg-card text-muted hover:border-brand-hover hover:text-ink"
                }`}
              >
                <Shuffle size={16} />
              </button>
              <VoiceSettingsButton variant="icon" />
              <button
                type="button"
                title="Mở chế độ Lật thẻ toàn màn hình"
                onClick={onStartFlashcards}
                className="rounded-xl border border-line bg-card p-2 text-muted transition hover:border-brand-hover hover:text-ink"
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Term list below (Quizlet-style) */}
      {words.length > 0 && (
        <section className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink sm:text-lg">
              Thuật ngữ trong học phần này ({words.length})
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-full border border-line bg-card p-0.5">
                <button
                  type="button"
                  onClick={() => setTermFilter("all")}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    termFilter === "all"
                      ? "bg-ink text-bg"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Tất cả ({words.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTermFilter("starred")}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    termFilter === "starred"
                      ? "bg-ink text-bg"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Đã gắn sao ({starredCount})
                </button>
              </div>
            </div>
          </div>

          <div className="relative">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={termQuery}
              onChange={(e) => setTermQuery(e.target.value)}
              placeholder="Tìm thuật ngữ hoặc định nghĩa trong học phần..."
              className="w-full rounded-2xl border border-line bg-card py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-hover"
            />
          </div>

          {filteredTerms.length === 0 ? (
            <div className="rounded-2xl border border-line bg-card p-8 text-center text-xs text-muted">
              {termFilter === "starred" && starredCount === 0
                ? "Chưa có thuật ngữ nào được gắn sao."
                : "Không tìm thấy thuật ngữ phù hợp."}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredTerms.map((w) => (
                <div
                  key={w.id}
                  className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 transition hover:border-brand/40 sm:flex-row sm:items-start sm:justify-between sm:gap-5 sm:px-5 sm:py-4"
                >
                  <div className="min-w-0 sm:w-[36%] sm:shrink-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-words text-base font-bold text-ink">
                        {w.word}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          levelColor[w.level] ?? ""
                        }`}
                      >
                        {w.level}
                      </span>
                    </div>
                    {(w.ipa || w.pos) && (
                      <div className="mt-0.5 text-xs text-muted">
                        {w.ipa}
                        {w.ipa && w.pos ? " · " : ""}
                        {w.pos}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 border-t border-line pt-2.5 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                    <div className="break-words text-sm font-semibold text-ink">
                      {w.vi}
                    </div>
                    {w.en && (
                      <div className="mt-1 break-words text-xs text-muted">
                        {w.en}
                      </div>
                    )}
                    {w.example && (
                      <div className="mt-1 break-words text-xs italic text-muted">
                        “{w.example}”
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center justify-end gap-1">
                    <button
                      type="button"
                      title="Phát âm"
                      onClick={() => speakWord(w.word)}
                      className="rounded-lg p-1.5 text-muted transition hover:bg-bg hover:text-ink"
                    >
                      <Volume2 size={16} />
                    </button>
                    <button
                      type="button"
                      title="Đánh dấu sao"
                      onClick={() => toggleStar(w.id)}
                      className={`rounded-lg p-1.5 transition hover:bg-bg ${
                        starred[w.id]
                          ? "text-amber-500"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      <Star
                        size={16}
                        fill={starred[w.id] ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      type="button"
                      title="Chỉnh sửa học phần"
                      onClick={onEdit}
                      className="rounded-lg p-1.5 text-muted transition hover:bg-bg hover:text-ink"
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
