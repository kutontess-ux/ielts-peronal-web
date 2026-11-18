"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  LayoutGrid,
  RotateCcw,
  Timer,
  Trophy,
} from "lucide-react";
import { type Word } from "@/lib/mock";

type MatchCard = {
  uid: string;
  wordId: number;
  side: "term" | "def";
  text: string;
  sub?: string;
};

const MATCH_BEST_KEY = "ielts_studyset_match_best_v1";
const MAX_PAIRS_PER_ROUND = 6;

function shuffleCards<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildRoundCards(words: Word[]): {
  cards: MatchCard[];
  pairCount: number;
} {
  const picked = shuffleCards(words).slice(0, MAX_PAIRS_PER_ROUND);
  const raw: MatchCard[] = [];
  for (const w of picked) {
    raw.push({
      uid: `term-${w.id}`,
      wordId: w.id,
      side: "term",
      text: w.word,
      sub: w.pos || undefined,
    });
    raw.push({
      uid: `def-${w.id}`,
      wordId: w.id,
      side: "def",
      text: w.vi || w.en,
    });
  }
  return {
    cards: shuffleCards(raw),
    pairCount: picked.length,
  };
}

function loadBestTimeMs(setId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MATCH_BEST_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, number>;
    const val = map[setId];
    return typeof val === "number" && Number.isFinite(val) && val > 0
      ? val
      : null;
  } catch {
    return null;
  }
}

function saveBestTimeMs(setId: string, ms: number) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(MATCH_BEST_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[setId] = ms;
    localStorage.setItem(MATCH_BEST_KEY, JSON.stringify(map));
  } catch {
    // bỏ qua
  }
}

function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

