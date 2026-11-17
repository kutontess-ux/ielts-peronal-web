"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, PartyPopper, Repeat, RotateCw, Trash2, Volume2 } from "lucide-react";
import { levelColor } from "@/lib/mock";
import { notifyDueUpdated } from "@/lib/due-events";
import { clearAllReviews, computeNextReview, type ReviewGrade } from "@/lib/srs";
import type { ReviewWord } from "@/app/api/reviews/route";

const GRADE_META: {
  key: ReviewGrade;
  label: string;
  shortcut: string;
  cls: string;
}[] = [
  {
    key: "again",
    label: "Xem lại",
    shortcut: "1",
    cls: "border-rose-500/50 text-rose-700 hover:bg-rose-500/10 dark:border-rose-400/60 dark:text-rose-300 dark:hover:bg-rose-400/10",
  },
  {
    key: "hard",
    label: "Khó",
    shortcut: "2",
    cls: "border-orange-500/50 text-orange-700 hover:bg-orange-500/10 dark:border-orange-400/60 dark:text-orange-300 dark:hover:bg-orange-400/10",
  },
  {
    key: "good",
    label: "Ổn",
    shortcut: "3",
    cls: "border-sky-500/50 text-sky-700 hover:bg-sky-500/10 dark:border-sky-400/60 dark:text-sky-300 dark:hover:bg-sky-400/10",
  },
  {
    key: "easy",
    label: "Dễ",
    shortcut: "4",
    cls: "border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10 dark:border-emerald-400/60 dark:text-emerald-300 dark:hover:bg-emerald-400/10",
  },
];

