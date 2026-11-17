"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  Lightbulb,
  Loader2,
  PartyPopper,
  Repeat,
  Settings2,
  Trash2,
  Volume2,
  X,
  XCircle,
} from "lucide-react";
import { levelColor } from "@/lib/mock";
import { notifyDueUpdated } from "@/lib/due-events";
import {
  checkRecallAnswer,
  clearAllReviews,
  computeLeitnerReview,
  DEFAULT_USER_SETTINGS,
  getWordHint,
  type LeitnerLevel,
  type UserSettings,
} from "@/lib/srs";
import type { ReviewWord } from "@/app/api/reviews/route";

type SessionItem = ReviewWord & {
  isRetryInSession?: boolean;
};

type FeedbackState = {
  isCorrect: boolean;
  typed: string;
  nextLevel: LeitnerLevel;
  nextLabel: string;
  wasRetry: boolean;
} | null;

const LEITNER_BADGE: Record<LeitnerLevel, { label: string; cls: string }> = {
  1: { label: "Lv.1 · Mới/Hay quên", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  2: { label: "Lv.2 · 3 ngày", cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  3: { label: "Lv.3 · 7 ngày", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  4: { label: "Lv.4 · 14 ngày", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  5: { label: "Lv.5 · 30+ ngày", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
};

export default function Review() {
  const [queue, setQueue] = useState<SessionItem[]>([]);
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
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  // Active Recall state
  const [typed, setTyped] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [reviewedInSession, setReviewedInSession] = useState(0);
  const [correctInSession, setCorrectInSession] = useState(0);

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrMsg("");
    try {
      const r = await fetch("/api/reviews", { cache: "no-store" });
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
        setShowHint(false);
        setFeedback(null);
        setReviewedInSession(0);
        setCorrectInSession(0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(id);
  }, [load]);

  const card = queue[0];

  useEffect(() => {
    if (card && !feedback) {
      inputRef.current?.focus();
    }
  }, [card, feedback]);

  const speakWord = useCallback((word: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-GB";
    speechSynthesis.speak(u);
  }, []);

  const handleClearAll = async () => {
    if (clearing) return;
    if (!confirm("Xoá toàn bộ từ khỏi danh sách ôn tập ngắt quãng? (Từ vựng trong Kho vẫn được giữ nguyên)")) {
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
      notifyDueUpdated();
    } catch (e) {
      setErrMsg((e as Error).message);
    } finally {
      setClearing(false);
    }
  };

  const submitAnswer = useCallback(
    async (forceWrong = false) => {
      if (!card || saving || feedback) return;
      const trimmed = typed.trim();
      if (!forceWrong && !trimmed) return;

      const isCorrect = !forceWrong && checkRecallAnswer(trimmed, card.word);
      const isRetry = Boolean(card.isRetryInSession);
      const computed = computeLeitnerReview(
        { level: card.level_srs, level5_streak: card.level5_streak },
        isCorrect,
        isRetry
      );

      setSaving(true);
      setErrMsg("");
      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wordId: card.id,
            isCorrect,
            isRetryInSession: isRetry,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Không lưu được kết quả ôn tập");

        speakWord(card.word);
        setFeedback({
          isCorrect,
          typed: forceWrong ? "(Không nhớ)" : trimmed,
          nextLevel: computed.level,
          nextLabel: computed.label,
          wasRetry: isRetry,
        });

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
      } catch (e) {
        setErrMsg((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [card, saving, feedback, typed, speakWord, dueCount]
  );

  const goNext = useCallback(() => {
    if (!card || !feedback) return;
    setQueue((prev) => {
      const rest = prev.slice(1);
      if (!feedback.isCorrect) {
        const retryItem: SessionItem = {
          ...card,
          level_srs: 1,
          level5_streak: 0,
          isRetryInSession: true,
        };
        return [...rest, retryItem];
      }
      return rest;
    });
    setTyped("");
    setShowHint(false);
    setFeedback(null);
  }, [card, feedback]);

  useEffect(() => {
    if (!feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feedback, goNext]);

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
      <div className="flex items-center gap-2 py-12 text-muted">
        <Loader2 className="animate-spin" size={18} /> Đang tải phiên ôn tập Leitner...
      </div>
    );
  }

  if (totalWords === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl bg-card p-8 text-center sm:p-10">
        <Repeat size={44} strokeWidth={1.3} className="mx-auto text-brand-hover" />
        <h1 className="mt-4 text-2xl font-bold">Chưa có từ nào trong kho</h1>
        <p className="mt-2 text-muted">Hãy nạp từ vựng vào kho và tạo học phần trước khi ôn tập ngắt quãng.</p>
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
        className="w-full max-w-md rounded-3xl border border-line bg-card p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Cài đặt ôn tập ngắt quãng</h2>
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
      </form>
    </div>
  );

  if (!card) {
    const hasMoreToday = dailyLimitRemaining > 0 && totalOverdueCount > 0;
    const hitDailyLimit = dailyLimitRemaining === 0 && totalOverdueCount > 0;

    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-line bg-card p-8 text-center sm:p-10">
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
          <Link href="/vocab/bank" className="rounded-full bg-line px-6 py-3 text-sm font-bold hover:bg-card-hover">
            Xem Kho từ vựng
          </Link>
          {enrolledCount > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearing}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-5 py-3 text-sm font-bold text-rose-700 hover:bg-rose-500/25 dark:text-rose-300 disabled:opacity-40"
            >
              <Trash2 size={15} /> Xoá danh sách ôn ({enrolledCount})
            </button>
          )}
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
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Repeat size={24} strokeWidth={1.6} className="text-brand-hover" /> Ôn tập Leitner (Active Recall)
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
          <button
            type="button"
            onClick={() => {
              setDraftSettings(settings);
              setSettingsOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-bold hover:bg-card-hover"
          >
            <Settings2 size={14} /> Cài đặt
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={clearing}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-3.5 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-500/20 dark:text-rose-300 disabled:opacity-40"
          >
            <Trash2 size={14} /> {clearing ? "Đang xoá..." : "Xoá tất cả"}
          </button>
          <div className="ml-1 font-bold">
            {Math.min(reviewedInSession + 1, totalSession)} / {totalSession}
          </div>
        </div>
      </div>

      {/* Phân bố 5 Level */}
      <div className="mb-4 flex flex-wrap gap-1.5 text-[11px]">
        {([1, 2, 3, 4, 5] as LeitnerLevel[]).map((lv) => (
          <span key={lv} className={`rounded-full px-2.5 py-0.5 font-semibold ${LEITNER_BADGE[lv].cls}`}>
            Lv.{lv}: {levelCounts[lv] ?? 0}
          </span>
        ))}
      </div>

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
      <div className="rounded-3xl border border-line bg-card p-6 shadow-xl sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${lvMeta.cls}`}>
              {lvMeta.label}
            </span>
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

        {/* Gợi ý nghĩa để người dùng nhớ và gõ từ */}
        <div className="my-7 space-y-3 text-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">
            {card.pos ? `Từ loại: ${card.pos}` : "Hãy gõ từ tiếng Anh tương ứng"}
          </div>
          <div className="break-words text-2xl font-bold text-brand-hover sm:text-3xl">
            {card.vi || card.en}
          </div>
          {card.vi && card.en && (
            <div className="mx-auto max-w-xl break-words text-sm text-muted sm:text-base">
              {card.en}
            </div>
          )}
          {showHint && !feedback && (
            <div className="mx-auto mt-3 inline-block rounded-xl bg-bg px-4 py-2 font-mono text-sm font-bold tracking-widest text-ink">
              {getWordHint(card.word)}
            </div>
          )}
        </div>

        {/* Ô nhập từ */}
        {!feedback ? (
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
              onChange={(e) => setTyped(e.target.value)}
              disabled={saving}
              placeholder="Gõ từ tiếng Anh và nhấn Enter..."
              autoComplete="off"
              autoCapitalize="none"
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
                onClick={() => setShowHint((h) => !h)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-full bg-bg px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink"
              >
                <Lightbulb size={15} /> {showHint ? "Ẩn gợi ý" : "Gợi ý"}
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
                {feedback.isCorrect ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                {feedback.isCorrect ? "Chính xác!" : "Chưa chính xác"}
              </div>
              <div className="mt-2 text-2xl font-bold text-ink">{card.word}</div>
              {card.ipa && <div className="text-sm text-muted">{card.ipa}</div>}
              {!feedback.isCorrect && (
                <div className="mt-1 text-xs opacity-90">Bạn đã nhập: {feedback.typed}</div>
              )}
              {card.example && (
                <div className="mt-3 rounded-xl bg-bg/70 px-3 py-2 text-xs italic text-muted">
                  “{card.example}”
                </div>
              )}
              <div className="mt-3 text-xs font-semibold">
                {feedback.isCorrect
                  ? feedback.wasRetry
                    ? `Giữ Level 1 · Hẹn xác nhận lại sau ${feedback.nextLabel}`
                    : `Đạt Level ${feedback.nextLevel} · Ôn lại sau ${feedback.nextLabel}`
                  : "Tụt về Level 1 (10 phút) · Đã đưa vào cuối phiên để gõ lại"}
              </div>
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
        Quy tắc Leitner: Gõ đúng tăng cấp (1→2→3→4→5: 1d→3d→7d→14d→30d→60d→90d) · Gõ sai tụt về Level 1 và ôn lại cuối phiên.
      </p>
    </div>
  );
}
