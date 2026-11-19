"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, ArrowLeftRight, ArrowRight, CalendarClock, Check, Home, PartyPopper,
  Pause, Play, Repeat, RotateCcw, Shuffle, Sparkles, Star, Undo2, Volume2, X,
} from "lucide-react";
import { levelColor, type Word } from "@/lib/mock";
import { enrollWordsInSrs } from "@/lib/srs";
import { notifyDueUpdated } from "@/lib/due-events";
import { recordStudySetSession, type StudySetReviewResult } from "@/lib/study-sets";
import { clearStudyDraft, loadStudyDraft, saveStudyDraft } from "@/lib/study-drafts";
import { speakWord } from "@/lib/tts";
import { VoiceSettingsButton } from "@/components/VoiceSettingsModal";

type HistoryStatus = "known" | "unknown" | "viewed";

type HistoryEntry = {
  word: Word;
  status: HistoryStatus;
};

type FlashcardsDraft = {
  deckIds: number[];
  idx: number;
  meaningFirst: boolean;
  star: Record<number, boolean>;
  history: { wordId: number; status: HistoryStatus }[];
  updatedAt?: number;
};

function restoreFlashcardsDraft(setId: string | undefined, words: Word[]) {
  if (!setId || words.length === 0) return null;
  const draft = loadStudyDraft<FlashcardsDraft>(`ielts_draft_flashcards_v1_${setId}`);
  if (!draft || !Array.isArray(draft.deckIds)) return null;
  const wordMap = new Map(words.map((w) => [w.id, w]));
  const deck = draft.deckIds
    .map((id) => wordMap.get(id))
    .filter((w): w is Word => !!w);
  if (deck.length === 0) return null;
  const idx = Math.max(0, Math.min(draft.idx || 0, deck.length));
  if (idx <= 0 || idx >= deck.length) return null;
  const history: HistoryEntry[] = (draft.history ?? [])
    .map((h) => {
      const w = wordMap.get(h.wordId);
      return w ? { word: w, status: h.status } : null;
    })
    .filter((h): h is HistoryEntry => !!h);
  return {
    deck,
    idx,
    meaningFirst: Boolean(draft.meaningFirst),
    star: draft.star ?? {},
    history,
  };
}

export type FlashcardCompletionPayload = {
  knownCount: number;
  unknownCount: number;
  totalCount: number;
  scorePct: number;
};

