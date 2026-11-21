"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CharacterLoader } from "@/components/CharacterLoader";
import {
  ArrowLeft, BarChart3, Bell, BookMarked, Bot, CalendarClock, Check, CheckCircle2, ChevronDown, ChevronUp, Clock, Folder, FolderInput, FolderOpen, FolderPlus, Layers, ListChecks, Loader2, MoreVertical, Pencil, PenLine, Plus, Repeat, Search, Settings2, Sparkles, Trash2, X,
} from "lucide-react";
import { levelColor, type Word } from "@/lib/mock";
import { normKey } from "@/lib/normalize";
import { enrollWordsInSrs } from "@/lib/srs";
import { fetchDueSummaryCached, notifyDueUpdated } from "@/lib/due-events";
import { setActivityLabel } from "@/lib/activity";
import { useMe } from "@/lib/use-me";
import BookSection from "@/app/vocab/bank/BookSection";
import { WordGrid as SharedWordGrid } from "@/components/vocab/WordGrid";
import {
  completeStudySetReview,
  createStudyFolder,
  createStudySet,
  deleteStudyFolder,
  deleteStudySet,
  getRecentReviewQueue,
  getStudySetReviewStatus,
  moveStudySetToFolder,
  saveStudySetReviewConfig,
  setFolderStudySets,
  updateStudyFolder,
  updateStudySet,
  useStudyFolders,
  useStudySetReviewConfig,
  useStudySets,
  type StudyFolder,
  type StudySet,
} from "@/lib/study-sets";
import Flashcards from "./Flashcards";
import StudySetDetail from "./StudySetDetail";
import StudySetLearn from "./StudySetLearn";
import StudySetMatch from "./StudySetMatch";
import StudySetTest from "./StudySetTest";

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

type ManualCardDraft = {
  id: string;
  term: string;
  definition: string;
  ipa: string;
  example: string;
  pos: string;
  level: string;
  showExtra: boolean;
};