export default function Review() {
  const [queue, setQueue] = useState<ReviewWord[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [reviewedInSession, setReviewedInSession] = useState(0);
  const [retryWords, setRetryWords] = useState<ReviewWord[]>([]);
  const [errMsg, setErrMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErrMsg("");
    try {
      const r = await fetch("/api/reviews", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setQueue(j.words ?? []);
        setDueCount(j.dueCount ?? 0);
        setEnrolledCount(j.enrolledCount ?? 0);
        setTotalWords(j.totalWords ?? 0);
        setFlipped(false);
        setRevealed(false);
        setRetryWords([]);
      }
    } finally {
      setLoading(false);
    }
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
      setEnrolledCount(0);
      setRetryWords([]);
      setFlipped(false);
      setRevealed(false);
      notifyDueUpdated();
    } catch (e) {
      setErrMsg((e as Error).message);
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(id);
  }, [load]);

  const card = queue[0];

  const toggleFlip = useCallback(() => {
    setFlipped((f) => {
      const next = !f;
      if (next) setRevealed(true);
      return next;
    });
  }, []);

  const speak = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!card || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(card.word);
    u.lang = "en-GB";
    speechSynthesis.speak(u);
  };

  const grade = useCallback(
    async (k: ReviewGrade) => {
      if (!card || saving) return;
      setSaving(true);
      setErrMsg("");
      try {
        const computed = computeNextReview(card, k);
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wordId: card.id, grade: k }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Không lưu được kết quả ôn tập");

        setFlipped(false);
        setRevealed(false);
        setQueue((q) => q.slice(1));
        setDueCount((c) => Math.max(0, c - 1));
        setReviewedInSession((n) => n + 1);

        if (k === "again" || k === "hard") {
          const updatedCard: ReviewWord = {
            ...card,
            reps: computed.reps,
            interval_days: computed.interval_days,
            ease: computed.ease,
          };
          setRetryWords((prev) =>
            prev.some((w) => w.id === updatedCard.id) ? prev : [...prev, updatedCard]
          );
        }
        notifyDueUpdated();
      } catch (e) {
        setErrMsg((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [card, saving]
  );

  // Phím tắt Space để lật qua lại, 1-4 để chấm mức độ sau khi đã xem mặt sau
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggleFlip();
      } else if (revealed && !saving) {
        if (e.key === "1") void grade("again");
        else if (e.key === "2") void grade("hard");
        else if (e.key === "3") void grade("good");
        else if (e.key === "4") void grade("easy");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, revealed, saving, toggleFlip, grade]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted">
        <Loader2 className="animate-spin" size={18} /> Đang tải danh sách ôn tập...
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

  if (!card) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl bg-card p-8 text-center sm:p-10">
        <PartyPopper size={52} strokeWidth={1.2} className="mx-auto text-brand-hover" />
        <h1 className="mt-4 text-2xl font-bold">
          {enrolledCount === 0 ? "Chưa có từ nào trong danh sách ôn" : "Hoàn thành phiên ôn tập!"}
        </h1>
        <p className="mt-2 text-muted">
          {reviewedInSession > 0
            ? retryWords.length > 0
              ? `Bạn đã ôn ${reviewedInSession} từ. Có ${retryWords.length} từ cần xem lại/khó được hẹn sau 5–10 phút.`
              : `Bạn đã hoàn thành ${reviewedInSession} từ. Lịch ôn tiếp theo đã được lưu và không còn thông báo nào.`
            : enrolledCount === 0
              ? "Chỉ những từ trong Học phần đã học hoặc Bộ sách / từ bạn chọn chuyển vào mới xuất hiện tại đây."
              : "Hiện tại không có từ nào đến hạn ôn. Hãy học thêm học phần hoặc quay lại sau."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {retryWords.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQueue(retryWords);
                setDueCount(retryWords.length);
                setRetryWords([]);
                setReviewedInSession(0);
                setFlipped(false);
                setRevealed(false);
              }}
              className="rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-400"
            >
              Ôn lại ngay {retryWords.length} từ Xem lại/Khó
            </button>
          )}
          <Link href="/vocab" className="rounded-full bg-brand px-6 py-3 font-bold text-white hover:bg-brand-hover hover:text-bg">
            Đi tới Thẻ ghi nhớ
          </Link>
          <Link href="/vocab/bank" className="rounded-full bg-line px-6 py-3 font-bold hover:bg-card-hover">
            Xem Kho từ vựng
          </Link>
          <button onClick={load} className="rounded-full bg-bg px-6 py-3 font-bold text-muted hover:text-ink">
            Kiểm tra lại
          </button>
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

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Repeat size={24} strokeWidth={1.6} className="text-brand-hover" /> Ôn tập ngắt quãng
          </h1>
          <p className="text-sm text-muted">
            Còn <b className="text-ink">{dueCount} từ</b> cần ôn hôm nay
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleClearAll}
            disabled={clearing}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-3.5 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-500/20 dark:text-rose-300 disabled:opacity-40"
          >
            <Trash2 size={14} /> {clearing ? "Đang xoá..." : "Xoá toàn bộ từ cần ôn"}
          </button>
          <div className="font-bold">
            {reviewedInSession + 1} / {totalSession}
          </div>
        </div>
      </div>

      {errMsg && (
        <div className="mb-4 rounded-xl bg-rose-500/15 px-4 py-2.5 text-sm text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
          {errMsg}
        </div>
      )}

      <div className="mb-6 h-2 overflow-hidden rounded-full bg-card">
        <div className="h-full bg-brand-hover transition-all" style={{ width: `${(reviewedInSession / Math.max(1, totalSession)) * 100}%` }} />
      </div>

      {/* Thẻ lật 3D 2 chiều: bấm qua lại giữa mặt từ (+ ví dụ) và mặt nghĩa */}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={flipped ? `Lật về mặt trước của ${card.word}` : `Lật xem nghĩa của ${card.word}`}
        className="cursor-pointer select-none [perspective:1500px] focus:outline-none"
        onClick={toggleFlip}
      >
        <div
          className={`grid transition-transform duration-500 [transform-style:preserve-3d] ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          {/* Mặt trước */}
          <div
            className={`col-start-1 row-start-1 flex min-h-[320px] flex-col justify-between rounded-3xl border border-line bg-card p-5 shadow-xl sm:min-h-[340px] sm:p-8 [backface-visibility:hidden] [transform:rotateY(0deg)] ${
              flipped ? "pointer-events-none" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${levelColor[card.level]}`}>
                {card.level} · {card.topic}
              </span>
              <button type="button" onClick={speak} title="Phát âm" className="text-muted hover:text-ink">
                <Volume2 size={21} strokeWidth={1.6} />
              </button>
            </div>

            <div className="my-5 text-center">
              <div className="break-words text-3xl font-bold sm:text-4xl md:text-5xl">{card.word}</div>
              <div className="mt-2 break-words text-muted">
                {card.ipa} {card.pos ? `· ${card.pos}` : ""}
              </div>
              {card.example && (
                <div className="mx-auto mt-5 max-w-xl rounded-xl bg-bg/60 px-4 py-3 text-sm italic leading-relaxed text-muted break-words">
                  “{card.example}”
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-1.5 text-sm text-muted/80">
              <RotateCw size={14} /> Bấm thẻ hoặc Space để lật xem đáp án
            </div>
          </div>

          {/* Mặt sau */}
          <div
            className={`col-start-1 row-start-1 flex min-h-[320px] flex-col justify-between rounded-3xl border border-line bg-card p-5 shadow-xl sm:min-h-[340px] sm:p-8 [backface-visibility:hidden] [transform:rotateY(180deg)] ${
              flipped ? "" : "pointer-events-none"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${levelColor[card.level]}`}>
                {card.word} · {card.level}
              </span>
              <button type="button" onClick={speak} title="Phát âm" className="text-muted hover:text-ink">
                <Volume2 size={21} strokeWidth={1.6} />
              </button>
            </div>

            <div className="my-4 space-y-3 text-center">
              <div className="break-words text-2xl font-bold text-brand-hover md:text-3xl">{card.vi}</div>
              <div className="break-words text-muted">{card.en}</div>
              {card.example && (
                <div className="mx-auto max-w-xl rounded-xl bg-bg/60 p-3 text-sm italic leading-relaxed text-muted break-words">
                  “{card.example}”
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-1.5 text-sm text-muted/80">
              <RotateCw size={14} /> Bấm lại để lật về mặt trước
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {GRADE_META.map((g) => {
          const preview = computeNextReview(card, g.key);
          return (
            <button
              key={g.key}
              type="button"
              disabled={!revealed || saving}
              onClick={() => grade(g.key)}
              className={`rounded-2xl border-2 px-4 py-3 font-bold transition disabled:cursor-not-allowed disabled:opacity-30 ${g.cls}`}
            >
              <div>{g.label}</div>
              <div className="text-xs font-medium opacity-80">{preview.label}</div>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-center text-xs text-muted">
        Phím tắt: Space lật qua lại · 1 Xem lại · 2 Khó · 3 Ổn · 4 Dễ (từ học nhiều tự tăng lên 4 ngày, 7 ngày).
      </p>
    </div>
  );
}