export default function Flashcards({
  setId,
  title,
  words,
  isAdmin = false,
  onBack,
  onSwitchToLearn,
  onCompleted,
}: {
  setId?: string;
  title: string;
  words: Word[];
  isAdmin?: boolean;
  onBack: () => void;
  onSwitchToLearn?: () => void;
  onCompleted?: (result: FlashcardCompletionPayload) => StudySetReviewResult | null | void;
}) {
  const draftKey = setId ? `ielts_draft_flashcards_v1_${setId}` : null;
  const [initialDraft] = useState(() => restoreFlashcardsDraft(setId, words));

  const [deck, setDeck] = useState<Word[]>(() => initialDraft?.deck ?? words);
  const [idx, setIdx] = useState(() => initialDraft?.idx ?? 0);
  const [flipped, setFlipped] = useState(false);
  const [meaningFirst, setMeaningFirst] = useState(() => initialDraft?.meaningFirst ?? false);
  const [autoplay, setAutoplay] = useState(false);
  const [star, setStar] = useState<Record<number, boolean>>(() => initialDraft?.star ?? {});
  const [history, setHistory] = useState<HistoryEntry[]>(() => initialDraft?.history ?? []);
  const [srsMsg, setSrsMsg] = useState("");
  const [reviewSchedule, setReviewSchedule] = useState<StudySetReviewResult | null>(null);

  const done = idx >= deck.length;
  const card = deck[idx];

  useEffect(() => {
    if (!draftKey) return;
    if (done || (idx === 0 && history.length === 0)) {
      clearStudyDraft(draftKey);
      return;
    }
    saveStudyDraft<FlashcardsDraft>(draftKey, {
      deckIds: deck.map((w) => w.id),
      idx,
      meaningFirst,
      star,
      history: history.map((h) => ({ wordId: h.word.id, status: h.status })),
      updatedAt: Date.now(),
    });
  }, [draftKey, done, deck, idx, meaningFirst, star, history]);

  const knownList = history.filter((h) => h.status === "known").map((h) => h.word);
  const unknownList = history.filter((h) => h.status === "unknown").map((h) => h.word);
  const classifiedCount = knownList.length + unknownList.length;

  const speak = useCallback((text: string) => {
    speakWord(text);
  }, []);

  const syncDeckToSrs = useCallback(async (wordList: Word[]) => {
    try {
      const ids = wordList.map((w) => w.id);
      const res = await enrollWordsInSrs(ids);
      notifyDueUpdated();
      setSrsMsg(
        res.enrolled > 0
          ? isAdmin && res.deferred > 0
            ? `Đã chuyển ${res.enrolled} từ vào Ôn tập (${res.deferred} từ mới được dời sang từ ${res.scheduledFromDay ?? "ngày sau"} vì hôm nay đã đủ chỉ tiêu — nên ôn hết từ cũ trước)`
            : `Đã chuyển ${res.enrolled} từ mới vào Ôn tập ngắt quãng`
          : "Các từ trong học phần này đã nằm sẵn trong Ôn tập ngắt quãng"
      );
    } catch {
      // bỏ qua nếu chưa kết nối DB
    }
  }, [isAdmin]);

  const mark = useCallback(
    (status: HistoryStatus) => {
      if (!card) return;
      const nextHistory = [...history, { word: card, status }];
      const nextIdx = idx + 1;
      setHistory(nextHistory);
      setFlipped(false);
      setIdx(nextIdx);
      if (nextIdx >= deck.length) {
        const knownCount = nextHistory.filter((h) => h.status === "known").length;
        const unknownCount = nextHistory.filter((h) => h.status === "unknown").length;
        const totalClassified = knownCount + unknownCount;
        // Nếu người dùng chỉ lật xem thẻ mà không bấm phân loại Đã biết/Chưa biết -> coi như hoàn thành hợp lệ (100%)
        const scorePct =
          totalClassified === 0
            ? 100
            : Math.round((knownCount / totalClassified) * 100);

        recordStudySetSession({ setId, title, wordCount: deck.length });
        const schedule = onCompleted?.({
          knownCount,
          unknownCount,
          totalCount: deck.length,
          scorePct,
        });
        if (schedule) {
          setReviewSchedule(schedule);
        }
        void syncDeckToSrs(deck);
      }
    },
    [card, history, idx, deck, setId, title, onCompleted, syncDeckToSrs]
  );

  const undo = useCallback(() => {
    if (history.length === 0) return;
    setHistory((h) => h.slice(0, -1));
    setFlipped(false);
    setIdx((x) => Math.max(0, x - 1));
  }, [history.length]);

  const shuffleDeck = () => {
    const copy = [...deck];
    for (let j = copy.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [copy[j], copy[k]] = [copy[k], copy[j]];
    }
    setDeck(copy);
    setIdx(0);
    setHistory([]);
    setFlipped(false);
    setAutoplay(false);
    setSrsMsg("");
    setReviewSchedule(null);
  };

  const restart = (subset?: Word[]) => {
    setDeck(subset ?? words);
    setIdx(0);
    setHistory([]);
    setFlipped(false);
    setAutoplay(false);
    setSrsMsg("");
    setReviewSchedule(null);
  };

  // Phím tắt giống Quizlet
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (done) return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.code === "ArrowRight" || e.key === "2") {
        e.preventDefault();
        mark("known");
      } else if (e.code === "ArrowLeft" || e.key === "1") {
        e.preventDefault();
        mark("unknown");
      } else if (e.key === "Enter") {
        e.preventDefault();
        mark("viewed");
      } else if (e.key.toLowerCase() === "a" && card) {
        speak(card.word);
      } else if (e.key.toLowerCase() === "s" && card) {
        setStar((s) => ({ ...s, [card.id]: !s[card.id] }));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [done, card, mark, speak]);

  // Chế độ tự động phát (Autoplay)
  useEffect(() => {
    if (!autoplay || done || !card) return;
    if (!flipped && !meaningFirst) speak(card.word);
    const t = setTimeout(() => {
      if (!flipped) {
        setFlipped(true);
      } else {
        mark("viewed");
      }
    }, flipped ? 2600 : 2200);
    return () => clearTimeout(t);
  }, [autoplay, done, card, flipped, meaningFirst, mark, speak]);

  // Màn hình chúc mừng khi học xong
  if (done) {
    const pct =
      classifiedCount === 0
        ? 100
        : Math.round((knownList.length / classifiedCount) * 100);
    const starredWords = deck.filter((w) => star[w.id]);

    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-6 text-center sm:p-8 md:p-10">
        <PartyPopper size={56} strokeWidth={1.2} className="mx-auto text-brand-hover" />
        <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Chúc mừng! Bạn đã học xong bộ thẻ</h1>
        <p className="mt-2 text-muted">{title} · {deck.length} thẻ</p>

        {isAdmin && reviewSchedule && (
          <div className="mx-auto mt-4 inline-flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-brand/15 px-4 py-2 text-xs font-bold text-brand-hover">
            <CalendarClock size={15} />
            Đã hẹn tự ôn lại học phần sau {reviewSchedule.intervalDays} ngày (Mức {reviewSchedule.nextLevel}/5)
          </div>
        )}

        {srsMsg && (
          <div className="mx-auto mt-2.5 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
            <Repeat size={14} /> {srsMsg}
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 gap-2.5 sm:gap-4">
          <div className="rounded-2xl bg-bg p-3 sm:p-4">
            <div className="text-xl font-bold text-brand-hover sm:text-2xl">{pct}%</div>
            <div className="mt-1 text-xs text-muted">
              {classifiedCount === 0 ? "Đã xem hết" : "Hoàn thành"}
            </div>
          </div>
          <div className="rounded-2xl bg-emerald-500/15 p-3 sm:p-4 dark:bg-emerald-400/10">
            <div className="text-xl font-bold text-emerald-700 sm:text-2xl dark:text-emerald-300">
              {classifiedCount === 0 ? deck.length : knownList.length}
            </div>
            <div className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">
              {classifiedCount === 0 ? "Đã lật thẻ" : "Đã biết"}
            </div>
          </div>
          <div className="rounded-2xl bg-orange-500/15 p-3 sm:p-4 dark:bg-orange-400/10">
            <div className="text-xl font-bold text-orange-700 sm:text-2xl dark:text-orange-300">{unknownList.length}</div>
            <div className="mt-1 text-xs text-orange-700/80 dark:text-orange-300/80">Cần học lại</div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {unknownList.length > 0 && (
            <button
              onClick={() => restart(unknownList)}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
            >
              <RotateCcw size={16} /> Chỉ học lại {unknownList.length} từ chưa biết
            </button>
          )}
          {onSwitchToLearn && (
            <button
              type="button"
              onClick={onSwitchToLearn}
              className="inline-flex items-center gap-2 rounded-full bg-brand/15 px-6 py-3 text-sm font-bold text-brand-hover hover:bg-brand hover:text-white"
            >
              <Sparkles size={16} /> Luyện tập (Trắc nghiệm / Gõ từ)
            </button>
          )}
          <Link
            href="/vocab/review"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-6 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-500/25 dark:bg-emerald-400/15 dark:text-emerald-300"
          >
            <Repeat size={16} /> Đi ôn tập ngắt quãng
          </Link>
          {starredWords.length > 0 && (
            <button
              onClick={() => restart(starredWords)}
              className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-6 py-3 text-sm font-bold text-amber-700 hover:bg-amber-500/25 dark:bg-yellow-400/20 dark:text-yellow-300 dark:hover:bg-yellow-400/30"
            >
              <Star size={16} /> Học {starredWords.length} từ gắn sao
            </button>
          )}
          <button
            onClick={() => restart(words)}
            className="inline-flex items-center gap-2 rounded-full bg-line px-6 py-3 text-sm font-bold hover:bg-card-hover"
          >
            <RotateCcw size={16} /> Học lại toàn bộ
          </button>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full bg-line px-6 py-3 text-sm font-bold hover:bg-card-hover"
          >
            Chọn bộ khác
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-bg px-6 py-3 text-sm font-bold text-muted hover:text-ink"
          >
            <Home size={16} /> Về Trang chủ
          </Link>
        </div>
      </div>
    );
  }

  const frontContent = meaningFirst ? (
    <>
      <div className="break-words text-center text-2xl font-bold text-brand-hover sm:text-3xl md:text-4xl">{card.vi}</div>
      <div className="mt-3 max-w-lg break-words text-center text-sm text-muted sm:text-base">{card.en}</div>
    </>
  ) : (
    <>
      <div className="break-words text-center text-3xl font-bold sm:text-4xl md:text-5xl">{card.word}</div>
      <div className="mt-2 break-words text-center text-base text-muted sm:mt-3 sm:text-lg">
        {card.ipa} {card.pos ? `· ${card.pos}` : ""}
      </div>
      {card.example && (
        <div className="mt-5 max-w-lg rounded-xl bg-bg/60 px-4 py-3 text-center text-sm italic leading-relaxed text-muted break-words">
          “{card.example}”
        </div>
      )}
    </>
  );

  const backContent = meaningFirst ? (
    <div className="text-center">
      <div className="break-words text-3xl font-bold sm:text-4xl md:text-5xl">{card.word}</div>
      <div className="mt-2 break-words text-base text-muted sm:text-lg">
        {card.ipa} {card.pos ? `· ${card.pos}` : ""}
      </div>
      {card.example && <div className="mt-5 rounded-xl bg-bg/60 p-4 text-sm italic leading-relaxed text-muted break-words">“{card.example}”</div>}
    </div>
  ) : (
    <div className="min-w-0">
      <div className="break-words text-2xl font-bold text-brand-hover sm:text-3xl">{card.vi}</div>
      <div className="mt-3 break-words text-base sm:text-lg">{card.en}</div>
      {card.example && <div className="mt-5 rounded-xl bg-bg/60 p-4 text-sm italic leading-relaxed text-muted break-words">“{card.example}”</div>}
      {card.awl && <div className="mt-4 text-xs font-bold text-orange-600 dark:text-orange-300">Academic Word List</div>}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      {/* Thanh trên cùng */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft size={16} strokeWidth={1.75} /> {title}
        </button>
        <div className="font-bold">
          {idx + 1} / {deck.length}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold sm:gap-2.5">
          <VoiceSettingsButton variant="compact" />
          {idx > 0 && (
            <button
              type="button"
              onClick={() => restart(words)}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-3 py-1 font-semibold text-muted hover:border-brand-hover hover:text-ink"
              title="Bắt đầu lại từ đầu"
            >
              <RotateCcw size={12} /> Làm lại
            </button>
          )}
          {onSwitchToLearn && (
            <button
              type="button"
              onClick={onSwitchToLearn}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-3 py-1 font-semibold text-muted hover:border-brand-hover hover:text-ink"
            >
              <Sparkles size={13} /> Luyện tập
            </button>
          )}
          <span
            title={`Chưa biết: ${unknownList.length}`}
            aria-label={`Chưa biết: ${unknownList.length}`}
            className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-orange-500/10 px-2 py-0.5 tabular-nums text-orange-500 dark:bg-orange-400/10 dark:text-orange-300/80"
          >
            {unknownList.length}
          </span>
          <span
            title={`Đã biết: ${knownList.length}`}
            aria-label={`Đã biết: ${knownList.length}`}
            className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-emerald-500/10 px-2 py-0.5 tabular-nums text-emerald-500 dark:bg-emerald-400/10 dark:text-emerald-300/80"
          >
            {knownList.length}
          </span>
        </div>
      </div>

      {/* Thanh tiến độ */}
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-card">
        <div className="h-full bg-brand-hover transition-all" style={{ width: `${(idx / Math.max(1, deck.length)) * 100}%` }} />
      </div>

      {/* Thẻ lật 3D (tự giãn chiều cao khi thu nhỏ màn hình) */}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        className="cursor-pointer select-none focus:outline-none"
        style={{ perspective: 1500 }}
        onClick={() => setFlipped((f) => !f)}
      >
        <div
          className="grid transition-transform duration-500"
          style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateX(180deg)" : "rotateX(0deg)" }}
        >
          <div
            className={`col-start-1 row-start-1 flex min-h-[320px] flex-col justify-between rounded-3xl border border-line bg-card p-5 shadow-xl sm:min-h-[380px] sm:p-8 ${
              flipped ? "pointer-events-none" : ""
            }`}
            style={{ backfaceVisibility: "hidden", transform: "rotateX(0deg)" }}
          >
            <div className="flex items-center justify-between gap-2 text-muted">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${levelColor[card.level]}`}>
                {card.level} · {card.topic}
              </span>
              <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
                <button type="button" title="Phát âm (A)" onClick={() => speak(card.word)} className="hover:text-ink">
                  <Volume2 size={21} strokeWidth={1.6} />
                </button>
                <button type="button" title="Gắn sao (S)" onClick={() => setStar((s) => ({ ...s, [card.id]: !s[card.id] }))} className="hover:text-ink">
                  <Star size={21} strokeWidth={1.6} className={star[card.id] ? "fill-amber-400 text-amber-400 dark:fill-yellow-300 dark:text-yellow-300" : ""} />
                </button>
              </div>
            </div>
            <div className="my-4 flex flex-1 flex-col items-center justify-center">{frontContent}</div>
            <div className="text-center text-sm text-muted/70">Bấm thẻ hoặc Space để lật</div>
          </div>

          <div
            className={`col-start-1 row-start-1 flex min-h-[320px] flex-col justify-between rounded-3xl border border-line bg-card p-5 shadow-xl sm:min-h-[380px] sm:p-10 ${
              flipped ? "" : "pointer-events-none"
            }`}
            style={{ backfaceVisibility: "hidden", transform: "rotateX(180deg)" }}
          >
            <div className="my-4 flex flex-1 flex-col justify-center">{backContent}</div>
            <div className="text-center text-sm text-muted/70">Bấm lại để lật về mặt trước</div>
          </div>
        </div>
      </div>

      {/* Nút điều khiển dưới thẻ kiểu Quizlet */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 sm:justify-between sm:gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={history.length === 0}
            title="Quay lại thẻ trước"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-muted hover:bg-card-hover hover:text-ink disabled:opacity-30"
          >
            <Undo2 size={18} />
          </button>
          <button
            onClick={() => setAutoplay((a) => !a)}
            title="Tự động phát"
            className={`inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition ${
              autoplay ? "bg-brand text-white" : "bg-card text-muted hover:bg-card-hover hover:text-ink"
            }`}
          >
            {autoplay ? <Pause size={16} /> : <Play size={16} />}
            {autoplay ? "Đang phát" : "Tự phát"}
          </button>
        </div>

        <div className="order-first flex w-full items-center justify-center gap-2 sm:order-none sm:w-auto sm:gap-2.5">
          <button
            onClick={() => mark("unknown")}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border-2 border-orange-500/50 px-3.5 py-2.5 text-sm font-bold text-orange-700 hover:bg-orange-500/10 dark:border-orange-400/60 dark:text-orange-300 dark:hover:bg-orange-400/10 sm:flex-initial sm:px-5 sm:text-base"
          >
            <X size={18} strokeWidth={2} /> Chưa biết
          </button>
          <button
            type="button"
            title="Qua thẻ tiếp theo không cần phân loại (Enter)"
            onClick={() => mark("viewed")}
            className="inline-flex items-center justify-center gap-1 rounded-full border border-line bg-card px-3.5 py-2.5 text-sm font-semibold text-muted hover:border-brand-hover hover:text-ink"
          >
            Tiếp <ArrowRight size={15} />
          </button>
          <button
            onClick={() => mark("known")}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border-2 border-emerald-500/50 px-3.5 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-500/10 dark:border-emerald-400/60 dark:text-emerald-300 dark:hover:bg-emerald-400/10 sm:flex-initial sm:px-5 sm:text-base"
          >
            <Check size={18} strokeWidth={2} /> Đã biết
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMeaningFirst((m) => !m)}
            title="Đổi mặt trước (Từ ↔ Nghĩa)"
            className={`inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition ${
              meaningFirst ? "bg-ink text-bg" : "bg-card text-muted hover:bg-card-hover hover:text-ink"
            }`}
          >
            <ArrowLeftRight size={16} /> {meaningFirst ? "Nghĩa trước" : "Từ trước"}
          </button>
          <button
            onClick={shuffleDeck}
            title="Trộn thẻ"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-muted hover:bg-card-hover hover:text-ink"
          >
            <Shuffle size={18} />
          </button>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        Phím tắt: Space lật thẻ · ← Chưa biết · → Đã biết · Enter xem tiếp · A phát âm · S gắn sao
      </p>
    </div>
  );
}
