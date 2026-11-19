"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CharacterLoader } from "@/components/CharacterLoader";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  Keyboard,
  Lightbulb,
  ListChecks,
  Loader2,
  PartyPopper,
  Repeat,
  Settings2,
  Trash2,
  Volume2,
  X,
  XCircle,
} from "lucide-react";
import { ReviewOverview } from "./ReviewOverview";
import { levelColor, type Word } from "@/lib/mock";
import { notifyDueUpdated } from "@/lib/due-events";
import { useMe } from "@/lib/use-me";
import { speakWord as speakTts } from "@/lib/tts";
import { VoiceSettingsButton } from "@/components/VoiceSettingsModal";
import {
  checkRecallSoftMatch,
  checkVietnameseMeaningMatch,
  clearAllReviews,
  computeLeitnerReview,
  DEFAULT_USER_SETTINGS,
  getProgressiveWordHint,
  getVietnameseMeaningHint,
  maskWordInExample,
  type LeitnerLevel,
  type UserSettings,
  type VietnameseMeaningMatchResult,
} from "@/lib/srs";
import type { ReviewWord } from "@/app/api/reviews/route";

type SessionItem = ReviewWord & {
  isRetryInSession?: boolean;
};

type PromptSide = "meaning" | "word";
type AnswerMode = "type" | "choice";

type ChoiceOption = {
  id: number;
  label: string;
  sub?: string;
  isCorrect: boolean;
};

type FeedbackState = {
  isCorrect: boolean;
  typed: string;
  nextLevel: LeitnerLevel;
  nextLabel: string;
  recoveryLevel: LeitnerLevel | null;
  recovered: boolean;
  wasRetry: boolean;
  meaningMatch?: VietnameseMeaningMatchResult;
} | null;

const PROMPT_SIDE_KEY = "ielts_review_prompt_side_v1";
const ANSWER_MODE_KEY = "ielts_review_answer_mode_v1";