function createEmptyManualCard(seq: number): ManualCardDraft {
  return {
    id: `manual-${seq}-${Math.random().toString(36).slice(2, 7)}`,
    term: "",
    definition: "",
    ipa: "",
    example: "",
    pos: "",
    level: "B2",
    showExtra: false,
  };
}

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
  const [mode, setMode] = useState<"current" | "manual" | "quick-add" | "ai-create">(
    editing ? "current" : "manual"
  );

  // Tạo tay thẻ thủ công
  const [manualCards, setManualCards] = useState<ManualCardDraft[]>(() => [
    createEmptyManualCard(1),
    createEmptyManualCard(2),
  ]);
  const [manualBusy, setManualBusy] = useState(false);
  const [manualErr, setManualErr] = useState("");

  // Tìm kiếm trong các từ hiện tại
  const [currentQuery, setCurrentQuery] = useState("");

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

  const updateManualCard = (id: string, patch: Partial<ManualCardDraft>) => {
    setManualCards((prev) =>
      prev.map((card) => (card.id === id ? { ...card, ...patch } : card))
    );
  };

  const addManualCard = () => {
    setManualCards((prev) => [...prev, createEmptyManualCard(prev.length + 1)]);
  };

  const removeManualCard = (id: string) => {
    setManualCards((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.id !== id)));
  };

  const validManualCards = useMemo(
    () => manualCards.filter((c) => c.term.trim() && c.definition.trim()),
    [manualCards]
  );

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

  const toggleWord = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelected = () => setSelectedIds(new Set());

  const commitManualCards = async (): Promise<number[] | null> => {
    const started = manualCards.filter((c) => c.term.trim() || c.definition.trim());
    if (started.length === 0) return [];

    const incomplete = started.find((c) => !c.term.trim() || !c.definition.trim());
    if (incomplete) {
      setManualErr("Vui lòng nhập đầy đủ cả Thuật ngữ và Định nghĩa cho các thẻ đã bắt đầu.");
      return null;
    }

    setManualBusy(true);
    setManualErr("");
    setQuickMsg("");
    try {
      const seenKey = new Set<string>();
      const payloadItems = [];
      for (const card of started) {
        const lemma = card.term.trim();
        const k = normKey(lemma);
        if (!k || seenKey.has(k)) continue;
        seenKey.add(k);
        payloadItems.push({
          lemma: lemma.toLowerCase(),
          norm_key: k,
          ipa: card.ipa.trim() || undefined,
          pos: card.pos.trim() || undefined,
          meaning_vi: card.definition.trim(),
          definition_en: card.definition.trim(),
          example: card.example.trim() || undefined,
          cefr_level: card.level || "B2",
          topic: "Other",
          is_awl: false,
        });
      }

      if (payloadItems.length === 0) {
        setManualErr("Không có thẻ hợp lệ để lưu.");
        return null;
      }

      setActivityLabel("/api/import/commit", `Đang lưu ${payloadItems.length} thẻ tạo tay vào kho...`);
      const cRes = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: payloadItems,
          source: "study-set-manual",
        }),
      });
      const cJson = await cRes.json();
      if (!cRes.ok) throw new Error(cJson.error || "Không lưu được thẻ tạo tay");
      notifyDueUpdated();

      await onReloadWords();
      const returnedIds = ((cJson.wordIds ?? []) as number[]).filter(
        (id) => Number.isFinite(id) && id > 0
      );

      if (returnedIds.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of returnedIds) next.add(id);
          return next;
        });
      }

      setManualCards([createEmptyManualCard(1), createEmptyManualCard(2)]);
      setQuickMsg(`Đã thêm ${returnedIds.length} thẻ tạo tay vào học phần (lưu đồng thời trong Kho từ vựng).`);
      return returnedIds;
    } catch (e) {
      setManualErr((e as Error).message);
      return null;
    } finally {
      setManualBusy(false);
    }
  };

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
      setMode("current");
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
      const userWordIds = new Set(words.map((w) => w.id));
      const itemsToLink = chosenAiItems.filter(
        (item) => !item.existingId || !userWordIds.has(item.existingId)
      );
      if (itemsToLink.length > 0) {
        setActivityLabel("/api/import/commit", `Đang lưu ${itemsToLink.length} flashcard vào kho cá nhân...`);
        const cRes = await fetch("/api/import/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: itemsToLink,
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
      setMode("current");
    } catch (e) {
      setAiErr((e as Error).message);
    } finally {
      setAiBusy("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || manualBusy) return;

    let finalIds = new Set(selectedIds);
    const hasStartedManual = manualCards.some((c) => c.term.trim() || c.definition.trim());
    if (hasStartedManual) {
      const addedIds = await commitManualCards();
      if (addedIds === null) {
        setMode("manual");
        return;
      }
      for (const id of addedIds) finalIds.add(id);
    }

    if (finalIds.size === 0) return;

    const ids = Array.from(finalIds);
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
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-2xl transition-all ${
          mode === "manual" ? "max-w-3xl" : "max-w-2xl"
        }`}
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
                onClick={() => setMode("manual")}
                className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  mode === "manual" ? "bg-ink text-bg" : "bg-bg text-muted hover:text-ink"
                }`}
              >
                <PenLine size={13} /> Tạo tay ({manualCards.length})
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
                  Chưa có từ nào trong học phần này. Chuyển sang tab <b>“Tạo tay”</b>, <b>“Nhập từ mới nhanh”</b> hoặc <b>“AI tạo Flashcard”</b> để thêm từ.
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
          ) : mode === "manual" ? (
            <div className="space-y-3">
              <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                {manualCards.map((card, index) => (
                  <div
                    key={card.id}
                    className="rounded-2xl border border-line bg-bg p-3.5 transition focus-within:border-brand/60"
                  >
                    <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-line pb-2">
                      <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-lg bg-card px-2 text-xs font-bold text-muted">
                        {index + 1}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateManualCard(card.id, { showExtra: !card.showExtra })
                          }
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-muted transition hover:bg-card hover:text-ink"
                        >
                          {card.showExtra ? (
                            <>
                              <ChevronUp size={13} /> Ẩn chi tiết
                            </>
                          ) : (
                            <>
                              <ChevronDown size={13} /> + IPA / Ví dụ / Loại từ
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          title="Xoá thẻ này"
                          disabled={manualCards.length <= 1}
                          onClick={() => removeManualCard(card.id)}
                          className="rounded-lg p-1 text-muted transition hover:bg-rose-500/15 hover:text-rose-600 disabled:opacity-30 dark:hover:text-rose-300"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold tracking-wider text-muted uppercase">
                          Thuật ngữ
                        </label>
                        <input
                          value={card.term}
                          onChange={(e) =>
                            updateManualCard(card.id, { term: e.target.value })
                          }
                          placeholder="Vd: ubiquitous"
                          className="w-full rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus:border-brand-hover"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold tracking-wider text-muted uppercase">
                          Định nghĩa
                        </label>
                        <input
                          value={card.definition}
                          onChange={(e) =>
                            updateManualCard(card.id, { definition: e.target.value })
                          }
                          placeholder="Vd: có mặt ở khắp mọi nơi"
                          className="w-full rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus:border-brand-hover"
                        />
                      </div>
                    </div>

                    {card.showExtra && (
                      <div className="mt-3 grid gap-3 border-t border-line/60 pt-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[10px] font-bold tracking-wider text-muted uppercase">
                            IPA (tuỳ chọn)
                          </label>
                          <input
                            value={card.ipa}
                            onChange={(e) =>
                              updateManualCard(card.id, { ipa: e.target.value })
                            }
                            placeholder="Vd: /juːˈbɪk.wɪ.təs/"
                            className="w-full rounded-xl border border-line bg-card px-3 py-2 text-xs outline-none focus:border-brand-hover"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold tracking-wider text-muted uppercase">
                            Ví dụ (tuỳ chọn)
                          </label>
                          <input
                            value={card.example}
                            onChange={(e) =>
                              updateManualCard(card.id, { example: e.target.value })
                            }
                            placeholder="Vd: Smartphones have become ubiquitous."
                            className="w-full rounded-xl border border-line bg-card px-3 py-2 text-xs outline-none focus:border-brand-hover"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold tracking-wider text-muted uppercase">
                            Từ loại (tuỳ chọn)
                          </label>
                          <select
                            value={card.pos}
                            onChange={(e) =>
                              updateManualCard(card.id, { pos: e.target.value })
                            }
                            className="w-full rounded-xl border border-line bg-card px-3 py-2 text-xs outline-none focus:border-brand-hover"
                          >
                            <option value="">Chưa chọn</option>
                            <option value="n">Danh từ (n)</option>
                            <option value="v">Động từ (v)</option>
                            <option value="adj">Tính từ (adj)</option>
                            <option value="adv">Trạng từ (adv)</option>
                            <option value="phr">Cụm từ (phr)</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold tracking-wider text-muted uppercase">
                            Cấp độ CEFR
                          </label>
                          <select
                            value={card.level}
                            onChange={(e) =>
                              updateManualCard(card.id, { level: e.target.value })
                            }
                            className="w-full rounded-xl border border-line bg-card px-3 py-2 text-xs outline-none focus:border-brand-hover"
                          >
                            {LEVELS.map((lv) => (
                              <option key={lv} value={lv}>
                                {lv}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {manualErr && (
                <div className="rounded-xl bg-rose-500/15 px-3.5 py-2 text-xs text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
                  {manualErr}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addManualCard}
                  className="flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-bg py-2.5 text-xs font-bold text-ink transition hover:border-brand-hover hover:text-brand-hover"
                >
                  <Plus size={15} strokeWidth={2.3} /> Thêm thẻ
                </button>
                <button
                  type="button"
                  onClick={() => void commitManualCards()}
                  disabled={validManualCards.length === 0 || manualBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-2.5 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg disabled:opacity-40"
                >
                  {manualBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {manualBusy
                    ? "Đang lưu thẻ..."
                    : `Thêm ${validManualCards.length > 0 ? `${validManualCards.length} ` : ""}thẻ vào học phần`}
                </button>
              </div>
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
          ) : null}
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
            disabled={!title.trim() || manualBusy || (selectedIds.size === 0 && validManualCards.length === 0)}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-40"
          >
            {manualBusy && <Loader2 size={14} className="animate-spin" />}
            {manualBusy
              ? "Đang lưu..."
              : editing
              ? `Lưu (${selectedIds.size + validManualCards.length} từ)`
              : `Tạo học phần (${selectedIds.size + validManualCards.length} từ)`}
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

function MoveFolderModal({
  studySet,
  folders,
  onClose,
}: {
  studySet: StudySet;
  folders: StudyFolder[];
  onClose: () => void;
}) {
  const [targetFolderId, setTargetFolderId] = useState<string>(studySet.folderId ?? "");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    moveStudySetToFolder(studySet.id, targetFolderId || null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4" onClick={onClose}>
      <form
        onSubmit={handleSave}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold sm:text-lg">Chuyển thư mục</h2>
            <p className="truncate text-xs text-muted">Học phần: {studySet.title}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto p-5">
          <button
            type="button"
            onClick={() => setTargetFolderId("")}
            className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold transition ${
              targetFolderId === ""
                ? "border-brand bg-brand/10 text-ink"
                : "border-line bg-bg text-muted hover:text-ink"
            }`}
          >
            <span>Không thuộc thư mục nào</span>
            {targetFolderId === "" && <Check size={15} className="text-brand-hover" />}
          </button>

          {folders.map((f) => {
            const selected = targetFolderId === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setTargetFolderId(f.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold transition ${
                  selected
                    ? "border-brand bg-brand/10 text-ink"
                    : "border-line bg-bg text-ink hover:bg-card-hover"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Folder size={15} className="shrink-0 text-brand-hover" />
                  <span className="truncate">{f.name}</span>
                </span>
                {selected && <Check size={15} className="shrink-0 text-brand-hover" />}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
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
            Lưu thay đổi
          </button>
        </div>
      </form>
    </div>
  );
}

let cachedVocabWords: Word[] | null = null;
let cachedVocabOverviewStats: { dueCount: number; totalWords: number; masteredCount: number } | null = null;

function VocabLearnContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const selectedBookId = searchParams.get("book");
  const urlSetId = searchParams.get("setId");
  const bookModuleQuery = useMemo(() => {
    const qSource = searchParams.get("source") ?? "";
    if (!qSource.startsWith("book-")) return null;
    return {
      source: qSource,
      tier: searchParams.get("tier") ?? null,
      topic: searchParams.get("topic") ?? null,
      part: Math.max(1, Number(searchParams.get("part") || "1") || 1),
    };
  }, [searchParams]);

  const [words, setWords] = useState<Word[]>(() => cachedVocabWords ?? []);
  const [stats, setStats] = useState(
    () => cachedVocabOverviewStats ?? { dueCount: 0, totalWords: 0, masteredCount: 0 }
  );
  const [loading, setLoading] = useState(() => !cachedVocabWords);
  const [bookWords, setBookWords] = useState<Word[]>([]);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookLoaded, setBookLoaded] = useState(false);
  const [bookErr, setBookErr] = useState("");
  const [savedBookSetId, setSavedBookSetId] = useState<string | null>(null);
  const [bookFolderModalOpen, setBookFolderModalOpen] = useState(false);
  const [newBookFolderName, setNewBookFolderName] = useState("");
  const selectedSetId = urlSetId;
  const openStudySet = useCallback(
    (id: string) => {
      router.push(`/vocab?setId=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router]
  );
  const closeStudySet = useCallback(
    (replace = false) => {
      if (replace) {
        router.replace("/vocab", { scroll: false });
      } else {
        router.push("/vocab", { scroll: false });
      }
    },
    [router]
  );
  const [openMenuSetId, setOpenMenuSetId] = useState<string | null>(null);
  const [moveFolderSet, setMoveFolderSet] = useState<StudySet | null>(null);
  const [activeSession, setActiveSession] = useState<{
    mode: "flashcards" | "learn" | "test" | "match";
    id: string;
    title: string;
    words: Word[];
  } | null>(null);
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
  const [localTab, setLocalTab] = useState<"sets" | "folders">("sets");
  const activeTab: "sets" | "folders" | "books" = urlTab === "books" ? "books" : localTab;
  const switchTab = useCallback(
    (next: "sets" | "folders" | "books") => {
      if (next === "books") {
        router.replace("/vocab?tab=books", { scroll: false });
      } else {
        setLocalTab(next);
        if (urlTab === "books" || selectedBookId) {
          router.replace("/vocab", { scroll: false });
        }
      }
    },
    [router, urlTab, selectedBookId]
  );
  const [setFilter, setSetFilter] = useState<"all" | "unfoldered">("all");
  const [setSearch, setSetSearch] = useState("");
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [srsBanner, setSrsBanner] = useState<{ text: string; isErr?: boolean } | null>(null);
  const [reviewCfgOpen, setReviewCfgOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionsMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actionsMenuOpen]);

  const studySets = useStudySets();
  const folders = useStudyFolders();
  const reviewConfig = useStudySetReviewConfig();
  const { isAdmin } = useMe();

  useEffect(() => {
    if (!openMenuSetId) return;
    const close = () => setOpenMenuSetId(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuSetId(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenuSetId]);

  const reloadWords = useCallback(async (): Promise<Word[]> => {
    const [wJson, rSummary] = await Promise.all([
      fetch("/api/words", { cache: "no-store" }).then((r) => r.json()),
      fetchDueSummaryCached(),
    ]);
    const list = (wJson.words ?? []) as Word[];
    const nextStats = {
      dueCount: rSummary.dueCount ?? 0,
      totalWords: rSummary.totalWords ?? list.length,
      masteredCount: rSummary.masteredCount ?? 0,
    };
    cachedVocabWords = list;
    cachedVocabOverviewStats = nextStats;
    setWords(list);
    setStats(nextStats);
    return list;
  }, []);

  const loadBookWords = useCallback(async () => {
    setBookLoading(true);
    setBookErr("");
    try {
      const r = await fetch("/api/words?scope=books", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setBookWords((j.words ?? []) as Word[]);
      setBookLoaded(true);
    } catch (e) {
      setBookErr((e as Error).message || "Không tải được danh sách bộ sách");
    } finally {
      setBookLoading(false);
    }
  }, []);

  const reloadBookAndPersonalWords = useCallback(async () => {
    await Promise.all([loadBookWords(), reloadWords()]);
  }, [loadBookWords, reloadWords]);

  const deleteBookWord = async (w: Word) => {
    if (!isAdmin) return;
    if (!window.confirm(`Xoá từ "${w.word}" khỏi Bộ sách cộng đồng?`)) return;
    setActivityLabel("/api/words", `Đang xoá từ "${w.word}" khỏi bộ sách...`);
    const r = await fetch(`/api/words?scope=book&id=${w.id}`, { method: "DELETE" });
    if (r.ok) {
      setBookWords((prev) => prev.filter((x) => x.id !== w.id));
      setWords((prev) => prev.filter((x) => x.id !== w.id));
      notifyDueUpdated();
    }
  };

  useEffect(() => {
    const isBookLink = Boolean(bookModuleQuery);

    const rafId = requestAnimationFrame(() => {
      setNowMs(Date.now());
      if (isBookLink) {
        setBookLoading(true);
      }
    });
    Promise.all([
      fetch("/api/words", { cache: "no-store" }).then((r) => r.json()),
      fetchDueSummaryCached(),
      isBookLink
        ? fetch("/api/words?scope=books", { cache: "no-store" }).then((r) => r.json())
        : Promise.resolve(null),
    ])
      .then(([wJson, rSummary, bJson]) => {
        const list = (wJson.words ?? []) as Word[];
        const nextStats = {
          dueCount: rSummary.dueCount ?? 0,
          totalWords: rSummary.totalWords ?? list.length,
          masteredCount: rSummary.masteredCount ?? 0,
        };
        cachedVocabWords = list;
        cachedVocabOverviewStats = nextStats;
        setWords(list);
        setStats(nextStats);
        if (bJson) {
          setBookWords((bJson.words ?? []) as Word[]);
          setBookLoaded(true);
        }
      })
      .finally(() => {
        setLoading(false);
        setBookLoading(false);
      });
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if ((activeTab !== "books" && !bookModuleQuery) || bookLoaded || bookLoading) return;
    const rafId = requestAnimationFrame(() => {
      void loadBookWords();
    });
    return () => cancelAnimationFrame(rafId);
  }, [activeTab, bookModuleQuery, bookLoaded, bookLoading, loadBookWords]);

  const wordMap = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const combinedWordMap = useMemo(() => {
    if (bookWords.length === 0) return wordMap;
    const m = new Map(wordMap);
    for (const w of bookWords) {
      if (!m.has(w.id)) m.set(w.id, w);
    }
    return m;
  }, [wordMap, bookWords]);
  const bookFallbackFetchedRef = useRef(false);
  useEffect(() => {
    if (loading || bookFallbackFetchedRef.current || bookWords.length > 0) return;
    const hasMissing = studySets.some((s) => s.wordIds.some((id) => !wordMap.has(id)));
    if (!hasMissing) return;
    bookFallbackFetchedRef.current = true;
    fetch("/api/words?scope=books", { cache: "no-store" })
      .then((r) => r.json())
      .then((bJson) => {
        if (bJson?.words) setBookWords(bJson.words as Word[]);
      })
      .catch(() => {
        // bỏ qua
      });
  }, [loading, bookWords.length, studySets, wordMap]);

  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const activeFolder = activeFolderId ? folderMap.get(activeFolderId) ?? null : null;

  const virtualBookModule = useMemo<{ studySet: StudySet; words: Word[] } | null>(() => {
    if (!bookModuleQuery) return null;
    const CHUNK_SIZE = 65;
    const filtered = bookWords.filter((w) => {
      if (w.source !== bookModuleQuery.source) return false;
      if (bookModuleQuery.tier) {
        const tierLabel = ["C1", "C2"].includes(w.level)
          ? "Advanced"
          : w.level === "B2"
          ? "Intermediate"
          : "Beginner";
        if (tierLabel.toLowerCase() !== bookModuleQuery.tier.toLowerCase()) return false;
      }
      if (bookModuleQuery.topic && (w.topic || "General") !== bookModuleQuery.topic) {
        return false;
      }
      return true;
    });
    const totalParts = Math.max(1, Math.ceil(filtered.length / CHUNK_SIZE));
    const safePart = Math.min(bookModuleQuery.part, totalParts);
    const slice = filtered.slice((safePart - 1) * CHUNK_SIZE, safePart * CHUNK_SIZE);
    const tierPart = bookModuleQuery.tier ? `${bookModuleQuery.tier} ` : "";
    const topicPart = bookModuleQuery.topic || "Tổng hợp";
    const partSuffix = totalParts > 1 ? ` – Phần ${safePart}` : "";
    return {
      studySet: {
        id: `book:${bookModuleQuery.source}:${bookModuleQuery.tier ?? "all"}:${bookModuleQuery.topic ?? "all"}:p${safePart}`,
        title: `IELTS: ${tierPart}${topicPart}${partSuffix}`,
        desc: `Học phần từ Bộ sách (${slice.length} thẻ)`,
        wordIds: slice.map((w) => w.id),
        createdAt: "",
      },
      words: slice,
    };
  }, [bookModuleQuery, bookWords]);

  const existingSavedBookSet = useMemo(() => {
    if (!virtualBookModule) return null;
    if (savedBookSetId) {
      const byId = studySets.find((s) => s.id === savedBookSetId);
      if (byId) return byId;
    }
    const targetIds = virtualBookModule.words.map((w) => w.id);
    return (
      studySets.find(
        (s) =>
          s.title === virtualBookModule.studySet.title &&
          s.wordIds.length === targetIds.length &&
          s.wordIds.every((id, idx) => id === targetIds[idx])
      ) ?? null
    );
  }, [virtualBookModule, savedBookSetId, studySets]);

  const handleSaveBookModuleToPersonal = useCallback(
    (folderId?: string | null) => {
      if (!virtualBookModule || virtualBookModule.words.length === 0) return;
      if (existingSavedBookSet) {
        if (folderId !== undefined) {
          moveStudySetToFolder(existingSavedBookSet.id, folderId);
          const folderName = folderId ? folderMap.get(folderId)?.name : null;
          setSrsBanner({
            text: folderName
              ? `Đã chuyển “${existingSavedBookSet.title}” vào thư mục “${folderName}”.`
              : `Đã cập nhật thư mục cho “${existingSavedBookSet.title}”.`,
          });
        } else {
          setSrsBanner({
            text: `Học phần “${existingSavedBookSet.title}” đã được lưu trong Học phần của bạn.`,
          });
        }
        return;
      }

      const created = createStudySet({
        title: virtualBookModule.studySet.title,
        desc: virtualBookModule.studySet.desc,
        wordIds: virtualBookModule.words.map((w) => w.id),
        folderId: folderId ?? null,
      });
      setSavedBookSetId(created.id);
      const folderName = folderId ? folderMap.get(folderId)?.name : null;
      setSrsBanner({
        text: folderName
          ? `Đã lưu “${created.title}” vào học phần cá nhân & thư mục “${folderName}”.`
          : `Đã lưu “${created.title}” vào Học phần của bạn.`,
      });
    },
    [virtualBookModule, existingSavedBookSet, folderMap]
  );

  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current || loading || studySets.length === 0) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qSetId = params.get("setId");
    if (!qSetId) {
      deepLinkAppliedRef.current = true;
      return;
    }
    const targetSet = studySets.find((s) => s.id === qSetId);
    if (!targetSet) return;

    deepLinkAppliedRef.current = true;
    const setWords = targetSet.wordIds
      .map((id) => wordMap.get(id))
      .filter((w): w is Word => !!w);
    const qMode = params.get("mode");
    const rafId = requestAnimationFrame(() => {
      if (
        (qMode === "flashcards" ||
          qMode === "learn" ||
          qMode === "test" ||
          qMode === "match") &&
        setWords.length > 0
      ) {
        setActiveSession({
          mode: qMode,
          id: targetSet.id,
          title: targetSet.title,
          words: setWords,
        });
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [loading, studySets, wordMap]);
  const selectedSet = useMemo(
    () => (selectedSetId ? studySets.find((s) => s.id === selectedSetId) ?? null : null),
    [selectedSetId, studySets]
  );

  const recentQueue = useMemo(() => {
    if (!nowMs) return [];
    return getRecentReviewQueue(studySets, nowMs);
  }, [studySets, nowMs]);

  const recentSetIds = useMemo(
    () => new Set(recentQueue.map((s) => s.id)),
    [recentQueue]
  );

  const dueSetCount = useMemo(() => {
    if (!nowMs) return 0;
    return recentQueue.filter(
      (s) => s.nextReviewAt && new Date(s.nextReviewAt).getTime() <= nowMs
    ).length;
  }, [recentQueue, nowMs]);

  const visibleQueue = useMemo(() => {
    if (isAdmin) return recentQueue;
    if (!nowMs) return [];
    return recentQueue.filter(
      (s) => s.nextReviewAt && new Date(s.nextReviewAt).getTime() <= nowMs
    );
  }, [isAdmin, recentQueue, nowMs]);

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
    let base = studySets;
    if (activeFolder) {
      base = studySets.filter((s) => s.folderId === activeFolder.id);
    } else if (folders.length > 0 && setFilter === "unfoldered") {
      base = unfolderedSets;
    }
    const q = setSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter((s) => {
      const folderName = s.folderId ? folderMap.get(s.folderId)?.name ?? "" : "";
      return (
        s.title.toLowerCase().includes(q) ||
        folderName.toLowerCase().includes(q)
      );
    });
  }, [activeFolder, studySets, folders.length, setFilter, unfolderedSets, setSearch, folderMap]);

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
            ? isAdmin && res.deferred > 0
              ? `Đã chuyển ${res.enrolled} từ từ “${set.title}” (${res.deferred} từ được dời lịch sang từ ${res.scheduledFromDay ?? "ngày sau"} do hôm nay đã đủ chỉ tiêu).`
              : `Đã chuyển ${res.enrolled} từ mới từ “${set.title}” vào Ôn tập.`
            : `Các từ trong “${set.title}” đã nằm sẵn trong Ôn tập.`,
      });
    } catch (e) {
      setSrsBanner({ text: (e as Error).message, isErr: true });
    } finally {
      setEnrollingId(null);
    }
  };

  const handleSessionCompleted = useCallback(
    (setId: string, scorePct: number) => {
      if (setId.startsWith("book:")) return null;
      const result = completeStudySetReview(setId, scorePct);
      setNowMs(Date.now());
      void reloadWords();
      return result;
    },
    [reloadWords]
  );

  if (activeSession) {
    if (activeSession.mode === "learn") {
      return (
        <StudySetLearn
          setId={activeSession.id}
          title={activeSession.title}
          words={activeSession.words}
          wordPool={bookModuleQuery ? bookWords : words}
          isAdmin={isAdmin}
          onBack={() => setActiveSession(null)}
          onSwitchToFlashcards={() =>
            setActiveSession((prev) => (prev ? { ...prev, mode: "flashcards" } : null))
          }
          onCompleted={(res) => handleSessionCompleted(activeSession.id, res.scorePct)}
        />
      );
    }
    if (activeSession.mode === "test") {
      return (
        <StudySetTest
          setId={activeSession.id}
          title={activeSession.title}
          words={activeSession.words}
          wordPool={bookModuleQuery ? bookWords : words}
          isAdmin={isAdmin}
          onBack={() => setActiveSession(null)}
          onCompleted={(res) => handleSessionCompleted(activeSession.id, res.scorePct)}
        />
      );
    }
    if (activeSession.mode === "match") {
      return (
        <StudySetMatch
          setId={activeSession.id}
          title={activeSession.title}
          words={activeSession.words}
          onBack={() => setActiveSession(null)}
        />
      );
    }
    return (
      <Flashcards
        setId={activeSession.id}
        title={activeSession.title}
        words={activeSession.words}
        isAdmin={isAdmin}
        onBack={() => setActiveSession(null)}
        onSwitchToLearn={() =>
          setActiveSession((prev) => (prev ? { ...prev, mode: "learn" } : null))
        }
        onCompleted={(res) => handleSessionCompleted(activeSession.id, res.scorePct)}
      />
    );
  }

  if (bookModuleQuery && bookLoading) {
    return <CharacterLoader />;
  }

  const selectedSetWords = selectedSet
    ? selectedSet.wordIds
        .map((id) => combinedWordMap.get(id))
        .filter((w): w is Word => !!w)
    : [];
  const selectedSetFolder =
    selectedSet?.folderId ? folderMap.get(selectedSet.folderId) ?? null : null;

  const isVirtualBook = Boolean(virtualBookModule);
  const activeDetailSet = virtualBookModule?.studySet ?? selectedSet;
  const activeDetailWords = virtualBookModule ? virtualBookModule.words : selectedSetWords;

  return (
    <div className="space-y-6 sm:space-y-8">
      {activeDetailSet ? (
        <>
          {srsBanner && (
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm font-medium ${
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
                  Mở Ôn tập →
                </Link>
              )}
            </div>
          )}
          <StudySetDetail
            studySet={activeDetailSet}
            folder={isVirtualBook ? null : selectedSetFolder}
            words={activeDetailWords}
            enrolling={enrollingId === activeDetailSet.id}
            readOnly={isVirtualBook}
            savedToPersonal={Boolean(existingSavedBookSet)}
            onSaveToPersonal={() => handleSaveBookModuleToPersonal()}
            onSaveToFolder={() => {
              setNewBookFolderName("");
              setBookFolderModalOpen(true);
            }}
            onBack={() =>
              isVirtualBook
                ? router.push(
                    `/vocab?tab=books&book=${encodeURIComponent(bookModuleQuery!.source)}`,
                    { scroll: false }
                  )
                : closeStudySet()
            }
            onOpenFolder={(fId) => {
              closeStudySet(true);
              setActiveFolderId(fId);
            }}
            onStartFlashcards={() =>
              setActiveSession({
                mode: "flashcards",
                id: activeDetailSet.id,
                title: activeDetailSet.title,
                words: activeDetailWords,
              })
            }
            onStartLearn={() =>
              setActiveSession({
                mode: "learn",
                id: activeDetailSet.id,
                title: activeDetailSet.title,
                words: activeDetailWords,
              })
            }
            onStartTest={() =>
              setActiveSession({
                mode: "test",
                id: activeDetailSet.id,
                title: activeDetailSet.title,
                words: activeDetailWords,
              })
            }
            onStartMatch={() =>
              setActiveSession({
                mode: "match",
                id: activeDetailSet.id,
                title: activeDetailSet.title,
                words: activeDetailWords,
              })
            }
            onEdit={() => {
              if (!isVirtualBook) setModalState({ open: true, editing: activeDetailSet });
            }}
            onMoveFolder={() => {
              if (!isVirtualBook) setMoveFolderSet(activeDetailSet);
            }}
            onEnroll={() => handleEnrollSet(activeDetailSet, activeDetailWords)}
            onDelete={() => {
              if (isVirtualBook) return;
              if (
                confirm(
                  `Xoá học phần "${activeDetailSet.title}"? (Các từ vẫn giữ nguyên trong Kho từ vựng)`
                )
              ) {
                deleteStudySet(activeDetailSet.id);
                closeStudySet(true);
              }
            }}
          />
        </>
      ) : (
        <>
      {/* Mục tự ôn lại tối đa 5 học phần học gần nhất */}
      {!activeFolder && activeTab !== "books" && studySets.length > 0 && (() => {
        const showOnlyCongrats = !loading && visibleQueue.length === 0 && recentQueue.length > 0;
        return (
        <section className="rounded-3xl bg-card p-5 shadow-lg shadow-slate-900/5 dark:shadow-black/25 sm:p-6">
          {!showOnlyCongrats && (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <CalendarClock size={20} className="shrink-0 text-brand-hover" />
                  {isAdmin && dueSetCount === 0
                    ? "Theo dõi lịch ôn học phần"
                    : "Học phần cần ôn hôm nay"}
                </h2>
                {dueSetCount > 0 && (
                  <span className="whitespace-nowrap rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                    {dueSetCount} đến hạn
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {isAdmin
                  ? "Theo dõi tối đa 5 học phần học gần nhất · Ưu tiên nhắc học phần đã học lâu nhất trước."
                  : "Các học phần được gợi ý ôn lại để nhớ lâu hơn."}
              </p>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setReviewCfgOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full bg-bg px-3.5 py-1.5 text-xs font-bold text-muted shadow-xs transition hover:text-ink"
              >
                <Settings2 size={14} />
                {reviewConfig.mode === "srs"
                  ? "Chu kỳ: 1→3→7→14→30 ngày"
                  : `Cố định: ${reviewConfig.fixedDays} ngày`}
              </button>
            )}
          </div>
          )}

          {!showOnlyCongrats && isAdmin && reviewCfgOpen && (
            <div className="mt-4 rounded-2xl bg-bg p-4 text-xs shadow-sm">
              <div className="font-bold text-ink">Cài đặt lịch tự ôn lại học phần</div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    saveStudySetReviewConfig({ ...reviewConfig, mode: "srs" })
                  }
                  className={`rounded-full px-3.5 py-1.5 font-bold transition ${
                    reviewConfig.mode === "srs"
                      ? "bg-brand text-white"
                      : "bg-card text-muted hover:text-ink"
                  }`}
                >
                  Tự động giãn cách (1 → 3 → 7 → 14 → 30 ngày)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    saveStudySetReviewConfig({ ...reviewConfig, mode: "fixed" })
                  }
                  className={`rounded-full px-3.5 py-1.5 font-bold transition ${
                    reviewConfig.mode === "fixed"
                      ? "bg-brand text-white"
                      : "bg-card text-muted hover:text-ink"
                  }`}
                >
                  Cố định số ngày
                </button>
              </div>
              {reviewConfig.mode === "fixed" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-muted">Nhắc lại sau:</span>
                  {[1, 2, 3, 5, 7, 14].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        saveStudySetReviewConfig({ mode: "fixed", fixedDays: d })
                      }
                      className={`rounded-full px-3 py-1 font-bold transition ${
                        reviewConfig.fixedDays === d
                          ? "bg-ink text-bg"
                          : "bg-card text-muted hover:text-ink"
                      }`}
                    >
                      {d} ngày
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="mt-4 flex flex-col items-center justify-center rounded-2xl bg-bg/60 py-6">
              <CharacterLoader mode="reading" indicator="dots" size="sm" />
              <p className="mt-2 text-xs font-medium text-muted">Đang tải học phần cần ôn...</p>
            </div>
          ) : visibleQueue.length === 0 ? (
            recentQueue.length > 0 ? (
              <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-500/10 px-4 py-3.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 size={18} className="shrink-0" />
                <span>Chúc mừng, hôm nay chưa có học phần nào cần ôn cả!</span>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-bg/70 px-4 py-4 text-xs text-muted">
                Chưa có học phần nào được học gần đây. Hãy bấm <b>Lật thẻ</b> hoặc <b>Luyện tập</b> ở một học phần bên dưới — sau khi học xong hệ thống sẽ tự xếp lịch ôn lại tại đây.
              </div>
            )
          ) : (
            <div className="mt-4 space-y-2.5">
              {visibleQueue.map((s, index) => {
                const setWords = s.wordIds
                  .map((id) => wordMap.get(id))
                  .filter((w): w is Word => !!w);
                const status = getStudySetReviewStatus(s, recentSetIds, nowMs);
                const setFolder = s.folderId ? folderMap.get(s.folderId) : null;
                return (
                  <div
                    key={s.id}
                    className={`flex flex-col gap-3 rounded-2xl px-4 py-3.5 shadow-sm shadow-slate-900/5 transition hover:shadow-md dark:shadow-black/20 sm:flex-row sm:items-center sm:justify-between ${
                      status.isDue ? "bg-brand/5" : "bg-bg/70"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                          status.isDue
                            ? "bg-brand text-white"
                            : "bg-card text-muted"
                        }`}
                      >
                        {isAdmin ? `#${index + 1}` : <Layers size={14} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-words font-bold text-ink">{s.title}</span>
                          {isAdmin ? (
                            <span
                              className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                status.isDue
                                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                                  : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                              }`}
                            >
                              <Clock size={11} /> {status.badgeText}
                            </span>
                          ) : status.isDue ? (
                            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                              <Clock size={11} /> Cần ôn
                            </span>
                          ) : null}
                          {setFolder && (
                            <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold text-muted">
                              <Folder size={10} className="shrink-0" />
                              <span className="truncate">{setFolder.name}</span>
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                          <span>{setWords.length} thẻ</span>
                          {isAdmin && status.lastStudiedLabel && <span>{status.lastStudiedLabel}</span>}
                          {isAdmin && typeof s.lastScore === "number" && (
                            <span>Lần trước: {s.lastScore}%</span>
                          )}
                          {isAdmin && (s.reviewLevel ?? 0) > 0 && (
                            <span>Mức {s.reviewLevel}/5</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:items-center">
                      <button
                        type="button"
                        disabled={setWords.length === 0}
                        onClick={() =>
                          setActiveSession({
                            mode: "learn",
                            id: s.id,
                            title: s.title,
                            words: setWords,
                          })
                        }
                        className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold shadow-xs transition disabled:opacity-40 ${
                          status.isDue
                            ? "bg-brand text-white hover:bg-brand-hover hover:text-bg"
                            : "bg-card text-ink hover:bg-brand hover:text-white"
                        }`}
                      >
                        <Sparkles size={13} /> Luyện tập
                      </button>
                      <button
                        type="button"
                        disabled={setWords.length === 0}
                        onClick={() =>
                          setActiveSession({
                            mode: "flashcards",
                            id: s.id,
                            title: s.title,
                            words: setWords,
                          })
                        }
                        className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-card px-3.5 py-2 text-xs font-bold text-muted shadow-xs transition hover:text-ink hover:shadow-sm disabled:opacity-40"
                      >
                        <Layers size={13} /> Lật thẻ
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        );
      })()}

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

            <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl bg-card p-5 shadow-md shadow-slate-900/5 dark:shadow-black/25 sm:p-6">
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
                  className="inline-flex items-center gap-1.5 rounded-full bg-bg px-4 py-2 text-xs font-bold text-ink shadow-xs transition hover:shadow-sm"
                >
                  <FolderInput size={14} /> Thêm học phần có sẵn
                </button>
                <button
                  type="button"
                  onClick={() => setModalState({ open: true, editing: null })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-hover hover:text-bg"
                >
                  <Plus size={14} strokeWidth={2.2} /> Tạo học phần mới
                </button>
                <button
                  type="button"
                  title="Chỉnh sửa thư mục"
                  onClick={() => setFolderModal({ open: true, editing: activeFolder })}
                  className="rounded-full bg-bg p-2 text-muted shadow-xs hover:text-ink"
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
                  className="rounded-full bg-bg p-2 text-muted shadow-xs hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-300"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <h2 className="text-[32px] font-bold leading-tight">Học phần của bạn</h2>
            {isAdmin && (
              <p className="mt-0.5 text-xs text-muted">
                Sắp xếp học phần theo thư mục để luyện Flashcards và chuyển vào Ôn tập.
              </p>
            )}
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
                Mở Ôn tập →
              </Link>
            )}
          </div>
        )}

        {!activeFolder && (
          <div className="mb-5 space-y-4">
            {/* Thanh tạo học phần giống Quizlet */}
            {activeTab !== "books" && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line/70 bg-card px-4 py-3 shadow-sm shadow-slate-900/5 dark:shadow-black/20">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-hover">
                    <Layers size={18} strokeWidth={1.8} />
                  </span>
                  <span className="truncate text-sm font-bold text-ink">
                    Tạo bộ thẻ ghi nhớ
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalState({ open: true, editing: null })}
                  className="shrink-0 rounded-full bg-brand px-5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-brand-hover sm:text-sm"
                >
                  Tạo
                </button>
              </div>
            )}

            <div
              className={`flex items-center justify-between gap-2 border-b border-line ${
                activeTab === "sets" ? "flex-wrap" : ""
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto sm:gap-6">
                <button
                  type="button"
                  onClick={() => switchTab("sets")}
                  className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap pb-3 text-[13px] font-bold transition sm:gap-2 sm:text-sm ${
                    activeTab === "sets" ? "text-brand-hover" : "text-muted hover:text-ink"
                  }`}
                >
                  <Layers size={15} className="shrink-0 sm:h-4 sm:w-4" /> Học phần ({studySets.length})
                  {activeTab === "sets" && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand-hover" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => switchTab("folders")}
                  className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap pb-3 text-[13px] font-bold transition sm:gap-2 sm:text-sm ${
                    activeTab === "folders" ? "text-brand-hover" : "text-muted hover:text-ink"
                  }`}
                >
                  <Folder size={15} className="shrink-0 sm:h-4 sm:w-4" /> Thư mục ({folders.length})
                  {activeTab === "folders" && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand-hover" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => switchTab("books")}
                  className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap pb-3 text-[13px] font-bold transition sm:gap-2 sm:text-sm ${
                    activeTab === "books" ? "text-brand-hover" : "text-muted hover:text-ink"
                  }`}
                >
                  <BookMarked size={15} className="shrink-0 sm:h-4 sm:w-4" /> Bộ sách
                  {activeTab === "books" && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand-hover" />
                  )}
                </button>
              </div>

              <div
                className={`flex shrink-0 items-center justify-end gap-2 pb-2 ${
                  activeTab === "sets" ? "w-full sm:w-auto" : ""
                }`}
              >
                {activeTab === "sets" && (
                  <div className="relative flex flex-1 items-center sm:flex-initial">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-3 text-muted"
                    />
                    <input
                      type="text"
                      value={setSearch}
                      onChange={(e) => setSetSearch(e.target.value)}
                      placeholder="Tìm kiếm thẻ ghi nhớ"
                      className="h-8 w-full rounded-full border border-line bg-card pl-8 pr-7 text-xs text-ink outline-none transition placeholder:text-muted focus:border-brand sm:w-60"
                    />
                    {setSearch && (
                      <button
                        type="button"
                        aria-label="Xoá tìm kiếm"
                        onClick={() => setSetSearch("")}
                        className="absolute right-2 rounded-full p-0.5 text-muted hover:text-ink"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                )}

                <div ref={actionsMenuRef} className="relative">
                  <button
                    type="button"
                    aria-label="Thao tác học phần và thư mục"
                    aria-expanded={actionsMenuOpen}
                    onClick={() => setActionsMenuOpen((v) => !v)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${
                      actionsMenuOpen
                        ? "border-brand bg-brand/10 text-brand-hover"
                        : "border-line bg-card text-muted hover:border-brand-hover hover:text-ink"
                    }`}
                  >
                    <MoreVertical size={16} />
                  </button>

                {actionsMenuOpen && (
                  <div className="absolute right-0 top-10 z-30 w-52 rounded-2xl border border-line bg-card p-1.5 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setActionsMenuOpen(false);
                        setModalState({ open: true, editing: null });
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink transition hover:bg-bg"
                    >
                      <Plus size={16} className="text-brand-hover" /> Tạo học phần
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActionsMenuOpen(false);
                        setFolderModal({ open: true, editing: null });
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink transition hover:bg-bg"
                    >
                      <FolderPlus size={16} className="text-brand-hover" /> Tạo thư mục
                    </button>
                    <Link
                      href="/vocab/stats"
                      onClick={() => setActionsMenuOpen(false)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink transition hover:bg-bg"
                    >
                      <BarChart3 size={16} className="text-brand-hover" /> Thống kê
                    </Link>
                  </div>
                )}
                </div>
              </div>
            </div>

            {activeTab === "sets" && folders.length > 0 && studySets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
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
            )}
          </div>
        )}

        {!activeFolder && activeTab === "books" ? (
          bookLoading && !bookLoaded ? (
            <div className="flex justify-center py-10">
              <CharacterLoader mode="reading" indicator="dots" size="md" />
            </div>
          ) : bookErr ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-sm text-rose-700 dark:text-rose-300">
              <div>{bookErr}</div>
              <button
                type="button"
                onClick={() => void loadBookWords()}
                className="mt-3 rounded-full bg-card px-4 py-1.5 text-xs font-bold text-ink shadow-xs hover:bg-bg"
              >
                Thử lại
              </button>
            </div>
          ) : (
            <BookSection
              words={bookWords}
              onReload={reloadBookAndPersonalWords}
              isAdmin={isAdmin}
              selectedBookId={selectedBookId}
              onSelectBook={(bookId) =>
                router.push(
                  bookId
                    ? `/vocab?tab=books&book=${encodeURIComponent(bookId)}`
                    : "/vocab?tab=books",
                  { scroll: false }
                )
              }
              WordGrid={({ list }) => (
                <SharedWordGrid list={list} onDelete={isAdmin ? deleteBookWord : undefined} />
              )}
            />
          )
        ) : !activeFolder && activeTab === "folders" ? (
          folders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-card p-10 text-center">
              <FolderPlus size={40} strokeWidth={1.3} className="mx-auto text-brand-hover" />
              <div className="mt-3 text-lg font-bold">Chưa có thư mục nào</div>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                Tạo thư mục để gom các học phần cùng chủ đề (ví dụ: Reading, Writing Task 1, Environment...).
              </p>
              <button
                type="button"
                onClick={() => setFolderModal({ open: true, editing: null })}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
              >
                <FolderPlus size={16} strokeWidth={2} /> Tạo thư mục đầu tiên
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {folders.map((f) => {
                const count = folderSetCounts.get(f.id) ?? 0;
                return (
                  <div
                    key={f.id}
                    onClick={() => setActiveFolderId(f.id)}
                    className="group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-transparent bg-transparent p-4 transition hover:border-line hover:bg-card"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-hover">
                        <Folder size={22} strokeWidth={1.75} />
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
          )
        ) : loading ? (
          !activeFolder && studySets.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-2xl bg-card/70 p-4 shadow-sm shadow-slate-900/5 dark:shadow-black/20"
                />
              ))}
            </div>
          ) : (
            <div className="flex justify-center py-8">
              <CharacterLoader mode="reading" indicator="dots" size="md" />
            </div>
          )
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
              Hãy tự tạo học phần từ những từ muốn học (hoặc nhập từ mới) để ôn tập hiệu quả.
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
              const menuOpen = openMenuSetId === s.id;
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setOpenMenuSetId(null);
                    openStudySet(s.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpenMenuSetId(null);
                      openStudySet(s.id);
                    }
                  }}
                  className={`group relative flex cursor-pointer flex-col justify-between rounded-2xl border border-transparent bg-transparent p-4 text-left transition hover:border-line hover:bg-card ${
                    menuOpen ? "z-20 border-line bg-card" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-brand-hover transition group-hover:bg-bg">
                        <Layers size={20} strokeWidth={1.6} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-base font-bold text-ink">
                          {s.title}
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted">
                          <span className="shrink-0 whitespace-nowrap">{setWords.length} thuật ngữ</span>
                          <span aria-hidden="true" className="shrink-0 opacity-60">·</span>
                          {setFolder ? (
                            <span className="inline-flex min-w-0 items-center gap-1 text-muted">
                              <Folder size={11} className="shrink-0" />
                              <span className="truncate">{setFolder.name}</span>
                            </span>
                          ) : (
                            <span className="inline-flex min-w-0 items-center gap-1 text-muted">
                              <Folder size={11} className="shrink-0" />
                              <span className="truncate">Chưa có thư mục</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div
                      className="relative shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        aria-label={`Tuỳ chọn cho ${s.title}`}
                        title="Tuỳ chọn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuSetId((prev) => (prev === s.id ? null : s.id));
                        }}
                        className="rounded-lg p-1.5 text-muted transition hover:bg-bg hover:text-ink"
                      >
                        <MoreVertical size={17} />
                      </button>

                      {menuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-2xl border border-line bg-card p-1.5 shadow-xl"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuSetId(null);
                              setModalState({ open: true, editing: s });
                            }}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-bg"
                          >
                            <Pencil size={14} className="text-muted" /> Chỉnh sửa
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuSetId(null);
                              setMoveFolderSet(s);
                            }}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-bg"
                          >
                            <FolderInput size={14} className="text-muted" /> Chuyển thư mục
                          </button>

                          {setWords.length > 0 && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setOpenMenuSetId(null);
                                void handleEnrollSet(s, setWords);
                              }}
                              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-bg disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 size={14} className="animate-spin text-muted" />
                              ) : (
                                <Repeat size={14} className="text-muted" />
                              )}
                              {busy ? "Đang chuyển..." : "Chuyển vào ôn tập"}
                            </button>
                          )}

                          <div className="my-1 border-t border-line" />

                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuSetId(null);
                              if (
                                confirm(
                                  `Xoá học phần "${s.title}"? (Các từ vẫn giữ nguyên trong Kho từ vựng)`
                                )
                              ) {
                                deleteStudySet(s.id);
                              }
                            }}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400"
                          >
                            <Trash2 size={14} /> Xoá
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
        </>
      )}

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

      {moveFolderSet && (
        <MoveFolderModal
          studySet={moveFolderSet}
          folders={folders}
          onClose={() => setMoveFolderSet(null)}
        />
      )}

      {bookFolderModalOpen && virtualBookModule && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setBookFolderModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-card shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <div className="text-base font-bold">Thêm vào thư mục</div>
                <div className="mt-0.5 line-clamp-1 text-xs text-muted">
                  {virtualBookModule.studySet.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBookFolderModalOpen(false)}
                className="rounded-full p-1.5 text-muted hover:bg-bg hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto p-5">
              {folders.length === 0 ? (
                <div className="rounded-xl bg-bg p-3 text-center text-xs text-muted">
                  Bạn chưa có thư mục nào. Hãy tạo thư mục mới bên dưới.
                </div>
              ) : (
                folders.map((f) => {
                  const isCurrent = existingSavedBookSet?.folderId === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        handleSaveBookModuleToPersonal(f.id);
                        setBookFolderModalOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold transition ${
                        isCurrent
                          ? "border-brand bg-brand/10 text-ink"
                          : "border-line bg-bg text-ink hover:border-brand-hover hover:bg-card-hover"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Folder size={15} className="shrink-0 text-brand-hover" />
                        <span className="truncate">{f.name}</span>
                      </span>
                      {isCurrent && <Check size={15} className="shrink-0 text-brand-hover" />}
                    </button>
                  );
                })
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newBookFolderName.trim();
                  if (!name) return;
                  const createdFolder = createStudyFolder({ name });
                  handleSaveBookModuleToPersonal(createdFolder.id);
                  setNewBookFolderName("");
                  setBookFolderModalOpen(false);
                }}
                className="flex items-center gap-2 border-t border-line pt-3"
              >
                <input
                  value={newBookFolderName}
                  onChange={(e) => setNewBookFolderName(e.target.value)}
                  placeholder="Hoặc tạo thư mục mới..."
                  className="min-w-0 flex-1 rounded-full border border-line bg-bg px-3.5 py-2 text-xs outline-none focus:border-brand-hover"
                />
                <button
                  type="submit"
                  disabled={!newBookFolderName.trim()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-3.5 py-2 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-40"
                >
                  <FolderPlus size={14} /> Tạo &amp; Lưu
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VocabLearn() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <CharacterLoader mode="reading" indicator="dots" size="md" />
        </div>
      }
    >
      <VocabLearnContent />
    </Suspense>
  );
}
