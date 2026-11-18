"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Eye,
  Keyboard,
  Layers,
  Lightbulb,
  ListChecks,
  PartyPopper,
  Repeat,
  RotateCcw,
  Sparkles,
  Volume2,
  XCircle,
} from "lucide-react";
import { levelColor, type Word } from "@/lib/mock";
import { notifyDueUpdated } from "@/lib/due-events";
import {
  checkRecallSoftMatch,
  enrollWordsInSrs,
  getProgressiveWordHint,
  maskWordInExample,
} from "@/lib/srs";
import {
  recordStudySetSession,
  type StudySetReviewResult,
} from "@/lib/study-sets";

export type LearnCompletionPayload = {
  knownCount: number;
  unknownCount: number;
  totalCount: number;
  scorePct: number;
};

type LearnMode = "mixed" | "choice" | "type";
type PromptSide = "meaning" | "word";
type QuestionPhase = "choice" | "type";

type QueueItem = {
  word: Word;
  phase: QuestionPhase;
  isRetry: boolean;
};

type ChoiceOption = {
  id: number;
  label: string;
  sub?: string;
  isCorrect: boolean;
};

type FeedbackState = {
  isCorrect: boolean;
  typed: string;
  phase: QuestionPhase;
  wasRetry: boolean;
};

const LEARN_MODE_KEY = "ielts_studyset_learn_mode_v1";
const LEARN_SIDE_KEY = "ielts_studyset_learn_side_v1";

function buildQueue(words: Word[], mode: LearnMode): QueueItem[] {
  const phase: QuestionPhase = mode === "type" ? "type" : "choice";
  return words.map((word) => ({ word, phase, isRetry: false }));
}

