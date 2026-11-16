"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, PartyPopper, Repeat, Volume2 } from "lucide-react";
import { levelColor } from "@/lib/mock";
import { notifyDueUpdated } from "@/lib/due-events";
import type { ReviewWord } from "@/app/api/reviews/route";

const GRADES = [
  { key: "again", label: "Quên", next: "< 1 phút", cls: "border-rose-400/60 text-rose-300 hover:bg-rose-400/10" },
  { key: "hard", label: "Khó", next: "1 ngày", cls: "border-orange-400/60 text-orange-300 hover:bg-orange-400/10" },
  { key: "good", label: "Tốt", next: "3+ ngày", cls: "border-sky-400/60 text-sky-300 hover:bg-sky-400/10" },
  { key: "easy", label: "Dễ", next: "7+ ngày", cls: "border-emerald-400/60 text-emerald-300 hover:bg-emerald-400/10" },
] as const;

export default function Review() {
  const [queue, setQueue] = useState<ReviewWord[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [reviewedInSession, setReviewedInSession] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/reviews", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setQueue(j.words ?? []);
        setDueCount(j.dueCount ?? 0);
        setTotalWords(j.totalWords ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const card = queue[0];

  const speak = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!card) return;
    const u = new SpeechSynthesisUtterance(card.word);
    u.lang = "en-GB";
    speechSynthesis.speak(u);
  };

  const grade = async (k: "again" | "hard" | "good" | "easy") => {
    if (!card || saving) return;
    setSaving(true);
    try {
      await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId: card.id, grade: k }),
      });

      setFlipped(false);
      if (k === "again") {
        // Quên: đẩy xuống cuối hàng chờ trong phiên để ôn lại ngay
        setQueue((q) => [...q.slice(1), q[0]]);
      } else {
        setQueue((q) => q.slice(1));
        setDueCount((c) => Math.max(0, c - 1));
        setReviewedInSession((n) => n + 1);
      }
      notifyDueUpdated();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted">
        <Loader2 className="animate-spin" size={18} /> Đang tải danh sách ôn tập...
      </div>
    );
  }

  if (totalWords === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl bg-card p-10 text-center">
        <Repeat size={44} strokeWidth={1.3} className="mx-auto text-brand-hover" />
        <h1 className="mt-4 text-2xl font-bold">Chưa có từ nào trong kho</h1>
        <p className="mt-2 text-muted">Hãy nạp từ vựng vào kho trước, sau đó quay lại đây để ôn tập ngắt quãng.</p>
        <Link href="/vocab/bank" className="mt-6 inline-block rounded-full bg-brand px-6 py-3 font-bold hover:bg-brand-hover hover:text-bg">
          Đi tới Kho từ vựng
        </Link>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl bg-card p-10 text-center">
        <PartyPopper size={52} strokeWidth={1.2} className="mx-auto text-brand-hover" />
        <h1 className="mt-4 text-2xl font-bold">Hoàn thành phiên ôn tập!</h1>
        <p className="mt-2 text-muted">
          {reviewedInSession > 0
            ? `Bạn đã hoàn thành ${reviewedInSession} từ. Lịch ôn tiếp theo đã được lưu và không còn thông báo nào.`
            : "Hiện tại không có từ nào đến hạn ôn. Hãy quay lại sau hoặc nạp thêm từ mới."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/vocab/bank" className="rounded-full bg-brand px-6 py-3 font-bold hover:bg-brand-hover hover:text-bg">
            Xem Kho từ vựng
          </Link>
          <button onClick={load} className="rounded-full bg-line px-6 py-3 font-bold hover:bg-card-hover">
            Kiểm tra lại
          </button>
        </div>
      </div>
    );
  }

  const totalSession = reviewedInSession + queue.length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Repeat size={24} strokeWidth={1.6} className="text-brand-hover" /> Ôn tập ngắt quãng
          </h1>
          <p className="text-sm text-muted">
            Còn <b className="text-white">{dueCount} từ</b> cần ôn hôm nay
          </p>
        </div>
        <div className="font-bold">
          {reviewedInSession + 1} / {totalSession}
        </div>
      </div>
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-card">
        <div className="h-full bg-brand-hover transition-all" style={{ width: `${(reviewedInSession / Math.max(1, totalSession)) * 100}%` }} />
      </div>

      <div className="cursor-pointer rounded-3xl bg-card p-8" style={{ minHeight: 340 }} onClick={() => setFlipped(true)}>
        <div className="flex justify-between">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${levelColor[card.level]}`}>
            {card.level} · {card.topic}
          </span>
          <button onClick={speak} title="Phát âm" className="text-muted hover:text-white">
            <Volume2 size={21} strokeWidth={1.6} />
          </button>
        </div>
        <div className="mt-8 text-center">
          <div className="text-5xl font-bold">{card.word}</div>
          <div className="mt-2 text-muted">
            {card.ipa} · {card.pos}
          </div>
        </div>
        {flipped ? (
          <div className="mt-8 space-y-3 text-center">
            <div className="text-2xl font-bold text-brand-hover">{card.vi}</div>
            <div className="text-muted">{card.en}</div>
            {card.example && <div className="rounded-xl bg-bg/60 p-3 text-sm italic text-muted">“{card.example}”</div>}
          </div>
        ) : (
          <div className="mt-16 text-center text-sm text-muted">Nhớ nghĩa của từ rồi bấm để xem đáp án</div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {GRADES.map((g) => (
          <button
            key={g.key}
            disabled={!flipped || saving}
            onClick={() => grade(g.key)}
            className={`rounded-2xl border-2 px-4 py-3 font-bold transition disabled:cursor-not-allowed disabled:opacity-30 ${g.cls}`}
          >
            {g.label}
            <div className="text-xs font-medium opacity-80">{g.next}</div>
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-muted">
        Khi bạn chọn Khó / Tốt / Dễ, từ sẽ được hẹn lịch ôn sang ngày khác và số thông báo tự động giảm xuống.
      </p>
    </div>
  );
}
