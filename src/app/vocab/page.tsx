"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Bell, Bot, Check, CheckCircle2, ChevronRight, Folder, FolderInput, FolderOpen, FolderPlus, Layers, ListChecks, Loader2, Pencil, Plus, Repeat, Search, Sparkles, Trash2, X,
} from "lucide-react";
import { levelColor, type Word } from "@/lib/mock";
import { enrollWordsInSrs } from "@/lib/srs";
import { notifyDueUpdated } from "@/lib/due-events";
import { setActivityLabel } from "@/lib/activity";
import {
  createStudyFolder,
  createStudySet,
  deleteStudyFolder,
  deleteStudySet,
  moveStudySetToFolder,
  setFolderStudySets,
  updateStudyFolder,
  updateStudySet,
  useStudyFolders,
  useStudySets,
  type StudyFolder,
  type StudySet,
} from "@/lib/study-sets";
import Flashcards from "./Flashcards";

const LEVELS = ["A2", "B1", "B2", "C1", "C2"] as const;

const AI_PRESETS = [
  "12 từ vựng IELTS C1 chủ đề Môi trường cho Writing Task 2",
  "10 collocations hay về Công nghệ & AI trình độ B2–C1",
  "12 từ vựng miêu tả xu hướng biểu đồ Writing Task 1",
];

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

type AiItem = {
  lemma: string;
  norm_key: string;
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
  existingId: number | null;
};

