"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen, Calendar, CheckCircle2, FileText, Plus, Search, Trash2, X,
} from "lucide-react";

type PassageSummary = {
  id: number;
  title: string;
  source_name: string;
  topic: string;
  word_count: number;
  score_correct: number | null;
  score_total: number | null;
  studied_at: string;
  notes_count: number;
};

const TOPICS = [
  "Environment", "Education", "Economy", "Government", "Health", "Technology",
  "Crime", "Society", "Science", "Media", "Work", "Culture", "Travel", "Other",
];

function formatDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

export default function ReadingHistoryPage() {
  const router = useRouter();
  const [passages, setPassages] = useState<PassageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  // Form thêm bài mới
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [topic, setTopic] = useState("Science");
  const [studiedAt, setStudiedAt] = useState("");
  const [scoreCorrect, setScoreCorrect] = useState("");
  const [scoreTotal, setScoreTotal] = useState("13");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch("/api/reading", { cache: "no-store" });
        const j = await r.json();
        if (!active) return;
        if (!r.ok) throw new Error(j.error || "Không tải được danh sách");
        setPassages(j.passages ?? []);
        setNeedsMigration(!!j.needsMigration);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setError("");
    try {
      const sc = scoreCorrect.trim() === "" ? null : Number(scoreCorrect);
      const st = scoreTotal.trim() === "" ? null : Number(scoreTotal);
      const r = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          source_name: sourceName,
          topic,
          studied_at: studiedAt,
          score_correct: Number.isFinite(sc) ? sc : null,
          score_total: Number.isFinite(st) ? st : null,
          content,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Không lưu được bài đọc");
      router.push(`/reading/${j.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  async function handleDelete(id: number, itemTitle: string) {
    if (!confirm(`Xoá bài đọc "${itemTitle}" và toàn bộ ghi chú của bài này?`)) return;
    const r = await fetch(`/api/reading?id=${id}`, { method: "DELETE" });
    if (r.ok) setPassages((prev) => prev.filter((p) => p.id !== id));
  }

  const filtered = passages.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      p.source_name.toLowerCase().includes(q) ||
      p.topic.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reading – Phân tích sau khi làm đề</h1>
          <p className="mt-1 text-sm text-muted">
            Lưu lại bài đã làm, điểm số theo ngày, tra từ theo ngữ cảnh và giải mã câu khó.
          </p>
        </div>
        <button
          onClick={() => {
            setStudiedAt(new Date().toISOString().slice(0, 10));
            setShowAdd(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover hover:text-bg"
        >
          <Plus size={18} /> Thêm bài đọc mới
        </button>
      </div>

      {needsMigration && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-semibold">Cần cập nhật bảng Reading trong Supabase (chỉ làm 1 lần):</p>
          <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
            Mở file <code>app/supabase/schema.sql</code>, copy phần tạo bảng <code>reading_passages</code> và{" "}
            <code>reading_notes</code> ở cuối file rồi chạy trong <b>Supabase → SQL Editor</b>, sau đó tải lại trang.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Thanh tìm kiếm */}
      <div className="relative">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên bài, nguồn đề (vd: Cam 18) hoặc chủ đề..."
          className="w-full rounded-xl border border-line bg-card py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand"
        />
      </div>

      {/* Danh sách lịch sử bài đọc */}
      {loading ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center text-sm text-muted">
          Đang tải lịch sử bài đọc...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card/40 p-10 text-center">
          <BookOpen size={32} className="mx-auto mb-3 text-muted" />
          <p className="font-semibold">Chưa có bài đọc nào</p>
          <p className="mt-1 text-sm text-muted">
            Sau khi làm đề trên web thi thử, bấm <b>“Thêm bài đọc mới”</b> để dán bài vào phân tích.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((p) => {
            const hasScore = p.score_correct !== null && p.score_total !== null && p.score_total > 0;
            const pct = hasScore ? Math.round(((p.score_correct ?? 0) / (p.score_total ?? 1)) * 100) : null;
            return (
              <div
                key={p.id}
                className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4 transition hover:border-brand/60 hover:bg-card-hover sm:gap-4"
              >
                <Link href={`/reading/${p.id}`} className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-words text-base font-bold text-ink">{p.title}</span>
                    {p.source_name && (
                      <span className="rounded-lg bg-bg px-2 py-0.5 text-xs font-medium text-muted">
                        {p.source_name}
                      </span>
                    )}
                    <span className="rounded-lg bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand-hover">
                      {p.topic}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted sm:gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar size={13} /> {formatDate(p.studied_at)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <FileText size={13} /> {p.word_count} từ
                    </span>
                    {p.notes_count > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 size={13} /> {p.notes_count} ghi chú đã lưu
                      </span>
                    )}
                  </div>
                </Link>

                <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
                  {hasScore ? (
                    <div className="rounded-xl bg-bg px-3 py-1.5 text-right">
                      <div className="text-sm font-bold text-ink">
                        {p.score_correct}/{p.score_total}
                      </div>
                      <div className="text-[11px] text-muted">{pct}% đúng</div>
                    </div>
                  ) : (
                    <span className="rounded-xl bg-bg px-3 py-1.5 text-xs text-muted">Chưa nhập điểm</span>
                  )}

                  <button
                    onClick={() => handleDelete(p.id, p.title)}
                    title="Xoá bài đọc"
                    className="rounded-lg p-2 text-muted opacity-60 transition hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-300 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal thêm bài đọc mới */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleCreate}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-card p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Lưu bài đọc mới</h2>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-bg hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-muted">Tên bài đọc *</label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="VD: Urban Farming / The History of Glass"
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Nguồn đề</label>
                <input
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="VD: Cam 18 Test 1 - Passage 1"
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Chủ đề</label>
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                >
                  {TOPICS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Ngày làm bài</label>
                <input
                  type="date"
                  value={studiedAt}
                  onChange={(e) => setStudiedAt(e.target.value)}
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Điểm số (Số câu đúng / Tổng)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={40}
                    value={scoreCorrect}
                    onChange={(e) => setScoreCorrect(e.target.value)}
                    placeholder="VD: 10"
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                  <span className="text-muted">/</span>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={scoreTotal}
                    onChange={(e) => setScoreTotal(e.target.value)}
                    placeholder="13"
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-muted">Nội dung bài đọc *</label>
                <textarea
                  required
                  rows={9}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Dán toàn bộ đoạn văn bài đọc vào đây..."
                  className="w-full rounded-xl border border-line px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-brand"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-muted hover:text-ink"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover hover:text-bg disabled:opacity-50"
              >
                {saving ? "Đang lưu..." : "Lưu & Mở bài đọc"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