function buildChoiceOptions(
  card: Word,
  setWords: Word[],
  wordPool: Word[],
  promptSide: PromptSide
): ChoiceOption[] {
  const candidates = new Map<number, { word: string; vi: string; pos: string; level: string }>();

  for (const w of setWords) {
    if (w.id !== card.id) {
      candidates.set(w.id, { word: w.word, vi: w.vi, pos: w.pos, level: w.level });
    }
  }
  for (const w of wordPool) {
    if (w.id !== card.id && !candidates.has(w.id)) {
      candidates.set(w.id, { word: w.word, vi: w.vi, pos: w.pos, level: w.level });
    }
  }

  const all = Array.from(candidates.entries())
    .map(([id, item]) => ({ id, ...item }))
    .filter((item) => (promptSide === "meaning" ? Boolean(item.word) : Boolean(item.vi)));

  const scored = all.sort((a, b) => {
    const sa = (a.pos === card.pos ? 2 : 0) + (a.level === card.level ? 1 : 0);
    const sb = (b.pos === card.pos ? 2 : 0) + (b.level === card.level ? 1 : 0);
    if (sb !== sa) return sb - sa;
    return ((a.id * 37 + card.id * 13) % 97) - ((b.id * 37 + card.id * 13) % 97);
  });

  const distractors: ChoiceOption[] = scored.slice(0, 3).map((d) => ({
    id: d.id,
    label: promptSide === "meaning" ? d.word : d.vi,
    sub: promptSide === "meaning" ? d.pos || undefined : undefined,
    isCorrect: false,
  }));

  const correctOpt: ChoiceOption = {
    id: card.id,
    label: promptSide === "meaning" ? card.word : card.vi || card.en,
    sub: promptSide === "meaning" ? card.pos || undefined : undefined,
    isCorrect: true,
  };

  const combined = [correctOpt, ...distractors];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = (card.id * 17 + i * 31) % (i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined;
}

export default function StudySetLearn({
  setId,
  title,
  words,
  wordPool,
  onBack,
  onSwitchToFlashcards,
  onCompleted,
}: {
  setId: string;
  title: string;
  words: Word[];
  wordPool: Word[];
  onBack: () => void;
  onSwitchToFlashcards?: () => void;
  onCompleted?: (result: LearnCompletionPayload) => StudySetReviewResult | null | void;
}) {
  const [learnMode, setLearnMode] = useState<LearnMode>(() => {
    if (typeof window === "undefined") return "mixed";
    try {
      const saved = localStorage.getItem(LEARN_MODE_KEY);
      if (saved === "mixed" || saved === "choice" || saved === "type") return saved;
    } catch {
      // bỏ qua
    }
    return "mixed";
  });

  const [promptSide, setPromptSide] = useState<PromptSide>(() => {
    if (typeof window === "undefined") return "meaning";
    try {
      const saved = localStorage.getItem(LEARN_SIDE_KEY);
      if (saved === "meaning" || saved === "word") return saved;
    } catch {
      // bỏ qua
    }
    return "meaning";
  });

  const [sessionWords, setSessionWords] = useState<Word[]>(words);
  const [queue, setQueue] = useState<QueueItem[]>(() => buildQueue(words, learnMode));
  const [phase1PassedIds, setPhase1PassedIds] = useState<Set<number>>(() => new Set());
  const [masteredIds, setMasteredIds] = useState<Set<number>>(() => new Set());
  const [missedIds, setMissedIds] = useState<Set<number>>(() => new Set());

  const [typed, setTyped] = useState("");
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2 | 3>(0);
  const [softHintMsg, setSoftHintMsg] = useState("");
  const [revealedMeaning, setRevealedMeaning] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [reviewSchedule, setReviewSchedule] = useState<StudySetReviewResult | null>(null);
  const [srsMsg, setSrsMsg] = useState("");

  const completionRecordedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentItem = queue[0] ?? null;
  const done = queue.length === 0;

  const speakWord = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    speechSynthesis.speak(u);
  }, []);

  const resetSession = useCallback((nextWords: Word[], mode: LearnMode) => {
    completionRecordedRef.current = false;
    setSessionWords(nextWords);
    setQueue(buildQueue(nextWords, mode));
    setPhase1PassedIds(new Set());
    setMasteredIds(new Set());
    setMissedIds(new Set());
    setTyped("");
    setHintLevel(0);
    setSoftHintMsg("");
    setRevealedMeaning(false);
    setFeedback(null);
    setReviewSchedule(null);
    setSrsMsg("");
  }, []);

  const changeLearnMode = (nextMode: LearnMode) => {
    setLearnMode(nextMode);
    try {
      localStorage.setItem(LEARN_MODE_KEY, nextMode);
    } catch {
      // bỏ qua
    }
    resetSession(sessionWords, nextMode);
  };

  const changePromptSide = (nextSide: PromptSide) => {
    setPromptSide(nextSide);
    setTyped("");
    setHintLevel(0);
    setSoftHintMsg("");
    setRevealedMeaning(false);
    try {
      localStorage.setItem(LEARN_SIDE_KEY, nextSide);
    } catch {
      // bỏ qua
    }
  };

  useEffect(() => {
    if (
      currentItem &&
      !feedback &&
      currentItem.phase === "type" &&
      promptSide === "meaning"
    ) {
      inputRef.current?.focus();
    }
  }, [currentItem, feedback, promptSide]);

  const handleFinishSession = useCallback(() => {
    if (completionRecordedRef.current || sessionWords.length === 0) return;
    completionRecordedRef.current = true;

    const totalCount = sessionWords.length;
    const unknownCount = missedIds.size;
    const knownCount = Math.max(0, totalCount - unknownCount);
    const scorePct = Math.round((knownCount / Math.max(1, totalCount)) * 100);

    recordStudySetSession({ setId, title, wordCount: totalCount });
    const result = onCompleted?.({ knownCount, unknownCount, totalCount, scorePct });
    if (result) {
      setReviewSchedule(result);
    }

    void enrollWordsInSrs(sessionWords.map((w) => w.id))
      .then((res) => {
        notifyDueUpdated();
        setSrsMsg(
          res.enrolled > 0
            ? `Đã đồng bộ thêm ${res.enrolled} từ mới vào Ôn tập ngắt quãng`
            : "Các từ đã được đồng bộ với Ôn tập ngắt quãng"
        );
      })
      .catch(() => {
        // bỏ qua nếu chưa kết nối DB
      });
  }, [sessionWords, missedIds, setId, title, onCompleted]);

  const submitDirect = useCallback(
    (isCorrect: boolean, displayLabel: string) => {
      if (!currentItem || feedback) return;
      setSoftHintMsg("");
      speakWord(currentItem.word.word);
      setFeedback({
        isCorrect,
        typed: displayLabel,
        phase: currentItem.phase,
        wasRetry: currentItem.isRetry,
      });

      if (!isCorrect) {
        setMissedIds((prev) => {
          const next = new Set(prev);
          next.add(currentItem.word.id);
          return next;
        });
      }
    },
    [currentItem, feedback, speakWord]
  );

  const submitTypedAnswer = useCallback(
    (forceWrong = false) => {
      if (!currentItem || feedback) return;
      const trimmed = typed.trim();
      if (!forceWrong && !trimmed) return;

      if (!forceWrong) {
        const match = checkRecallSoftMatch(
          trimmed,
          currentItem.word.word,
          currentItem.word.synonyms ?? []
        );
        if (match === "synonym") {
          setSoftHintMsg(
            `Từ "${trimmed}" đồng nghĩa, nhưng thẻ này cần từ bắt đầu bằng "${currentItem.word.word
              .slice(0, 1)
              .toUpperCase()}..." — thử gõ lại nhé!`
          );
          return;
        }
        if (match === "typo") {
          setSoftHintMsg("Gần đúng rồi (lệch 1 ký tự), hãy kiểm tra lại chính tả!");
          return;
        }
        submitDirect(match === "exact", trimmed);
        return;
      }

      submitDirect(false, "(Không nhớ)");
    },
    [currentItem, feedback, typed, submitDirect]
  );

  const goNext = useCallback(() => {
    if (!currentItem || !feedback) return;

    const rest = queue.slice(1);
    const id = currentItem.word.id;

    if (!feedback.isCorrect) {
      // Đưa thẻ sai về cuối hàng để ôn lại trong vòng
      setQueue([...rest, { word: currentItem.word, phase: currentItem.phase, isRetry: true }]);
    } else if (learnMode === "mixed" && currentItem.phase === "choice") {
      setPhase1PassedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      // Đẩy sang giai đoạn 2 (Gõ từ / Tự chấm) sau khi qua Trắc nghiệm
      setQueue([...rest, { word: currentItem.word, phase: "type", isRetry: false }]);
    } else {
      setMasteredIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setQueue(rest);
      if (rest.length === 0) {
        handleFinishSession();
      }
    }

    setTyped("");
    setHintLevel(0);
    setSoftHintMsg("");
    setRevealedMeaning(false);
    setFeedback(null);
  }, [currentItem, feedback, queue, learnMode, handleFinishSession]);

  const choiceOptions = useMemo(
    () =>
      currentItem
        ? buildChoiceOptions(currentItem.word, words, wordPool, promptSide)
        : [],
    [currentItem, words, wordPool, promptSide]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) return;
      if (feedback) {
        if (e.key === "Enter") {
          e.preventDefault();
          goNext();
        }
        return;
      }
      if (!currentItem) return;

      if (currentItem.phase === "choice" && ["1", "2", "3", "4"].includes(e.key)) {
        const opt = choiceOptions[Number(e.key) - 1];
        if (opt) {
          e.preventDefault();
          submitDirect(opt.isCorrect, opt.label);
        }
        return;
      }

      if (currentItem.phase === "type" && promptSide === "word") {
        if (!revealedMeaning && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          setRevealedMeaning(true);
        } else if (revealedMeaning && e.key === "1") {
          e.preventDefault();
          submitDirect(false, "(Chưa nhớ)");
        } else if (revealedMeaning && e.key === "2") {
          e.preventDefault();
          submitDirect(true, "(Đã nhớ)");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    done,
    feedback,
    goNext,
    currentItem,
    choiceOptions,
    promptSide,
    revealedMeaning,
    submitDirect,
  ]);

  if (done) {
    const totalCount = sessionWords.length;
    const missedWords = sessionWords.filter((w) => missedIds.has(w.id));
    const knownCount = Math.max(0, totalCount - missedWords.length);
    const pct = totalCount ? Math.round((knownCount / totalCount) * 100) : 100;

    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-6 text-center sm:p-8 md:p-10">
        <PartyPopper size={54} strokeWidth={1.2} className="mx-auto text-brand-hover" />
        <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Hoàn thành Luyện tập!</h1>
        <p className="mt-1.5 text-sm text-muted">
          {title} · {totalCount} từ vựng
        </p>

        {reviewSchedule && (
          <div className="mx-auto mt-4 inline-flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-brand/15 px-4 py-2 text-xs font-bold text-brand-hover">
            <CalendarClock size={15} />
            Đã hẹn tự ôn lại học phần sau {reviewSchedule.intervalDays} ngày (Mức {reviewSchedule.nextLevel}/5)
          </div>
        )}

        {srsMsg && (
          <div className="mx-auto mt-2.5 flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/15 px-3.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <Repeat size={13} /> {srsMsg}
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 gap-2.5 sm:gap-4">
          <div className="rounded-2xl bg-bg p-3 sm:p-4">
            <div className="text-xl font-bold text-brand-hover sm:text-2xl">{pct}%</div>
            <div className="mt-1 text-xs text-muted">Chính xác lần đầu</div>
          </div>
          <div className="rounded-2xl bg-emerald-500/15 p-3 sm:p-4 dark:bg-emerald-400/10">
            <div className="text-xl font-bold text-emerald-700 sm:text-2xl dark:text-emerald-300">
              {knownCount}
            </div>
            <div className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">
              Nhớ ngay
            </div>
          </div>
          <div className="rounded-2xl bg-orange-500/15 p-3 sm:p-4 dark:bg-orange-400/10">
            <div className="text-xl font-bold text-orange-700 sm:text-2xl dark:text-orange-300">
              {missedWords.length}
            </div>
            <div className="mt-1 text-xs text-orange-700/80 dark:text-orange-300/80">
              Đã ôn lại
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {missedWords.length > 0 && (
            <button
              type="button"
              onClick={() => resetSession(missedWords, learnMode)}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
            >
              <RotateCcw size={16} /> Luyện lại {missedWords.length} từ hay nhầm
            </button>
          )}
          <button
            type="button"
            onClick={() => resetSession(words, learnMode)}
            className="inline-flex items-center gap-2 rounded-full bg-line px-6 py-3 text-sm font-bold hover:bg-card-hover"
          >
            <RotateCcw size={16} /> Luyện lại toàn bộ
          </button>
          {onSwitchToFlashcards && (
            <button
              type="button"
              onClick={onSwitchToFlashcards}
              className="inline-flex items-center gap-2 rounded-full bg-line px-6 py-3 text-sm font-bold hover:bg-card-hover"
            >
              <Layers size={16} /> Chuyển sang Lật thẻ
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full bg-bg px-6 py-3 text-sm font-bold text-muted hover:text-ink"
          >
            <ArrowLeft size={16} /> Quay lại học phần
          </button>
        </div>
      </div>
    );
  }

  const card = currentItem.word;
  const totalMilestones =
    learnMode === "mixed" ? sessionWords.length * 2 : sessionWords.length;
  const completedMilestones =
    learnMode === "mixed"
      ? phase1PassedIds.size + masteredIds.size
      : masteredIds.size;
  const progressPct = Math.round(
    (completedMilestones / Math.max(1, totalMilestones)) * 100
  );

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
        >
          <ArrowLeft size={16} strokeWidth={1.75} /> {title}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {onSwitchToFlashcards && (
            <button
              type="button"
              onClick={onSwitchToFlashcards}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-muted hover:border-brand-hover hover:text-ink"
            >
              <Layers size={13} /> Lật thẻ
            </button>
          )}
          <span className="rounded-full bg-card px-3 py-1 text-xs font-bold">
            Đã thuộc: {masteredIds.size}/{sessionWords.length}
          </span>
        </div>
      </div>

      {/* Thanh tiến độ */}
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-card">
        <div
          className="h-full bg-brand-hover transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Chọn chế độ kiểu Quizlet */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap rounded-full border border-line bg-card p-0.5 text-xs font-semibold">
          {(
            [
              ["mixed", "Kết hợp", Sparkles],
              ["choice", "Trắc nghiệm", ListChecks],
              ["type", "Gõ từ", Keyboard],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              disabled={Boolean(feedback)}
              onClick={() => changeLearnMode(m)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 transition ${
                learnMode === m ? "bg-brand text-white" : "text-muted hover:text-ink"
              } disabled:opacity-60`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={Boolean(feedback)}
          onClick={() =>
            changePromptSide(promptSide === "meaning" ? "word" : "meaning")
          }
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-semibold text-ink hover:border-brand-hover disabled:opacity-50"
        >
          <ArrowLeftRight size={13} className="text-brand-hover" />
          {promptSide === "meaning" ? "Nghĩa → Từ" : "Từ → Nghĩa"}
        </button>
      </div>

      {/* Thẻ câu hỏi */}
      <div className="rounded-3xl border border-line bg-card p-5 shadow-xl sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                currentItem.phase === "choice"
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                  : "bg-violet-500/15 text-violet-700 dark:text-violet-300"
              }`}
            >
              {currentItem.phase === "choice"
                ? "Bước 1 · Trắc nghiệm"
                : learnMode === "mixed"
                  ? "Bước 2 · Nhớ chủ động"
                  : "Nhớ chủ động"}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${levelColor[card.level]}`}
            >
              {card.level} · {card.topic}
            </span>
            {currentItem.isRetry && (
              <span className="rounded-full bg-orange-500/15 px-3 py-1 text-xs font-bold text-orange-700 dark:text-orange-300">
                Ôn lại từ nhầm
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => speakWord(card.word)}
            className="inline-flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
          >
            <Volume2 size={15} /> Phát âm
          </button>
        </div>

        {/* Prompt */}
        <div className="my-7 space-y-3 text-center">
          {promptSide === "meaning" ? (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                {card.pos
                  ? `Từ loại: ${card.pos}`
                  : "Chọn hoặc gõ từ tiếng Anh tương ứng"}
              </div>
              <div className="break-words text-2xl font-bold text-brand-hover sm:text-3xl">
                {card.vi || card.en}
              </div>
              {card.vi && card.en && (
                <div className="mx-auto max-w-xl break-words text-sm text-muted sm:text-base">
                  {card.en}
                </div>
              )}

              {currentItem.phase === "type" && hintLevel >= 1 && !feedback && (
                <div className="mx-auto mt-3 max-w-lg space-y-2 rounded-2xl border border-line bg-bg/70 p-3.5 text-center">
                  <div className="font-mono text-sm font-bold tracking-widest text-ink sm:text-base">
                    {getProgressiveWordHint(card.word, hintLevel as 1 | 2 | 3)}
                  </div>
                  {hintLevel >= 2 && card.ipa && (
                    <div className="text-xs font-medium text-muted">
                      Phiên âm: {card.ipa}
                    </div>
                  )}
                  {card.example && (
                    <div className="text-xs italic text-muted">
                      “{maskWordInExample(card.example, card.word)}”
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                {card.pos
                  ? `Từ loại: ${card.pos}`
                  : "Hãy nhớ nghĩa tiếng Việt tương ứng"}
              </div>
              <div className="break-words text-3xl font-bold text-brand-hover sm:text-4xl">
                {card.word}
              </div>
              {card.ipa && (
                <div className="text-sm font-medium text-muted">{card.ipa}</div>
              )}
            </>
          )}
        </div>

        {/* Khu vực trả lời */}
        {!feedback ? (
          currentItem.phase === "choice" ? (
            <div className="mx-auto max-w-xl space-y-3">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {choiceOptions.map((opt, idx) => (
                  <button
                    key={`${opt.id}-${idx}`}
                    type="button"
                    onClick={() => submitDirect(opt.isCorrect, opt.label)}
                    className="group flex items-start gap-3 rounded-2xl border border-line bg-bg px-4 py-3.5 text-left transition hover:border-brand hover:bg-card-hover"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-card text-xs font-bold text-muted group-hover:bg-brand group-hover:text-white">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-bold text-ink sm:text-base">
                        {opt.label}
                      </div>
                      {opt.sub && (
                        <div className="text-xs text-muted">{opt.sub}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => submitDirect(false, "(Không nhớ)")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
                >
                  <Eye size={14} /> Không biết
                </button>
              </div>
            </div>
          ) : promptSide === "meaning" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitTypedAnswer(false);
              }}
              className="mx-auto max-w-md space-y-3"
            >
              <input
                ref={inputRef}
                type="text"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  if (softHintMsg) setSoftHintMsg("");
                }}
                placeholder="Gõ từ tiếng Anh và nhấn Enter..."
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full rounded-2xl border-2 border-line bg-bg px-4 py-3.5 text-center text-lg font-bold outline-none transition focus:border-brand"
              />

              {softHintMsg && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-center text-xs font-medium text-amber-800 dark:text-amber-300">
                  {softHintMsg}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="submit"
                  disabled={!typed.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-40"
                >
                  Kiểm tra (Enter)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setHintLevel((h) => (h < 3 ? ((h + 1) as 0 | 1 | 2 | 3) : 0))
                  }
                  className="inline-flex items-center gap-1.5 rounded-full bg-bg px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink"
                >
                  <Lightbulb size={15} />
                  {hintLevel === 3 ? "Ẩn gợi ý" : `Gợi ý (${hintLevel}/3)`}
                </button>
                <button
                  type="button"
                  onClick={() => submitTypedAnswer(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
                >
                  <Eye size={15} /> Không nhớ
                </button>
              </div>
            </form>
          ) : (
            <div className="mx-auto max-w-md space-y-4 text-center">
              {!revealedMeaning ? (
                <button
                  type="button"
                  onClick={() => setRevealedMeaning(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
                >
                  <Eye size={16} /> Hiện nghĩa & tự chấm (Space)
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-line bg-bg/70 p-4">
                    <div className="text-lg font-bold text-ink">
                      {card.vi || card.en}
                    </div>
                    {card.vi && card.en && (
                      <div className="mt-1 text-sm text-muted">{card.en}</div>
                    )}
                    {card.example && (
                      <div className="mt-2 text-xs italic text-muted">
                        “{card.example}”
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => submitDirect(false, "(Chưa nhớ)")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-5 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-500/25 dark:text-rose-300"
                    >
                      <XCircle size={16} /> Chưa nhớ (1)
                    </button>
                    <button
                      type="button"
                      onClick={() => submitDirect(true, "(Đã nhớ)")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-5 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
                    >
                      <Check size={16} /> Đã nhớ (2)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="mx-auto max-w-lg space-y-4">
            <div
              className={`rounded-2xl border p-4 text-center ${
                feedback.isCorrect
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              }`}
            >
              <div className="flex items-center justify-center gap-2 text-lg font-bold">
                {feedback.isCorrect ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <XCircle size={20} />
                )}
                {feedback.isCorrect ? "Chính xác!" : "Chưa chính xác"}
              </div>
              <div className="mt-2 text-2xl font-bold text-ink">{card.word}</div>
              {card.ipa && <div className="text-sm text-muted">{card.ipa}</div>}
              {(card.vi || card.en) && (
                <div className="mt-1 text-sm font-semibold text-ink/90">
                  {card.vi || card.en}
                </div>
              )}
              {!feedback.isCorrect && (
                <div className="mt-1 text-xs opacity-90">
                  Bạn đã chọn/nhập: {feedback.typed} · Đã đưa thẻ về cuối vòng để ôn lại
                </div>
              )}
              {card.example && (
                <div className="mt-3 rounded-xl bg-bg/70 px-3 py-2 text-xs italic text-muted">
                  “{card.example}”
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
              >
                Tiếp tục (Enter) <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        Phím tắt: 1–4 chọn trắc nghiệm · Enter kiểm tra / tiếp tục · Học phần này sẽ tự được hẹn ôn lại sau khi hoàn thành
      </p>
    </div>
  );
}