const LEITNER_BADGE: Record<LeitnerLevel, { label: string; cls: string }> = {
  1: { label: "Lv.1 · Mới/Hay quên", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  2: { label: "Lv.2 · 3 ngày", cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  3: { label: "Lv.3 · 7 ngày", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  4: { label: "Lv.4 · 14 ngày", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  5: { label: "Lv.5 · 30+ ngày", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
};

function buildChoiceOptions(
  card: SessionItem,
  pool: Word[],
  queue: SessionItem[],
  promptSide: PromptSide
): ChoiceOption[] {
  const candidates = new Map<number, { word: string; vi: string; pos: string; level: string }>();
  for (const w of pool) {
    if (w.id !== card.id) {
      candidates.set(w.id, { word: w.word, vi: w.vi, pos: w.pos, level: w.level });
    }
  }
  for (const q of queue) {
    if (q.id !== card.id && !candidates.has(q.id)) {
      candidates.set(q.id, { word: q.word, vi: q.vi, pos: q.pos, level: q.level });
    }
  }

  const all = Array.from(candidates.entries())
    .map(([id, item]) => ({ id, ...item }))
    .filter((item) => (promptSide === "meaning" ? Boolean(item.word) : Boolean(item.vi)));

  // Ưu tiên từ cùng từ loại hoặc cùng cấp độ, sắp xếp ổn định theo hash id
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
  // Xáo trộn ổn định theo card.id
  for (let i = combined.length - 1; i > 0; i--) {
    const j = (card.id * 17 + i * 31) % (i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined;
}

export default function Review() {
  const { isAdmin } = useMe();
  const [queue, setQueue] = useState<SessionItem[]>([]);
  const [wordPool, setWordPool] = useState<Word[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [totalOverdueCount, setTotalOverdueCount] = useState(0);
  const [reviewedToday, setReviewedToday] = useState(0);
  const [dailyReviewLimit, setDailyReviewLimit] = useState(DEFAULT_USER_SETTINGS.daily_review_limit);
  const [dailyLimitRemaining, setDailyLimitRemaining] = useState(DEFAULT_USER_SETTINGS.daily_review_limit);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  const [levelCounts, setLevelCounts] = useState<Record<LeitnerLevel, number>>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"overview" | "session">("overview");
  const [startingSession, setStartingSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  // Active Recall state
  const [promptSide, setPromptSide] = useState<PromptSide>("meaning");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("type");
  const [typed, setTyped] = useState("");
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2 | 3>(0);
  const [softHintMsg, setSoftHintMsg] = useState("");
  const [selfGradeMode, setSelfGradeMode] = useState(false);
  const [revealedMeaning, setRevealedMeaning] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [reviewedInSession, setReviewedInSession] = useState(0);
  const [correctInSession, setCorrectInSession] = useState(0);

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const advancingRef = useRef(false);

  const updatePromptSide = useCallback((next: PromptSide) => {
    setPromptSide(next);
    setHintLevel(0);
    setSoftHintMsg("");
    setSelfGradeMode(false);
    setRevealedMeaning(false);
    setTyped("");
    try {
      localStorage.setItem(PROMPT_SIDE_KEY, next);
    } catch {
      // bỏ qua
    }
  }, []);

  const updateAnswerMode = useCallback((next: AnswerMode) => {
    setAnswerMode(next);
    setHintLevel(0);
    setSoftHintMsg("");
    setSelfGradeMode(false);
    setRevealedMeaning(false);
    try {
      localStorage.setItem(ANSWER_MODE_KEY, next);
    } catch {
      // bỏ qua
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErrMsg("");
    try {
      const [r, wRes] = await Promise.all([
        fetch("/api/reviews", { cache: "no-store" }),
        fetch("/api/words?scope=pool", { cache: "no-store" }),
      ]);
      if (r.ok) {
        const j = await r.json();
        setQueue(j.words ?? []);
        setDueCount(j.dueCount ?? 0);
        setTotalOverdueCount(j.totalOverdueCount ?? j.dueCount ?? 0);
        setReviewedToday(j.reviewedToday ?? 0);
        setDailyReviewLimit(j.dailyReviewLimit ?? DEFAULT_USER_SETTINGS.daily_review_limit);
        setDailyLimitRemaining(j.dailyLimitRemaining ?? 0);
        setEnrolledCount(j.enrolledCount ?? 0);
        setTotalWords(j.totalWords ?? 0);
        if (j.levelCounts) setLevelCounts(j.levelCounts);
        if (j.settings) {
          setSettings(j.settings);
          setDraftSettings(j.settings);
        }
        setTyped("");
        setHintLevel(0);
        setSoftHintMsg("");
        setSelfGradeMode(false);
        setRevealedMeaning(false);
        setFeedback(null);
        setReviewedInSession(0);
        setCorrectInSession(0);
      }
      if (wRes.ok) {
        const wJson = await wRes.json();
        setWordPool((wJson.words ?? []) as Word[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const savedSide = localStorage.getItem(PROMPT_SIDE_KEY);
        if (savedSide === "word" || savedSide === "meaning") setPromptSide(savedSide);
        const savedMode = localStorage.getItem(ANSWER_MODE_KEY);
        if (savedMode === "type" || savedMode === "choice") setAnswerMode(savedMode);
      } catch {
        // bỏ qua
      }
      void load();
    });
    return () => cancelAnimationFrame(id);
  }, [load]);

  const card = queue[0];

  useEffect(() => {
    if (
      viewMode === "session" &&
      card &&
      !feedback &&
      answerMode === "type" &&
      (promptSide === "meaning" || !selfGradeMode)
    ) {
      inputRef.current?.focus();
    }
  }, [viewMode, card, feedback, answerMode, promptSide, selfGradeMode]);

  const startSession = useCallback(async () => {
    if (startingSession) return;
    if (queue.length > 0) {
      setViewMode("session");
      return;
    }
    setStartingSession(true);
    try {
      await load();
      setViewMode("session");
    } finally {
      setStartingSession(false);
    }
  }, [startingSession, queue.length, load]);

  const backToOverview = useCallback(() => {
    setViewMode("overview");
    void load();
  }, [load]);

  const speakWord = useCallback((word: string) => {
    speakTts(word);
  }, []);

  const handleClearAll = async () => {
    if (clearing) return;
    const answer = window.prompt(
      `CẢNH BÁO: Thao tác này sẽ xoá toàn bộ ${enrolledCount} từ khỏi danh sách ôn tập và MẤT HẾT Level (1–5) lẫn lịch sử ôn tập của chúng (từ vựng trong Kho vẫn giữ nguyên).\n\nNhập chính xác chữ XOA để xác nhận:`
    );
    if (answer?.trim().toUpperCase() !== "XOA") {
      return;
    }
    setClearing(true);
    setErrMsg("");
    try {
      await clearAllReviews();
      setQueue([]);
      setDueCount(0);
      setTotalOverdueCount(0);
      setEnrolledCount(0);
      setLevelCounts({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
      setFeedback(null);
      setTyped("");
      setSettingsOpen(false);
      notifyDueUpdated(0);
    } catch (e) {
      setErrMsg((e as Error).message);
    } finally {
      setClearing(false);
    }
  };

  const commitReviewToServer = useCallback(
    (targetCard: SessionItem, isCorrect: boolean) => {
      const isRetry = Boolean(targetCard.isRetryInSession);
      setReviewedInSession((n) => n + 1);
      if (isCorrect) {
        setCorrectInSession((n) => n + 1);
        if (!isRetry) {
          const nextDue = Math.max(0, dueCount - 1);
          setReviewedToday((n) => n + 1);
          setDueCount(nextDue);
          setTotalOverdueCount((c) => Math.max(0, c - 1));
          setDailyLimitRemaining((c) => Math.max(0, c - 1));
          notifyDueUpdated(nextDue);
        }
      }

      // Lưu kết quả lên server ở nền để không làm trễ phản hồi đúng/sai
      void fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wordId: targetCard.id,
          isCorrect,
          isRetryInSession: isRetry,
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || "Không lưu được kết quả ôn tập");
          }
        })
        .catch((e: Error) => {
          setErrMsg(e.message);
        });
    },
    [dueCount]
  );

  const submitDirect = useCallback(
    async (
      isCorrect: boolean,
      displayLabel: string,
      meaningMatch?: VietnameseMeaningMatchResult
    ) => {
      if (!card || feedback) return;
      const isRetry = Boolean(card.isRetryInSession);
      const computed = computeLeitnerReview(
        {
          level: card.level_srs,
          level5_streak: card.level5_streak,
          recovery_level: card.recovery_level ?? null,
        },
        isCorrect,
        isRetry
      );

      advancingRef.current = false;
      setErrMsg("");
      setSoftHintMsg("");
      speakWord(card.word);
      setFeedback({
        isCorrect,
        typed: displayLabel,
        nextLevel: computed.level,
        nextLabel: computed.label,
        recoveryLevel: computed.recovery_level,
        recovered: computed.recovered,
        wasRetry: isRetry,
        meaningMatch,
      });
    },
    [card, feedback, speakWord]
  );

  const submitAnswer = useCallback(
    async (forceWrong = false) => {
      if (!card || saving || feedback) return;
      const trimmed = typed.trim();
      if (!forceWrong && !trimmed) return;

      if (!forceWrong) {
        const match = checkRecallSoftMatch(trimmed, card.word, card.synonyms ?? []);
        if (match === "synonym") {
          setSoftHintMsg(
            `Từ "${trimmed}" đồng nghĩa, nhưng thẻ này cần từ bắt đầu bằng "${card.word.slice(0, 1).toUpperCase()}..." — hãy thử gõ lại nhé!`
          );
          return;
        }
        if (match === "typo") {
          setSoftHintMsg("Gần đúng rồi (lệch 1 ký tự), hãy kiểm tra lại chính tả và thử lại!");
          return;
        }
        await submitDirect(match === "exact", trimmed);
        return;
      }

      await submitDirect(false, "(Không nhớ)");
    },
    [card, saving, feedback, typed, submitDirect]
  );

  const submitMeaningAnswer = useCallback(
    async (forceWrong = false) => {
      if (!card || saving || feedback) return;
      const trimmed = typed.trim();
      if (!forceWrong && !trimmed) return;

      if (forceWrong) {
        const emptyMatch = checkVietnameseMeaningMatch("", card.vi, card.en);
        await submitDirect(false, "(Không nhớ)", emptyMatch);
        return;
      }

      const result = checkVietnameseMeaningMatch(trimmed, card.vi, card.en);
      await submitDirect(result.isCorrect, trimmed, result);
    },
    [card, saving, feedback, typed, submitDirect]
  );

  const advanceWithResult = useCallback(
    (finalCorrect: boolean) => {
      if (!card || !feedback || advancingRef.current) return;
      advancingRef.current = true;
      commitReviewToServer(card, finalCorrect);
      const nextComputed = computeLeitnerReview(
        {
          level: card.level_srs,
          level5_streak: card.level5_streak,
          recovery_level: card.recovery_level ?? null,
        },
        finalCorrect,
        Boolean(card.isRetryInSession)
      );
      setQueue((prev) => {
        const rest = prev.slice(1);
        if (!finalCorrect) {
          const retryItem: SessionItem = {
            ...card,
            level_srs: 1,
            level5_streak: 0,
            recovery_level: nextComputed.recovery_level,
            isRetryInSession: true,
          };
          return [...rest, retryItem];
        }
        return rest;
      });
      setTyped("");
      setHintLevel(0);
      setSoftHintMsg("");
      setSelfGradeMode(false);
      setRevealedMeaning(false);
      setFeedback(null);
    },
    [card, feedback, commitReviewToServer]
  );

  const goNext = useCallback(() => {
    if (!card || !feedback) return;
    advanceWithResult(feedback.isCorrect);
  }, [card, feedback, advanceWithResult]);

  const overrideAsCorrectAndNext = useCallback(() => {
    if (!card || !feedback) return;
    advanceWithResult(true);
  }, [card, feedback, advanceWithResult]);

  const overrideAsWrongAndNext = useCallback(() => {
    if (!card || !feedback) return;
    advanceWithResult(false);
  }, [card, feedback, advanceWithResult]);

  const choiceOptions = useMemo(
    () => (card ? buildChoiceOptions(card, wordPool, queue, promptSide) : []),
    [card, wordPool, queue, promptSide]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewMode !== "session" || settingsOpen || e.isComposing) return;
      if (feedback) {
        if (e.key === "Enter") {
          e.preventDefault();
          goNext();
        }
        return;
      }
      if (!card || saving) return;

      if (answerMode === "choice" && ["1", "2", "3", "4"].includes(e.key)) {
        const idx = Number(e.key) - 1;
        const opt = choiceOptions[idx];
        if (opt) {
          e.preventDefault();
          void submitDirect(opt.isCorrect, opt.label);
        }
        return;
      }

      if (answerMode === "type" && promptSide === "word" && selfGradeMode) {
        if (!revealedMeaning && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          setRevealedMeaning(true);
        } else if (revealedMeaning && e.key === "1") {
          e.preventDefault();
          void submitDirect(false, "(Chưa nhớ)");
        } else if (revealedMeaning && e.key === "2") {
          e.preventDefault();
          void submitDirect(true, "(Đã nhớ)");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    viewMode,
    settingsOpen,
    feedback,
    goNext,
    card,
    saving,
    answerMode,
    promptSide,
    selfGradeMode,
    choiceOptions,
    revealedMeaning,
    submitDirect,
  ]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftSettings),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Không lưu được cài đặt");
      setSettingsOpen(false);
      await load();
      notifyDueUpdated();
    } catch (err) {
      setErrMsg((err as Error).message);
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <CharacterLoader mode="reading" indicator="dots" size="md" />
      </div>
    );
  }

  if (totalWords === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl bg-card p-8 text-center sm:p-10">
        <Repeat size={44} strokeWidth={1.3} className="mx-auto text-brand-hover" />
        <h1 className="mt-4 text-2xl font-bold">Chưa có từ nào trong kho</h1>
        <p className="mt-2 text-muted">Hãy nạp từ vựng vào kho và tạo học phần trước khi ôn tập.</p>
        <Link href="/vocab/bank" className="mt-6 inline-block rounded-full bg-brand px-6 py-3 font-bold text-white hover:bg-brand-hover hover:text-bg">
          Đi tới Kho từ vựng
        </Link>
      </div>
    );
  }

  const settingsModal = settingsOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={handleSaveSettings}
        className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Cài đặt ôn tập</h2>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="rounded-lg p-1 text-muted hover:bg-bg hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm">
          <label className="block">
            <span className="font-semibold">Giới hạn từ ôn tối đa / ngày</span>
            <p className="text-xs text-muted">Mặc định 50 từ. Khi vượt mức, hệ thống tạm dời từ mới sang ngày sau.</p>
            <input
              type="number"
              min={5}
              max={500}
              value={draftSettings.daily_review_limit}
              onChange={(e) =>
                setDraftSettings((s) => ({ ...s, daily_review_limit: Number(e.target.value) }))
              }
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2 font-semibold outline-none focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="font-semibold">Giới hạn từ mới nạp vào hàng chờ / ngày</span>
            <p className="text-xs text-muted">Mặc định 15 từ mới/ngày để tránh dồn cục sau 3–7 ngày.</p>
            <input
              type="number"
              min={0}
              max={200}
              value={draftSettings.daily_new_limit}
              onChange={(e) =>
                setDraftSettings((s) => ({ ...s, daily_new_limit: Number(e.target.value) }))
              }
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2 font-semibold outline-none focus:border-brand"
            />
          </label>

          <label className="block">
            <span className="font-semibold">Số từ mỗi phiên học (Session batch)</span>
            <p className="text-xs text-muted">Khuyến nghị 10–15 từ để hoàn thành gọn trong một phiên ngắn.</p>
            <input
              type="number"
              min={5}
              max={50}
              value={draftSettings.session_size}
              onChange={(e) =>
                setDraftSettings((s) => ({ ...s, session_size: Number(e.target.value) }))
              }
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2 font-semibold outline-none focus:border-brand"
            />
          </label>

          <div className="border-t border-line pt-3">
            <span className="font-semibold">Mặt hiển thị câu hỏi</span>
            <p className="text-xs text-muted">Chọn xem nghĩa để nhớ từ tiếng Anh hoặc xem từ để nhớ nghĩa.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updatePromptSide("meaning")}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  promptSide === "meaning"
                    ? "border-brand bg-brand/15 text-brand-hover"
                    : "border-line bg-bg text-muted hover:text-ink"
                }`}
              >
                Nghĩa → Từ
              </button>
              <button
                type="button"
                onClick={() => updatePromptSide("word")}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  promptSide === "word"
                    ? "border-brand bg-brand/15 text-brand-hover"
                    : "border-line bg-bg text-muted hover:text-ink"
                }`}
              >
                Từ → Nghĩa
              </button>
            </div>
          </div>

          <div>
            <span className="font-semibold">Chế độ trả lời</span>
            <p className="text-xs text-muted">Gõ phím (có gợi ý 3 mức) hoặc Trắc nghiệm 4 đáp án.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateAnswerMode("type")}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  answerMode === "type"
                    ? "border-brand bg-brand/15 text-brand-hover"
                    : "border-line bg-bg text-muted hover:text-ink"
                }`}
              >
                Gõ từ / Tự chấm
              </button>
              <button
                type="button"
                onClick={() => updateAnswerMode("choice")}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  answerMode === "choice"
                    ? "border-brand bg-brand/15 text-brand-hover"
                    : "border-line bg-bg text-muted hover:text-ink"
                }`}
              >
                Trắc nghiệm (1–4)
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="rounded-full bg-line px-4 py-2 text-sm font-bold hover:bg-card-hover"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={savingSettings}
            className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-50"
          >
            {savingSettings ? "Đang lưu..." : "Lưu cài đặt"}
          </button>
        </div>

        {enrolledCount > 0 && (
          <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-xs">
            <span className="text-muted">
              {isAdmin
                ? `Xoá toàn bộ tiến độ Level (${enrolledCount} từ)`
                : `Xoá danh sách ôn hiện tại (${enrolledCount} từ)`}
            </span>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearing}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 disabled:opacity-40"
            >
              <Trash2 size={12} /> {clearing ? "Đang xoá..." : "Xoá danh sách ôn"}
            </button>
          </div>
        )}
      </form>
    </div>
  );

  if (viewMode === "overview") {
    return (
      <>
        {settingsModal}
        {errMsg && (
          <div className="mx-auto mb-4 max-w-2xl rounded-xl bg-rose-500/15 px-4 py-2.5 text-sm text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
            {errMsg}
          </div>
        )}
        <ReviewOverview
          enrolledCount={enrolledCount}
          totalWords={totalWords}
          dueCount={dueCount}
          totalOverdueCount={totalOverdueCount}
          reviewedToday={reviewedToday}
          dailyReviewLimit={dailyReviewLimit}
          dailyLimitRemaining={dailyLimitRemaining}
          levelCounts={levelCounts}
          startingSession={startingSession}
          onStartSession={startSession}
          onOpenSettings={() => {
            setDraftSettings(settings);
            setSettingsOpen(true);
          }}
        />
      </>
    );
  }

  if (!card) {
    const hasMoreToday = dailyLimitRemaining > 0 && totalOverdueCount > 0;
    const hitDailyLimit = dailyLimitRemaining === 0 && totalOverdueCount > 0;

    return (
      <div className="mx-auto max-w-xl rounded-3xl bg-card p-8 text-center shadow-xl shadow-slate-900/5 dark:shadow-black/30 sm:p-10">
        {settingsModal}
        <PartyPopper size={52} strokeWidth={1.2} className="mx-auto text-brand-hover" />
        <h1 className="mt-4 text-2xl font-bold">
          {enrolledCount === 0
            ? "Chưa có từ nào trong danh sách ôn"
            : hitDailyLimit
              ? "Đã đạt chỉ tiêu ôn tập hôm nay!"
              : "Hoàn thành phiên ôn tập!"}
        </h1>
        <p className="mt-2 text-muted">
          {reviewedInSession > 0
            ? `Bạn đã hoàn thành phiên với ${correctInSession}/${reviewedInSession} lượt gõ đúng. Hôm nay đã ôn ${reviewedToday}/${dailyReviewLimit} từ.`
            : enrolledCount === 0
              ? "Chỉ những từ trong Học phần đã học hoặc Bộ sách / từ bạn chọn chuyển vào mới xuất hiện tại đây."
              : hitDailyLimit
                ? `Bạn đã hoàn thành ${reviewedToday}/${dailyReviewLimit} từ chỉ tiêu hôm nay. Còn ${totalOverdueCount} từ tồn đọng sẽ được ưu tiên vào ngày mai.`
                : "Hiện tại không có từ nào đến hạn ôn. Hãy học thêm học phần hoặc quay lại sau."}
        </p>

        {enrolledCount > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-1.5 text-xs">
            {([1, 2, 3, 4, 5] as LeitnerLevel[]).map((lv) => (
              <span key={lv} className={`rounded-full px-2.5 py-1 font-semibold ${LEITNER_BADGE[lv].cls}`}>
                Lv.{lv}: {levelCounts[lv] ?? 0}
              </span>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {hasMoreToday && (
            <button
              type="button"
              onClick={load}
              className="rounded-full bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
            >
              Ôn tiếp phiên mới ({Math.min(settings.session_size, dueCount)} từ)
            </button>
          )}
          <button
            type="button"
            onClick={backToOverview}
            className="inline-flex items-center gap-1.5 rounded-full bg-line px-5 py-3 text-sm font-bold hover:bg-card-hover"
          >
            <ArrowLeft size={15} /> Xem biểu đồ 5 Level
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftSettings(settings);
              setSettingsOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-line px-5 py-3 text-sm font-bold hover:bg-card-hover"
          >
            <Settings2 size={16} /> Cài đặt ({dailyReviewLimit}/ngày)
          </button>
          <Link href="/vocab" className="rounded-full bg-line px-6 py-3 text-sm font-bold hover:bg-card-hover">
            Đi tới Thẻ ghi nhớ
          </Link>
        </div>
      </div>
    );
  }

  const totalSession = reviewedInSession + queue.length;
  const lvMeta = LEITNER_BADGE[card.level_srs];

  return (
    <div className="mx-auto max-w-3xl">
      {settingsModal}

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={backToOverview}
            className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-muted transition hover:text-ink"
          >
            <ArrowLeft size={14} /> Quay lại tổng quan 5 Level
          </button>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Repeat size={24} strokeWidth={1.6} className="text-brand-hover" />{" "}
            {isAdmin ? "Ôn tập Leitner (Active Recall)" : "Ôn tập từ vựng"}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Chỉ tiêu hôm nay: <b className="text-ink">{reviewedToday}/{dailyReviewLimit}</b> · Còn{" "}
            <b className="text-ink">{dueCount} từ</b>
            {totalOverdueCount > dailyLimitRemaining && (
              <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                Tổng tồn đọng: {totalOverdueCount}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <VoiceSettingsButton variant="compact" />
          <button
            type="button"
            onClick={() => {
              setDraftSettings(settings);
              setSettingsOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-xs font-bold shadow-sm shadow-slate-900/5 transition hover:bg-card-hover hover:shadow-md dark:shadow-black/25"
          >
            <Settings2 size={14} /> Cài đặt
          </button>
          <div className="ml-1 font-bold">
            {Math.min(reviewedInSession + 1, totalSession)} / {totalSession}
          </div>
        </div>
      </div>

      {/* Phân bố 5 Level (chỉ Admin xem) */}
      {isAdmin && (
        <div className="mb-4 flex flex-wrap gap-1.5 text-[11px]">
          {([1, 2, 3, 4, 5] as LeitnerLevel[]).map((lv) => (
            <span key={lv} className={`rounded-full px-2.5 py-0.5 font-semibold ${LEITNER_BADGE[lv].cls}`}>
              Lv.{lv}: {levelCounts[lv] ?? 0}
            </span>
          ))}
        </div>
      )}

      {errMsg && (
        <div className="mb-4 rounded-xl bg-rose-500/15 px-4 py-2.5 text-sm text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
          {errMsg}
        </div>
      )}

      {/* Thanh tiến độ phiên */}
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-card">
        <div
          className="h-full bg-brand-hover transition-all"
          style={{ width: `${(reviewedInSession / Math.max(1, totalSession)) * 100}%` }}
        />
      </div>

      {/* Thẻ Active Recall */}
      <div className="rounded-3xl bg-card p-6 shadow-xl shadow-slate-900/5 dark:shadow-black/30 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${lvMeta.cls}`}>
                {lvMeta.label}
              </span>
            )}
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${levelColor[card.level]}`}>
              {card.level} · {card.topic}
            </span>
            {card.isRetryInSession && (
              <span className="rounded-full bg-orange-500/15 px-3 py-1 text-xs font-bold text-orange-700 dark:text-orange-300">
                Ôn lại cuối phiên
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => speakWord(card.word)}
            title="Nghe phát âm"
            className="inline-flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
          >
            <Volume2 size={16} strokeWidth={1.75} /> Nghe phát âm
          </button>
        </div>

        {/* Thanh chuyển nhanh mặt thẻ & chế độ trả lời */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
          <button
            type="button"
            disabled={saving || Boolean(feedback)}
            onClick={() => updatePromptSide(promptSide === "meaning" ? "word" : "meaning")}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand disabled:opacity-50"
          >
            <ArrowLeftRight size={13} className="text-brand-hover" />
            {promptSide === "meaning" ? "Nghĩa → Từ" : "Từ → Nghĩa"}
          </button>

          <div className="inline-flex rounded-full border border-line bg-bg p-0.5 text-xs font-semibold">
            <button
              type="button"
              disabled={saving || Boolean(feedback)}
              onClick={() => updateAnswerMode("type")}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 transition ${
                answerMode === "type"
                  ? "bg-brand text-white"
                  : "text-muted hover:text-ink"
              } disabled:opacity-60`}
            >
              <Keyboard size={13} /> Gõ từ
            </button>
            <button
              type="button"
              disabled={saving || Boolean(feedback)}
              onClick={() => updateAnswerMode("choice")}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 transition ${
                answerMode === "choice"
                  ? "bg-brand text-white"
                  : "text-muted hover:text-ink"
              } disabled:opacity-60`}
            >
              <ListChecks size={13} /> Trắc nghiệm
            </button>
          </div>
        </div>

        {/* Khu vực câu hỏi (Prompt) */}
        <div className="my-7 space-y-3 text-center">
          {promptSide === "meaning" ? (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                {card.pos ? `Từ loại: ${card.pos}` : "Hãy nhớ từ tiếng Anh tương ứng"}
              </div>
              <div className="break-words text-2xl font-bold text-brand-hover sm:text-3xl">
                {card.vi || card.en}
              </div>
              {card.vi && card.en && (
                <div className="mx-auto max-w-xl break-words text-sm text-muted sm:text-base">
                  {card.en}
                </div>
              )}

              {answerMode === "type" && hintLevel >= 1 && !feedback && (
                <div className="mx-auto mt-3 max-w-lg space-y-2 rounded-2xl border border-line bg-bg/70 p-3.5 text-center">
                  <div className="font-mono text-sm font-bold tracking-widest text-ink sm:text-base">
                    {getProgressiveWordHint(card.word, hintLevel as 1 | 2 | 3)}
                  </div>
                  {hintLevel >= 2 && card.ipa && (
                    <div className="text-xs font-medium text-muted">Phiên âm: {card.ipa}</div>
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
                {card.pos ? `Từ loại: ${card.pos}` : "Gõ nghĩa tiếng Việt tương ứng"}
              </div>
              <div className="break-words text-3xl font-bold text-brand-hover sm:text-4xl">
                {card.word}
              </div>
              {card.ipa && <div className="text-sm font-medium text-muted">{card.ipa}</div>}

              {answerMode === "type" && hintLevel >= 1 && !feedback && (
                <div className="mx-auto mt-3 max-w-lg space-y-2 rounded-2xl border border-line bg-bg/70 p-3.5 text-center">
                  <div className="font-mono text-sm font-bold tracking-wider text-ink sm:text-base">
                    {getVietnameseMeaningHint(card.vi, hintLevel as 1 | 2 | 3, card.en)}
                  </div>
                  {hintLevel >= 2 && card.example && (
                    <div className="text-xs italic text-muted">“{card.example}”</div>
                  )}
                  {hintLevel >= 3 && card.vi && card.en && (
                    <div className="text-xs font-medium text-muted">Định nghĩa EN: {card.en}</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Khu vực trả lời */}
        {!feedback ? (
          answerMode === "choice" ? (
            <div className="mx-auto max-w-xl space-y-3">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {choiceOptions.map((opt, idx) => (
                  <button
                    key={`${opt.id}-${idx}`}
                    type="button"
                    disabled={saving}
                    onClick={() => void submitDirect(opt.isCorrect, opt.label)}
                    className="group flex items-start gap-3 rounded-2xl border border-line bg-bg px-4 py-3.5 text-left transition hover:border-brand hover:bg-card-hover disabled:opacity-50"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-card text-xs font-bold text-muted group-hover:bg-brand group-hover:text-white">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-bold text-ink sm:text-base">
                        {opt.label}
                      </div>
                      {opt.sub && <div className="text-xs text-muted">{opt.sub}</div>}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => void submitDirect(false, "(Không nhớ)")}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
                >
                  <Eye size={14} /> Không nhớ
                </button>
              </div>
            </div>
          ) : promptSide === "meaning" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitAnswer(false);
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
                disabled={saving}
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
                  disabled={saving || !typed.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-40"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : "Kiểm tra (Enter)"}
                </button>
                <button
                  type="button"
                  onClick={() => setHintLevel((h) => (h < 3 ? ((h + 1) as 0 | 1 | 2 | 3) : 0))}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-full bg-bg px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink"
                >
                  <Lightbulb size={15} />
                  {hintLevel === 3 ? "Ẩn gợi ý" : `Gợi ý (${hintLevel}/3)`}
                </button>
                <button
                  type="button"
                  onClick={() => void submitAnswer(true)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
                >
                  <Eye size={15} /> Không nhớ
                </button>
              </div>
            </form>
          ) : !selfGradeMode ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitMeaningAnswer(false);
              }}
              className="mx-auto max-w-md space-y-3"
            >
              <input
                ref={inputRef}
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={saving}
                placeholder="Gõ nghĩa tiếng Việt (có dấu hoặc không dấu)..."
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-2xl border-2 border-line bg-bg px-4 py-3.5 text-center text-lg font-bold outline-none transition focus:border-brand"
              />

              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="submit"
                  disabled={saving || !typed.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-40"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : "Kiểm tra (Enter)"}
                </button>
                <button
                  type="button"
                  onClick={() => setHintLevel((h) => (h < 3 ? ((h + 1) as 0 | 1 | 2 | 3) : 0))}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-full bg-bg px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink"
                >
                  <Lightbulb size={15} />
                  {hintLevel === 3 ? "Ẩn gợi ý" : `Gợi ý (${hintLevel}/3)`}
                </button>
                <button
                  type="button"
                  onClick={() => void submitMeaningAnswer(true)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
                >
                  <Eye size={15} /> Không nhớ
                </button>
              </div>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setSelfGradeMode(true);
                    setRevealedMeaning(false);
                  }}
                  className="text-xs font-semibold text-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  Hoặc tự chấm nhanh (không cần gõ)
                </button>
              </div>
            </form>
          ) : (
            <div className="mx-auto max-w-md space-y-4 text-center">
              {!revealedMeaning ? (
                <button
                  type="button"
                  onClick={() => setRevealedMeaning(true)}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
                >
                  <Eye size={16} /> Hiện nghĩa & tự chấm (Space)
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-line bg-bg/70 p-4">
                    <div className="text-lg font-bold text-ink">{card.vi || card.en}</div>
                    {card.vi && card.en && (
                      <div className="mt-1 text-sm text-muted">{card.en}</div>
                    )}
                    {card.example && (
                      <div className="mt-2 text-xs italic text-muted">“{card.example}”</div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void submitDirect(false, "(Chưa nhớ)")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-5 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-500/25 dark:text-rose-300"
                    >
                      <XCircle size={16} /> Chưa nhớ (1)
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void submitDirect(true, "(Đã nhớ)")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-5 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
                    >
                      <Check size={16} /> Đã nhớ (2)
                    </button>
                  </div>
                </div>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setSelfGradeMode(false);
                    setRevealedMeaning(false);
                  }}
                  className="text-xs font-semibold text-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  Quay lại ô gõ nghĩa tiếng Việt
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="mx-auto max-w-lg space-y-4">
            <div
              className={`rounded-2xl border p-4 text-center ${
                feedback.isCorrect
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : feedback.meaningMatch?.status === "partial"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              }`}
            >
              <div className="flex items-center justify-center gap-2 text-lg font-bold">
                {feedback.isCorrect ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                {feedback.isCorrect
                  ? "Chính xác!"
                  : feedback.meaningMatch?.status === "partial"
                    ? "Khớp một phần"
                    : "Chưa chính xác"}
              </div>

              {feedback.meaningMatch && (
                <div className="mt-2.5 space-y-2 rounded-xl bg-bg/75 p-3 text-xs text-ink">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="rounded-full bg-card px-2.5 py-0.5 font-bold">
                      Trùng {feedback.meaningMatch.matchedCount}/
                      {feedback.meaningMatch.totalTargetWords} từ (
                      {feedback.meaningMatch.matchPct}%)
                    </span>
                    {feedback.meaningMatch.usedAccentInsensitive && (
                      <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 font-semibold text-sky-700 dark:text-sky-300">
                        Khớp không dấu
                      </span>
                    )}
                  </div>

                  {feedback.meaningMatch.clauseBreakdown.length > 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {feedback.meaningMatch.clauseBreakdown.map((item, i) => (
                        <span
                          key={`${item.word}-${i}`}
                          className={`rounded-md px-2 py-0.5 font-semibold ${
                            item.matched
                              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                              : "border border-dashed border-line bg-bg text-muted"
                          }`}
                        >
                          {item.word}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="text-muted">
                    Bạn đã gõ: <b className="text-ink">{feedback.typed}</b>
                  </div>
                </div>
              )}

              <div className="mt-3 text-2xl font-bold text-ink">{card.word}</div>
              {card.ipa && <div className="text-sm text-muted">{card.ipa}</div>}
              {(card.vi || card.en) && (
                <div className="mt-1 text-sm font-semibold text-ink/90">{card.vi || card.en}</div>
              )}
              {!feedback.isCorrect && !feedback.meaningMatch && (
                <div className="mt-1 text-xs opacity-90">Bạn đã chọn/nhập: {feedback.typed}</div>
              )}
              {card.example && (
                <div className="mt-3 rounded-xl bg-bg/70 px-3 py-2 text-xs italic text-muted">
                  “{card.example}”
                </div>
              )}
              <div className="mt-3 text-xs font-semibold">
                {isAdmin
                  ? feedback.isCorrect
                    ? feedback.recovered
                      ? `Phục hồi về Level ${feedback.nextLevel} · Ôn lại sau ${feedback.nextLabel}`
                      : feedback.wasRetry
                        ? `Giữ Level 1 · Hẹn xác nhận lại sau ${feedback.nextLabel}`
                        : `Đạt Level ${feedback.nextLevel} · Ôn lại sau ${feedback.nextLabel}`
                    : feedback.recoveryLevel !== null
                      ? `Tụt tạm về Level 1 (10 phút) · Trả lời đúng lại sẽ phục hồi về Level ${feedback.recoveryLevel}`
                      : "Tụt về Level 1 (10 phút) · Đã đưa vào cuối phiên để ôn lại"
                  : feedback.isCorrect
                    ? "Đã ghi nhớ từ này!"
                    : "Đã đưa vào cuối phiên để ôn lại"}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
              >
                Tiếp tục (Enter) <ArrowRight size={16} />
              </button>
              {!feedback.isCorrect ? (
                <button
                  type="button"
                  onClick={overrideAsCorrectAndNext}
                  title="Hệ thống chấm chưa đúng hoặc bạn đã hiểu đúng ý? Xác nhận đạt & cho qua"
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-5 py-3 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/25 dark:text-emerald-300 sm:text-sm"
                >
                  <Check size={16} /> Tôi hiểu đúng ý / Cho qua
                </button>
              ) : (
                <button
                  type="button"
                  onClick={overrideAsWrongAndNext}
                  title="Hệ thống chấm nhầm? Đánh dấu tôi làm sai & ôn lại cuối phiên"
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/15 px-5 py-3 text-xs font-bold text-rose-700 transition hover:bg-rose-500/25 dark:text-rose-300 sm:text-sm"
                >
                  <X size={16} /> Tôi làm sai
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        {isAdmin
          ? "Quy tắc Leitner: Đúng tăng cấp (1→2→3→4→5: 1d→3d→7d→14d→30d→60d→90d) · Sai tụt về Level 1 và ôn lại cuối phiên."
          : "Phím tắt: Enter kiểm tra / tiếp tục · 1–4 chọn đáp án (chế độ trắc nghiệm)."}
      </p>
    </div>
  );
}
