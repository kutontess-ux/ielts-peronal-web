"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, BookMarked, CheckCircle2, ChevronRight, Layers, Loader2, Newspaper, Package } from "lucide-react";
import { type Word } from "@/lib/mock";
import Flashcards from "./Flashcards";

type StudySet = {
  id: string;
  title: string;
  desc: string;
  words: Word[];
  icon: typeof Layers;
};

export default function VocabLearn() {
  const [words, setWords] = useState<Word[]>([]);
  const [stats, setStats] = useState({ dueCount: 0, totalWords: 0, masteredCount: 0 });
  const [loading, setLoading] = useState(true);
  const [activeSet, setActiveSet] = useState<{ title: string; words: Word[] } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/words", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/reviews", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([wJson, rJson]) => {
        setWords(wJson.words ?? []);
        setStats({
          dueCount: rJson.dueCount ?? 0,
          totalWords: rJson.totalWords ?? 0,
          masteredCount: rJson.masteredCount ?? 0,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  if (activeSet) {
    return (
      <Flashcards
        title={activeSet.title}
        words={activeSet.words}
        onBack={() => setActiveSet(null)}
      />
    );
  }

  const dailyWords = words.filter((w) => w.source === "daily-news" || w.source === "daily-ielts");
  const bookWords = words.filter((w) => w.source === "book-3000");
  const topics = Array.from(new Set(words.map((w) => w.topic))).sort();

  const sets: StudySet[] = [
    { id: "all", title: "Toàn bộ kho từ vựng", desc: "Tất cả từ đã lưu", words, icon: Package },
    ...(dailyWords.length > 0
      ? [{ id: "daily", title: "Từ vựng hằng ngày", desc: "Từ báo mới & IELTS", words: dailyWords, icon: Newspaper }]
      : []),
    ...(bookWords.length > 0
      ? [{ id: "book", title: "3000 từ vựng IELTS", desc: "Sách từ vựng cốt lõi", words: bookWords, icon: BookMarked }]
      : []),
    ...topics.map((t) => ({
      id: `topic-${t}`,
      title: `Chủ đề: ${t}`,
      desc: "Luyện theo chủ đề IELTS",
      words: words.filter((w) => w.topic === t),
      icon: Layers,
    })),
  ];

  return (
    <div className="space-y-8">
      {stats.dueCount > 0 ? (
        <Link href="/vocab/review" className="flex items-center justify-between gap-4 rounded-3xl border border-brand/60 bg-card p-6 transition hover:bg-card-hover">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-hover">
              <Bell size={16} strokeWidth={1.75} /> Nhắc ôn tập ngắt quãng
            </div>
            <div className="mt-1 text-xl font-bold">Bạn có {stats.dueCount} từ sắp quên cần ôn hôm nay</div>
            <div className="text-sm text-muted">Ôn đúng lúc để nhớ lâu hơn</div>
          </div>
          <span className="shrink-0 rounded-full bg-brand px-6 py-2.5 text-sm font-bold">Ôn ngay</span>
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-3xl bg-card p-5 text-emerald-300">
          <CheckCircle2 size={22} strokeWidth={1.75} />
          <div>
            <div className="font-bold">Đã hoàn thành ôn tập hôm nay</div>
            <div className="text-sm text-muted">Không có từ nào đến hạn ôn.</div>
          </div>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Cần ôn hôm nay", `${stats.dueCount} từ`, "text-brand-hover"],
          ["Đã thuộc (≥ 7 ngày)", `${stats.masteredCount} / ${stats.totalWords}`, "text-emerald-300"],
          ["Tổng từ trong kho", `${stats.totalWords} từ`, "text-orange-300"],
        ].map(([l, v, c]) => (
          <div key={l} className="rounded-2xl bg-card p-5">
            <div className="text-sm text-muted">{l}</div>
            <div className={`mt-1 text-2xl font-bold ${c}`}>{v}</div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Chọn bộ thẻ ghi nhớ</h2>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-muted">
            <Loader2 className="animate-spin" size={18} /> Đang tải các bộ thẻ...
          </div>
        ) : words.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center">
            <p className="text-muted">Kho từ vựng chưa có từ nào.</p>
            <Link href="/vocab/bank" className="mt-4 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-bold">
              Đi nạp từ vựng
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sets.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSet({ title: s.title, words: s.words })}
                  className="flex items-center gap-4 rounded-2xl border-2 border-transparent bg-card p-5 text-left transition hover:border-brand-hover hover:bg-card-hover"
                >
                  <Icon size={28} strokeWidth={1.4} className="shrink-0 text-brand-hover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{s.title}</div>
                    <div className="text-xs text-muted">{s.words.length} thẻ · {s.desc}</div>
                  </div>
                  <ChevronRight size={18} strokeWidth={1.75} className="text-muted" />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
