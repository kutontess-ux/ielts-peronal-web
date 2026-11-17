"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell, Check, CheckCircle2, ChevronRight, Layers, Loader2, Pencil, Plus, Search, Sparkles, Trash2, X,
} from "lucide-react";
import { levelColor, type Word } from "@/lib/mock";
import { notifyDueUpdated } from "@/lib/due-events";
import { setActivityLabel } from "@/lib/activity";
import {
  createStudySet, deleteStudySet, updateStudySet, useStudySets, type StudySet,
} from "@/lib/study-sets";
import Flashcards from "./Flashcards";

const LEVELS = ["A2", "B1", "B2", "C1", "C2"] as const;

type PreviewItem = {
  input: string;
  status: "new" | "duplicate" | "invalid";
  lemma: string;
  norm_key?: string;
  ipa?: string;
  pos?: string;
  meaning_vi?: string;
  definition_en?: string;
  example?: string;
  cefr_level?: string;
  topic?: string;
  is_awl?: boolean;
  collocations?: string[];
  synonyms?: string[];
};

function StudySetModal({
  editing,
  words,
  onReloadWords,
  onClose,
}: {
  editing: StudySet | null;
  words: Word[];
  onReloadWords: () => Promise<Word[]>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [desc, setDesc] = useState(editing?.desc ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(editing?.wordIds ?? [])
  );
  const [mode, setMode] = useState<"pick" | "quick-add">("pick");

  // Tìm kiếm & lọc từ trong Kho từ vựng
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("Tất cả");

  // Nhập nhanh từ mới vào học phần
  const [quickText, setQuickText] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickErr, setQuickErr] = useState("");
  const [quickMsg, setQuickMsg] = useState("");

  const filteredWords = useMemo(() => {
    const q = query.trim().toLowerCase();
    return words.filter((w) => {
      if (levelFilter !== "Tất cả" && w.level !== levelFilter) return false;
      if (!q) return true;
      return `${w.word} ${w.vi} ${w.en} ${w.topic}`.toLowerCase().includes(q);
    });
  }, [words, query, levelFilter]);

  const toggleWord = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const w of filteredWords) next.add(w.id);
      return next;
    });
  };

  const clearSelected = () => setSelectedIds(new Set());

  const handleQuickAdd = async () => {
    if (!quickText.trim() || quickBusy) return;
    setQuickBusy(true);
    setQuickErr("");
    setQuickMsg("");
    try {
      setActivityLabel("/api/import/preview", "Đang kiểm tra & bổ sung nghĩa từ mới...");
      const pRes = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: quickText }),
      });
      const pJson = await pRes.json();
      if (!pRes.ok) throw new Error(pJson.error || "Không kiểm tra được từ");

      const items = (pJson.items ?? []) as PreviewItem[];
      const newItems = items.filter((i) => i.status === "new");
      const validLemmas = items
        .filter((i) => i.status === "new" || i.status === "duplicate")
        .map((i) => i.lemma.toLowerCase().trim());

      if (validLemmas.length === 0) {
        throw new Error("Không tìm thấy từ tiếng Anh hợp lệ trong danh sách.");
      }

      if (newItems.length > 0) {
        setActivityLabel("/api/import/commit", `Đang lưu ${newItems.length} từ mới vào kho...`);
        const cRes = await fetch("/api/import/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: newItems,
            stats: pJson.summary,
            source: "study-set",
          }),
        });
        const cJson = await cRes.json();
        if (!cRes.ok) throw new Error(cJson.error || "Không lưu được từ mới");
        notifyDueUpdated();
      }

      const freshWords = await onReloadWords();
      const lemmaSet = new Set(validLemmas);
      const matchedIds = freshWords
        .filter((w) => lemmaSet.has(w.word.toLowerCase().trim()))
        .map((w) => w.id);

      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of matchedIds) next.add(id);
        return next;
      });

      setQuickText("");
      setQuickMsg(`Đã thêm ${matchedIds.length} từ vào học phần (lưu đồng thời trong Kho từ vựng).`);
      setMode("pick");
    } catch (e) {
      setQuickErr((e as Error).message);
    } finally {
      setQuickBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (editing) {
      updateStudySet(editing.id, { title, desc, wordIds: ids });
    } else {
      createStudySet({ title, desc, wordIds: ids });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold">
            {editing ? "Chỉnh sửa học phần" : "Tạo học phần mới"}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Tên học phần *</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Vd: Environment Band 7+, Reading Unit 3..."
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-brand-hover"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Mô tả (tuỳ chọn)</label>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Ghi chú ngắn về học phần..."
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-brand-hover"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("pick")}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                  mode === "pick" ? "bg-ink text-bg" : "bg-bg text-muted hover:text-ink"
                }`}
              >
                Chọn từ Kho ({words.length})
              </button>
              <button
                type="button"
                onClick={() => setMode("quick-add")}
                className={`inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-xs font-bold transition ${
                  mode === "quick-add" ? "bg-ink text-bg" : "bg-bg text-muted hover:text-ink"
                }`}
              >
                <Sparkles size={13} /> Nhập từ mới nhanh
              </button>
            </div>
            <div className="text-xs font-bold text-brand-hover">
              Đã chọn: {selectedIds.size} từ
            </div>
          </div>

          {quickMsg && (
            <div className="rounded-xl bg-emerald-500/15 px-3.5 py-2.5 text-xs font-medium text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
              {quickMsg}
            </div>
          )}

          {mode === "quick-add" ? (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Nhập danh sách từ tiếng Anh (mỗi dòng 1 từ hoặc cách nhau bằng dấu phẩy). Hệ thống sẽ tự tra nghĩa, lưu vào Kho từ vựng và thêm sẵn vào học phần này.
              </p>
              <textarea
                rows={5}
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                placeholder={"mitigate\nsustainable\nexacerbate\nunprecedented"}
                className="w-full rounded-2xl border border-line p-3.5 text-sm outline-none focus:border-brand-hover"
              />
              {quickErr && (
                <div className="rounded-xl bg-rose-500/15 px-3.5 py-2 text-xs text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
                  {quickErr}
                </div>
              )}
              <button
                type="button"
                onClick={handleQuickAdd}
                disabled={!quickText.trim() || quickBusy}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-40"
              >
                {quickBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {quickBusy ? "Đang tra & lưu từ..." : "Tra nghĩa & thêm vào học phần"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Tìm từ hoặc nghĩa trong kho..."
                    className="w-full rounded-xl border border-line py-2 pl-9 pr-3 text-xs outline-none focus:border-brand-hover"
                  />
                </div>
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                  className="rounded-xl border border-line px-3 py-2 text-xs"
                >
                  <option value="Tất cả">Mọi cấp độ</option>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                {filteredWords.length > 0 && (
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="rounded-xl bg-bg px-3 py-2 text-xs font-semibold text-muted hover:text-ink"
                  >
                    Chọn {filteredWords.length} từ
                  </button>
                )}
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={clearSelected}
                    className="rounded-xl bg-bg px-3 py-2 text-xs font-semibold text-muted hover:text-rose-600 dark:hover:text-rose-300"
                  >
                    Bỏ chọn
                  </button>
                )}
              </div>

              {words.length === 0 ? (
                <div className="rounded-2xl bg-bg p-6 text-center text-xs text-muted">
                  Kho từ vựng chưa có từ nào. Chuyển sang tab <b>“Nhập từ mới nhanh”</b> ở trên để tạo từ ngay!
                </div>
              ) : filteredWords.length === 0 ? (
                <div className="rounded-2xl bg-bg p-6 text-center text-xs text-muted">
                  Không có từ nào khớp bộ lọc hiện tại.
                </div>
              ) : (
                <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-2xl border border-line bg-bg p-2">
                  {filteredWords.map((w) => {
                    const checked = selectedIds.has(w.id);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => toggleWord(w.id)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                          checked ? "bg-brand/15 text-ink" : "hover:bg-card"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked
                              ? "border-brand bg-brand text-white"
                              : "border-muted/50"
                          }`}
                        >
                          {checked && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className="font-bold">{w.word}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted">{w.vi}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${levelColor[w.level]}`}>
                          {w.level}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-bg px-5 py-2 text-sm font-semibold text-muted hover:text-ink"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={!title.trim() || selectedIds.size === 0}
            className="rounded-full bg-brand px-6 py-2 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-40"
          >
            {editing ? `Lưu (${selectedIds.size} từ)` : `Tạo học phần (${selectedIds.size} từ)`}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function VocabLearn() {
  const [words, setWords] = useState<Word[]>([]);
  const [stats, setStats] = useState({ dueCount: 0, totalWords: 0, masteredCount: 0 });
  const [loading, setLoading] = useState(true);
  const [activeSet, setActiveSet] = useState<{ title: string; words: Word[] } | null>(null);
  const [modalState, setModalState] = useState<{ open: boolean; editing: StudySet | null }>({
    open: false,
    editing: null,
  });

  const studySets = useStudySets();

  const reloadWords = useCallback(async (): Promise<Word[]> => {
    const [wJson, rJson] = await Promise.all([
      fetch("/api/words", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/reviews", { cache: "no-store" }).then((r) => r.json()),
    ]);
    const list = (wJson.words ?? []) as Word[];
    setWords(list);
    setStats({
      dueCount: rJson.dueCount ?? 0,
      totalWords: rJson.totalWords ?? list.length,
      masteredCount: rJson.masteredCount ?? 0,
    });
    return list;
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/words", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/reviews", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([wJson, rJson]) => {
        const list = (wJson.words ?? []) as Word[];
        setWords(list);
        setStats({
          dueCount: rJson.dueCount ?? 0,
          totalWords: rJson.totalWords ?? list.length,
          masteredCount: rJson.masteredCount ?? 0,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const wordMap = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);

  if (activeSet) {
    return (
      <Flashcards
        title={activeSet.title}
        words={activeSet.words}
        onBack={() => setActiveSet(null)}
      />
    );
  }

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
          <span className="shrink-0 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white">Ôn ngay</span>
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-3xl bg-card p-5 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 size={22} strokeWidth={1.75} />
          <div>
            <div className="font-bold">Đã hoàn thành ôn tập hôm nay</div>
            <div className="text-sm text-muted">Không có từ nào đến hạn ôn.</div>
          </div>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Học phần đã tạo", `${studySets.length} học phần`, "text-brand-hover"],
          ["Đã thuộc (≥ 7 ngày)", `${stats.masteredCount} / ${stats.totalWords}`, "text-emerald-600 dark:text-emerald-300"],
          ["Tổng từ trong kho", `${stats.totalWords} từ`, "text-orange-600 dark:text-orange-300"],
        ].map(([l, v, c]) => (
          <div key={l} className="rounded-2xl bg-card p-5">
            <div className="text-sm text-muted">{l}</div>
            <div className={`mt-1 text-2xl font-bold ${c}`}>{v}</div>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Học phần của bạn</h2>
            <p className="text-xs text-muted">
              Chỉ hiển thị các học phần bạn tự tạo để luyện Flashcards (Kho từ vựng lưu toàn bộ từ đã học).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalState({ open: true, editing: null })}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
          >
            <Plus size={16} strokeWidth={2.2} /> Tạo học phần
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-muted">
            <Loader2 className="animate-spin" size={18} /> Đang tải học phần...
          </div>
        ) : studySets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-10 text-center">
            <Layers size={40} strokeWidth={1.3} className="mx-auto text-brand-hover" />
            <div className="mt-3 text-lg font-bold">Chưa có học phần nào</div>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              Hãy tự tạo học phần từ những từ muốn học trong Kho từ vựng (hoặc nhập từ mới) để ôn tập kiểu Quizlet.
            </p>
            <button
              type="button"
              onClick={() => setModalState({ open: true, editing: null })}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
            >
              <Plus size={16} strokeWidth={2.2} /> Tạo học phần đầu tiên
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {studySets.map((s) => {
              const setWords = s.wordIds
                .map((id) => wordMap.get(id))
                .filter((w): w is Word => !!w);
              return (
                <div
                  key={s.id}
                  className="group flex flex-col justify-between rounded-2xl border-2 border-transparent bg-card p-5 transition hover:border-brand-hover"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg text-brand-hover">
                      <Layers size={20} strokeWidth={1.6} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{s.title}</div>
                      <div className="text-xs text-muted">
                        {setWords.length} thẻ{s.desc ? ` · ${s.desc}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Chỉnh sửa học phần"
                        onClick={() => setModalState({ open: true, editing: s })}
                        className="rounded-lg p-1.5 text-muted hover:bg-bg hover:text-ink"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        title="Xoá học phần"
                        onClick={() => {
                          if (confirm(`Xoá học phần "${s.title}"? (Các từ vẫn giữ nguyên trong Kho từ vựng)`)) {
                            deleteStudySet(s.id);
                          }
                        }}
                        className="rounded-lg p-1.5 text-muted hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={setWords.length === 0}
                    onClick={() => setActiveSet({ title: s.title, words: setWords })}
                    className="mt-4 flex w-full items-center justify-between rounded-xl bg-bg px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-brand hover:text-white disabled:opacity-40"
                  >
                    <span>{setWords.length > 0 ? "Học thẻ ngay" : "Chưa có thẻ hợp lệ"}</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {modalState.open && (
        <StudySetModal
          editing={modalState.editing}
          words={words}
          onReloadWords={reloadWords}
          onClose={() => setModalState({ open: false, editing: null })}
        />
      )}
    </div>
  );
}