function StudySetModal({
  editing,
  folders,
  defaultFolderId,
  words,
  onReloadWords,
  onClose,
}: {
  editing: StudySet | null;
  folders: StudyFolder[];
  defaultFolderId?: string | null;
  words: Word[];
  onReloadWords: () => Promise<Word[]>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [desc, setDesc] = useState(editing?.desc ?? "");
  const [folderId, setFolderId] = useState<string>(
    editing?.folderId ?? defaultFolderId ?? ""
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(editing?.wordIds ?? [])
  );
  const [mode, setMode] = useState<"current" | "pick" | "quick-add" | "ai-create">(
    editing ? "current" : "pick"
  );

  // Tìm kiếm & lọc từ trong Kho từ vựng
  const [query, setQuery] = useState("");
  const [currentQuery, setCurrentQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("Tất cả");

  // Nhập nhanh từ mới vào học phần
  const [quickText, setQuickText] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickErr, setQuickErr] = useState("");
  const [quickMsg, setQuickMsg] = useState("");

  // AI hiểu yêu cầu & tạo Flashcard theo mô tả tự nhiên
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState<"" | "generate" | "save">("");
  const [aiErr, setAiErr] = useState("");
  const [aiItems, setAiItems] = useState<AiItem[] | null>(null);
  const [aiOff, setAiOff] = useState<Set<string>>(new Set());

  const selectedWordsList = useMemo(
    () => words.filter((w) => selectedIds.has(w.id)),
    [words, selectedIds]
  );

  const filteredCurrentWords = useMemo(() => {
    const q = currentQuery.trim().toLowerCase();
    if (!q) return selectedWordsList;
    return selectedWordsList.filter((w) =>
      `${w.word} ${w.vi} ${w.en} ${w.topic}`.toLowerCase().includes(q)
    );
  }, [selectedWordsList, currentQuery]);

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

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || aiBusy !== "") return;
    setAiBusy("generate");
    setAiErr("");
    setQuickMsg("");
    setAiItems(null);
    try {
      setActivityLabel("/api/study-sets/ai-generate", "AI đang phân tích yêu cầu & tạo bộ Flashcard...");
      const res = await fetch("/api/study-sets/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI không tạo được flashcard");

      const list = (json.items ?? []) as AiItem[];
      if (list.length === 0) {
        throw new Error("AI chưa tìm được từ phù hợp. Hãy mô tả rõ chủ đề hoặc số lượng hơn.");
      }

      if (!title.trim() && json.suggestedTitle) setTitle(json.suggestedTitle);
      if (!desc.trim() && json.suggestedDesc) setDesc(json.suggestedDesc);

      setAiItems(list);
      setAiOff(new Set());
    } catch (e) {
      setAiErr((e as Error).message);
    } finally {
      setAiBusy("");
    }
  };

  const chosenAiItems = useMemo(
    () => (aiItems ?? []).filter((item) => !aiOff.has(item.norm_key)),
    [aiItems, aiOff]
  );

  const handleAiApply = async () => {
    if (chosenAiItems.length === 0 || aiBusy !== "") return;
    setAiBusy("save");
    setAiErr("");
    try {
      const newItems = chosenAiItems.filter((item) => !item.existingId);
      if (newItems.length > 0) {
        setActivityLabel("/api/import/commit", `Đang lưu ${newItems.length} flashcard mới vào kho...`);
        const cRes = await fetch("/api/import/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: newItems,
            source: "study-set-ai",
          }),
        });
        const cJson = await cRes.json();
        if (!cRes.ok) throw new Error(cJson.error || "Không lưu được flashcard mới");
        notifyDueUpdated();
      }

      const freshWords = await onReloadWords();
      const lemmaSet = new Set(chosenAiItems.map((i) => i.lemma.toLowerCase().trim()));
      const matchedIds = freshWords
        .filter((w) => lemmaSet.has(w.word.toLowerCase().trim()))
        .map((w) => w.id);

      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const item of chosenAiItems) {
          if (item.existingId) next.add(item.existingId);
        }
        for (const id of matchedIds) next.add(id);
        return next;
      });

      setAiItems(null);
      setAiPrompt("");
      setQuickMsg(`AI đã tạo & thêm ${chosenAiItems.length} flashcard vào học phần (đồng bộ cùng Kho từ vựng).`);
      setMode("pick");
    } catch (e) {
      setAiErr((e as Error).message);
    } finally {
      setAiBusy("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const nextFolderId = folderId || null;
    if (editing) {
      updateStudySet(editing.id, { title, desc, wordIds: ids, folderId: nextFolderId });
    } else {
      createStudySet({ title, desc, wordIds: ids, folderId: nextFolderId });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-6 sm:py-4">
          <h2 className="text-base font-bold sm:text-lg">
            {editing ? "Chỉnh sửa học phần" : "Tạo học phần mới"}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
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

          {folders.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Thư mục (tuỳ chọn)</label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-brand-hover"
              >
                <option value="">Không thuộc thư mục nào</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("current")}
                className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  mode === "current" ? "bg-ink text-bg" : "bg-bg text-muted hover:text-ink"
                }`}
              >
                <ListChecks size={13} /> Những từ hiện tại ({selectedWordsList.length})
              </button>
              <button
                type="button"
                onClick={() => setMode("pick")}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  mode === "pick" ? "bg-ink text-bg" : "bg-bg text-muted hover:text-ink"
                }`}
              >
                Chọn từ Kho ({words.length})
              </button>
              <button
                type="button"
                onClick={() => setMode("quick-add")}
                className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  mode === "quick-add" ? "bg-ink text-bg" : "bg-bg text-muted hover:text-ink"
                }`}
              >
                <Sparkles size={13} /> Nhập từ mới nhanh
              </button>
              <button
                type="button"
                onClick={() => setMode("ai-create")}
                className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  mode === "ai-create" ? "bg-ink text-bg" : "bg-bg text-muted hover:text-ink"
                }`}
              >
                <Bot size={13} /> AI tạo Flashcard
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

          {mode === "current" ? (
            <div className="space-y-3">
              {selectedWordsList.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-0 w-full sm:min-w-[200px] sm:flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      value={currentQuery}
                      onChange={(e) => setCurrentQuery(e.target.value)}
                      placeholder="Tìm trong các từ hiện tại..."
                      className="w-full rounded-xl border border-line py-2 pl-9 pr-3 text-xs outline-none focus:border-brand-hover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={clearSelected}
                    className="rounded-xl bg-bg px-3 py-2 text-xs font-semibold text-muted hover:text-rose-600 dark:hover:text-rose-300"
                  >
                    Bỏ chọn tất cả
                  </button>
                </div>
              )}

              {selectedWordsList.length === 0 ? (
                <div className="rounded-2xl bg-bg p-6 text-center text-xs text-muted">
                  Chưa có từ nào trong học phần này. Chuyển sang tab <b>“Chọn từ Kho”</b>, <b>“Nhập từ mới nhanh”</b> hoặc <b>“AI tạo Flashcard”</b> để thêm từ.
                </div>
              ) : filteredCurrentWords.length === 0 ? (
                <div className="rounded-2xl bg-bg p-6 text-center text-xs text-muted">
                  Không có từ nào khớp từ khoá tìm kiếm.
                </div>
              ) : (
                <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-2xl border border-line bg-bg p-2">
                  {filteredCurrentWords.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 text-sm"
                    >
                      <span className="font-bold">{w.word}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted">{w.vi}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${levelColor[w.level]}`}>
                        {w.level}
                      </span>
                      <button
                        type="button"
                        title="Xoá khỏi học phần"
                        onClick={() => toggleWord(w.id)}
                        className="rounded-lg p-1 text-muted transition hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-300"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : mode === "quick-add" ? (
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
          ) : mode === "ai-create" ? (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Mô tả chủ đề, band điểm hoặc mục tiêu học tập bằng tiếng Việt/Anh. AI sẽ tự hiểu nhu cầu, gợi ý tên học phần, tra nghĩa + IPA + ví dụ và tạo bộ Flashcard để bạn duyệt ngay.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {AI_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAiPrompt(preset)}
                    className="rounded-full border border-line bg-bg px-3 py-1 text-[11px] font-medium text-muted transition hover:border-brand hover:text-ink"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Vd: Tạo giúp tôi 15 từ vựng Band 7.0+ chủ đề Urbanization cho IELTS Writing Task 2 kèm câu ví dụ..."
                className="w-full rounded-2xl border border-line p-3.5 text-sm outline-none focus:border-brand-hover"
              />
              {aiErr && (
                <div className="rounded-xl bg-rose-500/15 px-3.5 py-2 text-xs text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
                  {aiErr}
                </div>
              )}
              <button
                type="button"
                onClick={handleAiGenerate}
                disabled={!aiPrompt.trim() || aiBusy !== ""}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-40"
              >
                {aiBusy === "generate" ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                {aiBusy === "generate" ? "AI đang phân tích & tạo thẻ..." : "AI tạo Flashcard"}
              </button>

              {aiItems && (
                <div className="space-y-3 border-t border-line pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold">
                      AI đã tạo <b className="text-brand-hover">{aiItems.length}</b> flashcard · Đã chọn{" "}
                      <b>{chosenAiItems.length}</b>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setAiOff(
                          aiOff.size > 0 ? new Set() : new Set(aiItems.map((i) => i.norm_key))
                        )
                      }
                      className="font-semibold text-muted hover:text-ink"
                    >
                      {aiOff.size > 0 ? "Chọn tất cả" : "Bỏ chọn tất cả"}
                    </button>
                  </div>

                  <div className="max-h-60 space-y-2 overflow-y-auto rounded-2xl border border-line bg-bg p-2">
                    {aiItems.map((item) => {
                      const on = !aiOff.has(item.norm_key);
                      return (
                        <label
                          key={item.norm_key}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-xl bg-card p-2.5 text-xs transition ${
                            on ? "" : "opacity-40"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => {
                              const next = new Set(aiOff);
                              if (on) next.add(item.norm_key);
                              else next.delete(item.norm_key);
                              setAiOff(next);
                            }}
                            className="mt-0.5 h-4 w-4 accent-brand"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-bold text-ink">{item.lemma}</span>
                              {item.ipa && (
                                <span className="text-muted">
                                  {item.ipa} {item.pos ? `· ${item.pos}` : ""}
                                </span>
                              )}
                              {item.cefr_level && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${levelColor[item.cefr_level] ?? ""}`}>
                                  {item.cefr_level}
                                </span>
                              )}
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  item.existingId
                                    ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                }`}
                              >
                                {item.existingId ? "Có trong kho" : "Thẻ mới"}
                              </span>
                            </div>
                            <div className="mt-0.5 font-semibold text-brand-hover">{item.meaning_vi}</div>
                            {item.example && (
                              <div className="mt-1 italic text-muted break-words">“{item.example}”</div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleAiApply}
                    disabled={chosenAiItems.length === 0 || aiBusy !== ""}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-400 disabled:opacity-40"
                  >
                    {aiBusy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {aiBusy === "save"
                      ? "Đang lưu vào học phần..."
                      : `Lưu & thêm ${chosenAiItems.length} thẻ vào học phần`}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 w-full sm:min-w-[200px] sm:flex-1">
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

        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-6 sm:py-4">
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

function FolderModal({
  editing,
  onClose,
}: {
  editing: StudyFolder | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [desc, setDesc] = useState(editing?.desc ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editing) {
      updateStudyFolder(editing.id, { name, desc });
    } else {
      createStudyFolder({ name, desc });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-bold sm:text-lg">
            {editing ? "Chỉnh sửa thư mục" : "Tạo thư mục mới"}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Tên thư mục *</label>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vd: IELTS Writing, Reading, Topic Environment..."
              className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-brand-hover"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Mô tả (tuỳ chọn)</label>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Ghi chú ngắn về thư mục..."
              className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-brand-hover"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-bg px-5 py-2 text-sm font-semibold text-muted hover:text-ink"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-full bg-brand px-6 py-2 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-40"
          >
            {editing ? "Lưu thư mục" : "Tạo thư mục"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FolderSetsModal({
  folder,
  studySets,
  folderMap,
  onClose,
}: {
  folder: StudyFolder;
  studySets: StudySet[];
  folderMap: Map<string, StudyFolder>;
  onClose: () => void;
}) {
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(
    () => new Set(studySets.filter((s) => s.folderId === folder.id).map((s) => s.id))
  );

  const toggleSet = (id: string) => {
    setSelectedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFolderStudySets(folder.id, Array.from(selectedSetIds));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4" onClick={onClose}>
      <form
        onSubmit={handleSave}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-bold sm:text-lg">Thêm học phần vào thư mục</h2>
            <p className="text-xs text-muted">Thư mục: {folder.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {studySets.length === 0 ? (
            <div className="rounded-2xl bg-bg p-6 text-center text-xs text-muted">
              Bạn chưa có học phần nào. Hãy tạo học phần trước rồi thêm vào thư mục.
            </div>
          ) : (
            <div className="space-y-2">
              {studySets.map((s) => {
                const checked = selectedSetIds.has(s.id);
                const otherFolder =
                  s.folderId && s.folderId !== folder.id ? folderMap.get(s.folderId) : null;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSet(s.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${
                      checked
                        ? "border-brand bg-brand/10 text-ink"
                        : "border-line bg-bg hover:bg-card-hover"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked ? "border-brand bg-brand text-white" : "border-muted/50"
                      }`}
                    >
                      {checked && <Check size={12} strokeWidth={3} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{s.title}</div>
                      <div className="text-xs text-muted">
                        {s.wordIds.length} thẻ
                        {otherFolder ? ` · Đang ở: ${otherFolder.name}` : ""}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-4">
          <span className="text-xs font-semibold text-brand-hover">
            Đã chọn: {selectedSetIds.size} học phần
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-bg px-4 py-2 text-sm font-semibold text-muted hover:text-ink"
            >
              Huỷ
            </button>
            <button
              type="submit"
              className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
            >
              Lưu
            </button>
          </div>
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
  const [folderModal, setFolderModal] = useState<{ open: boolean; editing: StudyFolder | null }>({
    open: false,
    editing: null,
  });
  const [folderSetsModalOpen, setFolderSetsModalOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [setFilter, setSetFilter] = useState<"all" | "unfoldered">("all");
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [srsBanner, setSrsBanner] = useState<{ text: string; isErr?: boolean } | null>(null);

  const studySets = useStudySets();
  const folders = useStudyFolders();

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
  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const activeFolder = activeFolderId ? folderMap.get(activeFolderId) ?? null : null;

  const folderSetCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of studySets) {
      if (s.folderId) {
        counts.set(s.folderId, (counts.get(s.folderId) ?? 0) + 1);
      }
    }
    return counts;
  }, [studySets]);

  const unfolderedSets = useMemo(
    () => studySets.filter((s) => !s.folderId || !folderMap.has(s.folderId)),
    [studySets, folderMap]
  );

  const visibleSets = useMemo(() => {
    if (activeFolder) {
      return studySets.filter((s) => s.folderId === activeFolder.id);
    }
    if (folders.length > 0 && setFilter === "unfoldered") {
      return unfolderedSets;
    }
    return studySets;
  }, [activeFolder, studySets, folders.length, setFilter, unfolderedSets]);

  const handleEnrollSet = async (set: StudySet, setWords: Word[]) => {
    if (setWords.length === 0 || enrollingId) return;
    setEnrollingId(set.id);
    setSrsBanner(null);
    try {
      const res = await enrollWordsInSrs(setWords.map((w) => w.id));
      notifyDueUpdated();
      await reloadWords();
      setSrsBanner({
        text:
          res.enrolled > 0
            ? `Đã chuyển ${res.enrolled} từ mới từ “${set.title}” vào Ôn tập ngắt quãng.`
            : `Các từ trong “${set.title}” đã nằm sẵn trong Ôn tập ngắt quãng.`,
      });
    } catch (e) {
      setSrsBanner({ text: (e as Error).message, isErr: true });
    } finally {
      setEnrollingId(null);
    }
  };

  if (activeSet) {
    return (
      <Flashcards
        title={activeSet.title}
        words={activeSet.words}
        onBack={() => setActiveSet(null)}
        onCompleted={() => void reloadWords()}
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
        {activeFolder ? (
          <div className="mb-5 space-y-4">
            <button
              type="button"
              onClick={() => setActiveFolderId(null)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-muted transition hover:text-ink"
            >
              <ArrowLeft size={15} /> Tất cả học phần & thư mục
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-line bg-card p-5 sm:p-6">
              <div className="flex min-w-0 items-start gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-brand-hover">
                  <FolderOpen size={24} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-lg font-bold sm:text-xl">{activeFolder.name}</h2>
                  <p className="break-words text-xs text-muted">
                    {visibleSets.length} học phần
                    {activeFolder.desc ? ` · ${activeFolder.desc}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFolderSetsModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-4 py-2 text-xs font-bold text-ink transition hover:border-brand-hover"
                >
                  <FolderInput size={14} /> Thêm học phần có sẵn
                </button>
                <button
                  type="button"
                  onClick={() => setModalState({ open: true, editing: null })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg"
                >
                  <Plus size={14} strokeWidth={2.2} /> Tạo học phần mới
                </button>
                <button
                  type="button"
                  title="Chỉnh sửa thư mục"
                  onClick={() => setFolderModal({ open: true, editing: activeFolder })}
                  className="rounded-full border border-line bg-bg p-2 text-muted hover:text-ink"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  title="Xoá thư mục"
                  onClick={() => {
                    if (
                      confirm(
                        `Xoá thư mục "${activeFolder.name}"? (Các học phần bên trong vẫn được giữ nguyên)`
                      )
                    ) {
                      deleteStudyFolder(activeFolder.id);
                      setActiveFolderId(null);
                    }
                  }}
                  className="rounded-full border border-line bg-bg p-2 text-muted hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-300"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Học phần của bạn</h2>
              <p className="text-xs text-muted">
                Sắp xếp học phần theo thư mục giống Quizlet để luyện Flashcards và chuyển vào Ôn tập ngắt quãng.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFolderModal({ open: true, editing: null })}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-sm font-bold text-ink transition hover:border-brand-hover"
              >
                <FolderPlus size={16} strokeWidth={2} /> Tạo thư mục
              </button>
              <button
                type="button"
                onClick={() => setModalState({ open: true, editing: null })}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
              >
                <Plus size={16} strokeWidth={2.2} /> Tạo học phần
              </button>
            </div>
          </div>
        )}

        {srsBanner && (
          <div
            className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm font-medium ${
              srsBanner.isErr
                ? "bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300"
                : "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
            }`}
          >
            <span className="flex items-center gap-2">
              <Repeat size={15} /> {srsBanner.text}
            </span>
            {!srsBanner.isErr && (
              <Link href="/vocab/review" className="text-xs font-bold underline">
                Mở Ôn tập ngắt quãng →
              </Link>
            )}
          </div>
        )}

        {!activeFolder && folders.length > 0 && (
          <div className="mb-6">
            <div className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted">
              Thư mục ({folders.length})
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {folders.map((f) => {
                const count = folderSetCounts.get(f.id) ?? 0;
                return (
                  <div
                    key={f.id}
                    onClick={() => setActiveFolderId(f.id)}
                    className="group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 border-transparent bg-card p-4 transition hover:border-brand-hover"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-hover">
                        <Folder size={20} strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-bold">{f.name}</div>
                        <div className="truncate text-xs text-muted">
                          {count} học phần{f.desc ? ` · ${f.desc}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title="Chỉnh sửa thư mục"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderModal({ open: true, editing: f });
                        }}
                        className="rounded-lg p-1.5 text-muted hover:bg-bg hover:text-ink"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        title="Xoá thư mục"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            confirm(
                              `Xoá thư mục "${f.name}"? (Các học phần bên trong vẫn được giữ nguyên)`
                            )
                          ) {
                            deleteStudyFolder(f.id);
                          }
                        }}
                        className="rounded-lg p-1.5 text-muted hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!activeFolder && folders.length > 0 && studySets.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-muted">
              Học phần ({visibleSets.length})
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setSetFilter("all")}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  setFilter === "all" ? "bg-ink text-bg" : "bg-card text-muted hover:text-ink"
                }`}
              >
                Tất cả ({studySets.length})
              </button>
              <button
                type="button"
                onClick={() => setSetFilter("unfoldered")}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  setFilter === "unfoldered" ? "bg-ink text-bg" : "bg-card text-muted hover:text-ink"
                }`}
              >
                Chưa vào thư mục ({unfolderedSets.length})
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-muted">
            <Loader2 className="animate-spin" size={18} /> Đang tải học phần...
          </div>
        ) : activeFolder && visibleSets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-10 text-center">
            <FolderOpen size={40} strokeWidth={1.3} className="mx-auto text-brand-hover" />
            <div className="mt-3 text-lg font-bold">Thư mục này chưa có học phần nào</div>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              Bạn có thể thêm các học phần đã có hoặc tạo học phần mới trực tiếp trong thư mục này.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {studySets.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFolderSetsModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-5 py-2.5 text-sm font-bold text-ink hover:border-brand-hover"
                >
                  <FolderInput size={16} /> Thêm học phần có sẵn
                </button>
              )}
              <button
                type="button"
                onClick={() => setModalState({ open: true, editing: null })}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
              >
                <Plus size={16} strokeWidth={2.2} /> Tạo học phần mới
              </button>
            </div>
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
        ) : visibleSets.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted">
            Tất cả học phần đều đã được sắp xếp vào thư mục.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleSets.map((s) => {
              const setWords = s.wordIds
                .map((id) => wordMap.get(id))
                .filter((w): w is Word => !!w);
              const busy = enrollingId === s.id;
              const setFolder = s.folderId ? folderMap.get(s.folderId) : null;
              return (
                <div
                  key={s.id}
                  className="group flex flex-col justify-between rounded-2xl border-2 border-transparent bg-card p-5 transition hover:border-brand-hover"
                >
                  <div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg text-brand-hover">
                        <Layers size={20} strokeWidth={1.6} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="break-words font-bold">{s.title}</div>
                        <div className="break-words text-xs text-muted">
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

                    {folders.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {!activeFolder && setFolder && (
                          <button
                            type="button"
                            onClick={() => setActiveFolderId(setFolder.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand-hover hover:bg-brand/20"
                          >
                            <Folder size={11} /> {setFolder.name}
                          </button>
                        )}
                        {activeFolder ? (
                          <button
                            type="button"
                            onClick={() => moveStudySetToFolder(s.id, null)}
                            className="inline-flex items-center gap-1 rounded-full bg-bg px-2.5 py-0.5 text-[11px] font-semibold text-muted hover:text-rose-600 dark:hover:text-rose-300"
                          >
                            <X size={11} /> Bỏ khỏi thư mục
                          </button>
                        ) : (
                          <select
                            aria-label={`Chọn thư mục cho ${s.title}`}
                            value={s.folderId ?? ""}
                            onChange={(e) => moveStudySetToFolder(s.id, e.target.value || null)}
                            className="max-w-full rounded-full border border-line bg-bg px-2.5 py-0.5 text-[11px] font-medium text-muted outline-none hover:border-brand-hover"
                          >
                            <option value="">Chưa có thư mục</option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>
                                Thư mục: {f.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    <button
                      type="button"
                      disabled={setWords.length === 0}
                      onClick={() => setActiveSet({ title: s.title, words: setWords })}
                      className="flex w-full items-center justify-between rounded-xl bg-bg px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-brand hover:text-white disabled:opacity-40"
                    >
                      <span>{setWords.length > 0 ? "Học thẻ ngay" : "Chưa có thẻ hợp lệ"}</span>
                      <ChevronRight size={16} />
                    </button>
                    {setWords.length > 0 && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleEnrollSet(s, setWords)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-bg/50 px-3 py-2 text-xs font-semibold text-muted transition hover:border-brand hover:text-brand-hover disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Repeat size={13} />}
                        {busy ? "Đang chuyển..." : "Chuyển vào ôn tập"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {modalState.open && (
        <StudySetModal
          editing={modalState.editing}
          folders={folders}
          defaultFolderId={activeFolderId}
          words={words}
          onReloadWords={reloadWords}
          onClose={() => setModalState({ open: false, editing: null })}
        />
      )}

      {folderModal.open && (
        <FolderModal
          editing={folderModal.editing}
          onClose={() => setFolderModal({ open: false, editing: null })}
        />
      )}

      {folderSetsModalOpen && activeFolder && (
        <FolderSetsModal
          folder={activeFolder}
          studySets={studySets}
          folderMap={folderMap}
          onClose={() => setFolderSetsModalOpen(false)}
        />
      )}
    </div>
  );
}