export default function StudySetMatch({
  setId,
  title,
  words,
  onBack,
}: {
  setId: string;
  title: string;
  words: Word[];
  onBack: () => void;
}) {
  const [round, setRound] = useState(() => buildRoundCards(words));
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<number>>(() => new Set());
  const [justMatchedIds, setJustMatchedIds] = useState<Set<number>>(
    () => new Set()
  );
  const [mismatchUids, setMismatchUids] = useState<[string, string] | null>(
    null
  );

  const [elapsedMs, setElapsedMs] = useState(0);
  const [finishedMs, setFinishedMs] = useState<number | null>(null);
  const [bestMs, setBestMs] = useState<number | null>(() =>
    loadBestTimeMs(setId)
  );
  const [isNewRecord, setIsNewRecord] = useState(false);

  const startMsRef = useRef<number>(0);
  const mismatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startNewRound = useCallback(() => {
    if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    setRound(buildRoundCards(words));
    setSelectedUid(null);
    setMatchedIds(new Set());
    setJustMatchedIds(new Set());
    setMismatchUids(null);
    setElapsedMs(0);
    setFinishedMs(null);
    setIsNewRecord(false);
    startMsRef.current = Date.now();
  }, [words]);

  useEffect(() => {
    if (finishedMs !== null || round.pairCount === 0) return;
    startMsRef.current = Date.now();
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startMsRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [finishedMs, round.pairCount]);

  useEffect(() => {
    return () => {
      if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, []);

  const handleCardClick = useCallback(
    (card: MatchCard) => {
      if (finishedMs !== null) return;
      if (matchedIds.has(card.wordId) || justMatchedIds.has(card.wordId)) return;

      if (mismatchUids) {
        if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current);
        setMismatchUids(null);
      }

      if (selectedUid === card.uid) {
        setSelectedUid(null);
        return;
      }

      if (!selectedUid) {
        setSelectedUid(card.uid);
        return;
      }

      const first = round.cards.find((c) => c.uid === selectedUid);
      if (!first) {
        setSelectedUid(card.uid);
        return;
      }

      // Nếu bấm cùng vế (cùng Thuật ngữ hoặc cùng Định nghĩa) -> chuyển sang chọn thẻ mới
      if (first.side === card.side) {
        setSelectedUid(card.uid);
        return;
      }

      // Kiểm tra ghép cặp
      if (first.wordId === card.wordId) {
        setSelectedUid(null);
        const nextJustMatched = new Set(justMatchedIds);
        nextJustMatched.add(card.wordId);
        setJustMatchedIds(nextJustMatched);

        const totalMatchedAfter = matchedIds.size + nextJustMatched.size;
        const isLastPair = totalMatchedAfter >= round.pairCount;

        setTimeout(() => {
          setMatchedIds((prev) => {
            const next = new Set(prev);
            next.add(card.wordId);
            return next;
          });
          setJustMatchedIds((prev) => {
            const next = new Set(prev);
            next.delete(card.wordId);
            return next;
          });
        }, 220);

        if (isLastPair) {
          finishTimerRef.current = setTimeout(() => {
            const finalDuration = Math.max(100, Date.now() - startMsRef.current - 250);
            setElapsedMs(finalDuration);
            const prevBest = bestMs;
            const beatRecord = prevBest === null || finalDuration < prevBest;
            if (beatRecord) {
              saveBestTimeMs(setId, finalDuration);
              setBestMs(finalDuration);
            }
            setIsNewRecord(beatRecord);
            setFinishedMs(finalDuration);
          }, 250);
        }
        return;
      }

      // Ghép sai
      setSelectedUid(null);
      setMismatchUids([first.uid, card.uid]);
      mismatchTimerRef.current = setTimeout(() => {
        setMismatchUids(null);
      }, 420);
    },
    [bestMs, finishedMs, justMatchedIds, matchedIds, mismatchUids, round.cards, round.pairCount, selectedUid, setId]
  );

  if (words.length < 2) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-8 text-center">
        <LayoutGrid size={44} className="mx-auto text-muted" />
        <h1 className="mt-3 text-xl font-bold text-ink">
          Cần ít nhất 2 từ để chơi Ghép thẻ
        </h1>
        <p className="mt-1 text-sm text-muted">
          Hãy thêm từ vào học phần &ldquo;{title}&rdquo; để bắt đầu.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-hover"
        >
          <ArrowLeft size={16} /> Quay lại học phần
        </button>
      </div>
    );
  }

  if (finishedMs !== null) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-line bg-card p-7 text-center sm:p-10">
        <Trophy
          size={52}
          strokeWidth={1.3}
          className="mx-auto text-amber-500"
        />
        <h1 className="mt-4 text-2xl font-extrabold text-ink sm:text-3xl">
          Hoàn thành Ghép thẻ!
        </h1>
        <p className="mt-1 text-sm text-muted">
          {title} · {round.pairCount} cặp thẻ
        </p>

        {isNewRecord && (
          <div className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-4 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-300">
            <Trophy size={14} /> Kỷ lục mới của học phần!
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-bg p-4">
            <div className="text-2xl font-extrabold text-brand-hover">
              {formatSeconds(finishedMs)}
            </div>
            <div className="mt-1 text-xs text-muted">Thời gian hoàn thành</div>
          </div>
          <div className="rounded-2xl bg-bg p-4">
            <div className="text-2xl font-extrabold text-ink">
              {bestMs !== null ? formatSeconds(bestMs) : formatSeconds(finishedMs)}
            </div>
            <div className="mt-1 text-xs text-muted">Kỷ lục nhanh nhất</div>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={startNewRound}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-hover"
          >
            <RotateCcw size={16} /> Chơi ván mới
          </button>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full bg-line px-6 py-3 text-sm font-bold text-ink transition hover:bg-card-hover"
          >
            <ArrowLeft size={16} /> Quay lại học phần
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
        >
          <ArrowLeft size={16} /> {title}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {bestMs !== null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-300">
              <Trophy size={13} /> Kỷ lục: {formatSeconds(bestMs)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-3.5 py-1.5 text-xs font-extrabold text-brand-hover tabular-nums">
            <Timer size={14} /> {formatSeconds(elapsedMs)}
          </span>
          <span className="rounded-full bg-card px-3 py-1.5 text-xs font-bold text-muted">
            {matchedIds.size}/{round.pairCount} cặp
          </span>
          <button
            type="button"
            onClick={startNewRound}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-bold text-ink hover:border-brand-hover"
          >
            <RotateCcw size={13} /> Đổi ván
          </button>
        </div>
      </div>

      <p className="text-center text-xs font-medium text-muted sm:text-sm">
        Chọn thẻ <strong>Thuật ngữ</strong> và thẻ <strong>Định nghĩa</strong>{" "}
        tương ứng để ghép thành cặp.
      </p>

      {/* Lưới thẻ ghép */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {round.cards.map((card) => {
          const isMatched = matchedIds.has(card.wordId);
          const isJustMatched = justMatchedIds.has(card.wordId);
          const isSelected = selectedUid === card.uid;
          const isMismatch =
            mismatchUids !== null &&
            (mismatchUids[0] === card.uid || mismatchUids[1] === card.uid);

          if (isMatched) {
            return (
              <div
                key={card.uid}
                aria-hidden="true"
                className="min-h-28 rounded-2xl border border-transparent opacity-0 pointer-events-none sm:min-h-32"
              />
            );
          }

          return (
            <button
              key={card.uid}
              type="button"
              onClick={() => handleCardClick(card)}
              className={`flex min-h-28 flex-col items-center justify-center rounded-2xl border-2 p-3.5 text-center transition duration-150 sm:min-h-32 sm:p-4 ${
                isJustMatched
                  ? "scale-95 border-emerald-500 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                  : isMismatch
                    ? "border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300"
                    : isSelected
                      ? "border-brand bg-brand/15 text-brand-hover shadow-md"
                      : "border-line bg-card text-ink hover:border-brand-hover hover:bg-card-hover"
              }`}
            >
              <span className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">
                {card.side === "term" ? "Thuật ngữ" : "Định nghĩa"}
              </span>
              <span
                className={`break-words leading-snug ${
                  card.side === "term"
                    ? "text-base font-bold sm:text-lg"
                    : "text-sm font-medium sm:text-base"
                }`}
              >
                {card.text}
              </span>
              {card.sub && (
                <span className="mt-1 text-[11px] italic text-muted">
                  ({card.sub})
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
