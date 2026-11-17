"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, ArrowLeftRight, Check, Home, PartyPopper,
  Pause, Play, RotateCcw, Shuffle, Star, Undo2, Volume2, X,
} from "lucide-react";
import { levelColor, type Word } from "@/lib/mock";

type HistoryEntry = {
  word: Word;
  known: boolean;
};

export default function Flashcards({
  title,
  words,
  onBack,
}: {
  title: string;
  words: Word[];
  onBack: () => void;
}) {
  const [deck, setDeck] = useState<Word[]>(words);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [meaningFirst, setMeaningFirst] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [star, setStar] = useState<Record<number, boolean>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const done = idx >= deck.length;
  const card = deck[idx];

  const knownList = history.filter((h) => h.known).map((h) => h.word);
  const unknownList = history.filter((h) => !h.known).map((h) => h.word);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    speechSynthesis.speak(u);
  }, []);

  const mark = useCallback(
    (known: boolean) => {
      if (!card) return;
      setHistory((h) => [...h, { word: card, known }]);
      setFlipped(false);
      setIdx((x) => x + 1);
    },
    [card]
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
  };

  const restart = (subset?: Word[]) => {
    setDeck(subset ?? words);
    setIdx(0);
    setHistory([]);
    setFlipped(false);
    setAutoplay(false);
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
        mark(true);
      } else if (e.code === "ArrowLeft" || e.key === "1") {
        e.preventDefault();
        mark(false);
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
        mark(true);
      }
    }, flipped ? 2600 : 2200);
    return () => clearTimeout(t);
  }, [autoplay, done, card, flipped, meaningFirst, mark, speak]);

  // Màn hình chúc mừng khi học xong
  if (done) {
    const pct = deck.length ? Math.round((knownList.length / deck.length) * 100) : 100;
    const starredWords = deck.filter((w) => star[w.id]);

    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-card p-8 text-center md:p-10">
        <PartyPopper size={56} strokeWidth={1.2} className="mx-auto text-brand-hover" />
        <h1 className="mt-4 text-3xl font-bold">Chúc mừng! Bạn đã học xong bộ thẻ</h1>
        <p className="mt-2 text-muted">{title} · {deck.length} thẻ</p>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="rounded-2xl bg-bg p-4">
            <div className="text-2xl font-bold text-brand-hover">{pct}%</div>
            <div className="mt-1 text-xs text-muted">Hoàn thành</div>
          </div>
          <div className="rounded-2xl bg-emerald-500/15 p-4 dark:bg-emerald-400/10">
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{knownList.length}</div>
            <div className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">Đã biết</div>
          </div>
          <div className="rounded-2xl bg-orange-500/15 p-4 dark:bg-orange-400/10">
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">{unknownList.length}</div>
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
      <div className="text-center text-3xl font-bold text-brand-hover md:text-4xl">{card.vi}</div>
      <div className="mt-3 max-w-lg text-center text-base text-muted">{card.en}</div>
    </>
  ) : (
    <>
      <div className="text-center text-4xl font-bold md:text-5xl">{card.word}</div>
      <div className="mt-3 text-lg text-muted">
        {card.ipa} {card.pos ? `· ${card.pos}` : ""}
      </div>
    </>
  );

  const backContent = meaningFirst ? (
    <div className="text-center">
      <div className="text-4xl font-bold md:text-5xl">{card.word}</div>
      <div className="mt-2 text-lg text-muted">
        {card.ipa} {card.pos ? `· ${card.pos}` : ""}
      </div>
      {card.example && <div className="mt-6 rounded-xl bg-bg/60 p-4 text-sm italic text-muted">“{card.example}”</div>}
    </div>
  ) : (
    <div>
      <div className="text-3xl font-bold text-brand-hover">{card.vi}</div>
      <div className="mt-3 text-lg">{card.en}</div>
      {card.example && <div className="mt-6 rounded-xl bg-bg/60 p-4 italic text-muted">“{card.example}”</div>}
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
        <div className="flex items-center gap-3 text-xs font-bold">
          <span className="rounded-full bg-orange-500/15 px-3 py-1 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300">Chưa biết: {unknownList.length}</span>
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">Đã biết: {knownList.length}</span>
        </div>
      </div>

      {/* Thanh tiến độ */}
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-card">
        <div className="h-full bg-brand-hover transition-all" style={{ width: `${(idx / Math.max(1, deck.length)) * 100}%` }} />
      </div>

      {/* Thẻ lật 3D */}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        className="cursor-pointer select-none focus:outline-none"
        style={{ perspective: 1500 }}
        onClick={() => setFlipped((f) => !f)}
      >
        <div
          className="relative h-[400px] transition-transform duration-500"
          style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateX(180deg)" : "rotateX(0deg)" }}
        >
          <div
            className={`absolute inset-0 flex flex-col rounded-3xl border border-line bg-card p-8 shadow-xl ${
              flipped ? "pointer-events-none" : ""
            }`}
            style={{ backfaceVisibility: "hidden", transform: "rotateX(0deg)" }}
          >
            <div className="flex justify-between text-muted">
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
            <div className="flex flex-1 flex-col items-center justify-center">{frontContent}</div>
            <div className="text-center text-sm text-muted/70">Bấm thẻ hoặc Space để lật</div>
          </div>

          <div
            className={`absolute inset-0 flex flex-col justify-between rounded-3xl border border-line bg-card p-10 shadow-xl ${
              flipped ? "" : "pointer-events-none"
            }`}
            style={{ backfaceVisibility: "hidden", transform: "rotateX(180deg)" }}
          >
            <div className="flex flex-1 flex-col justify-center">{backContent}</div>
            <div className="text-center text-sm text-muted/70">Bấm lại để lật về mặt trước</div>
          </div>
        </div>
      </div>

      {/* Nút điều khiển dưới thẻ kiểu Quizlet */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
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

        <div className="flex items-center gap-3">
          <button
            onClick={() => mark(false)}
            className="inline-flex items-center gap-2 rounded-full border-2 border-orange-500/50 px-6 py-2.5 font-bold text-orange-700 hover:bg-orange-500/10 dark:border-orange-400/60 dark:text-orange-300 dark:hover:bg-orange-400/10"
          >
            <X size={18} strokeWidth={2} /> Chưa biết
          </button>
          <button
            onClick={() => mark(true)}
            className="inline-flex items-center gap-2 rounded-full border-2 border-emerald-500/50 px-6 py-2.5 font-bold text-emerald-700 hover:bg-emerald-500/10 dark:border-emerald-400/60 dark:text-emerald-300 dark:hover:bg-emerald-400/10"
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
        Phím tắt: Space lật thẻ · ← Chưa biết · → Đã biết · A nghe phát âm · S gắn sao
      </p>
    </div>
  );
}
