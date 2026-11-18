"use client";

import { useMemo, useState } from "react";
import { Check, FolderPlus, Layers, Plus, X } from "lucide-react";
import { levelColor } from "@/lib/mock";
import {
  createStudyFolder,
  createStudySet,
  updateStudySet,
  useStudyFolders,
  useStudySets,
} from "@/lib/study-sets";
import type { DailyWord } from "@/app/api/daily/route";

type ModalMode = "new" | "existing";

export default function AddToStudySetModal({
  words,
  defaultTitle,
  defaultDesc = "",
  onClose,
  onSaved,
}: {
  words: DailyWord[];
  defaultTitle: string;
  defaultDesc?: string;
  onClose: () => void;
  onSaved?: (info: { setTitle: string; count: number; isNew: boolean }) => void;
}) {
  const studySets = useStudySets();
  const folders = useStudyFolders();

  const [mode, setMode] = useState<ModalMode>("new");
  const [title, setTitle] = useState(defaultTitle);
  const [desc, setDesc] = useState(defaultDesc);
  const [folderId, setFolderId] = useState("");

  // Tạo thư mục mới ngay trong modal
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Thêm vào học phần có sẵn
  const [selectedSetId, setSelectedSetId] = useState(() => studySets[0]?.id ?? "");

  // Danh sách từ được chọn (mặc định chọn tất cả)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(words.map((w) => w.id))
  );

  const folderNameMap = useMemo(
    () => new Map(folders.map((f) => [f.id, f.name])),
    [folders]
  );

  const activeSetId =
    studySets.some((s) => s.id === selectedSetId) ? selectedSetId : (studySets[0]?.id ?? "");

  const toggleWord = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateFolderInline = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const created = createStudyFolder({ name: trimmed });
    setFolderId(created.id);
    setNewFolderName("");
    setCreatingFolder(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const chosenIds = words.filter((w) => selectedIds.has(w.id)).map((w) => w.id);
    if (chosenIds.length === 0) return;

    if (mode === "new") {
      const cleanTitle = title.trim();
      if (!cleanTitle) return;
      const created = createStudySet({
        title: cleanTitle,
        desc: desc.trim(),
        wordIds: chosenIds,
        folderId: folderId || null,
      });
      onSaved?.({ setTitle: created.title, count: chosenIds.length, isNew: true });
      onClose();
      return;
    }

    const target = studySets.find((s) => s.id === activeSetId);
    if (!target) return;
    const mergedIds = Array.from(new Set([...target.wordIds, ...chosenIds]));
    updateStudySet(target.id, {
      title: target.title,
      desc: target.desc,
      folderId: target.folderId ?? null,
      wordIds: mergedIds,
    });
    onSaved?.({ setTitle: target.title, count: chosenIds.length, isNew: false });
    onClose();
  };

  const canSubmit =
    selectedIds.size > 0 &&
    (mode === "new" ? title.trim().length > 0 : Boolean(activeSetId));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-brand-hover" />
            <h2 className="text-base font-bold sm:text-lg">Thêm vào học phần</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* Chuyển chế độ: Tạo mới / Thêm vào có sẵn */}
        <div className="border-b border-line bg-bg/50 px-4 py-2.5 sm:px-6">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-bg p-1">
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mode === "new"
                  ? "bg-card text-ink shadow-xs dark:shadow-none"
                  : "text-muted hover:text-ink"
              }`}
            >
              Tạo học phần mới
            </button>
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mode === "existing"
                  ? "bg-card text-ink shadow-xs dark:shadow-none"
                  : "text-muted hover:text-ink"
              }`}
            >
              Thêm vào học phần có sẵn ({studySets.length})
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {mode === "new" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">
                    Tên học phần *
                  </label>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Vd: 18-11-26"
                    className="w-full rounded-xl border border-line bg-bg px-3.5 py-2 text-sm font-medium outline-none focus:border-brand-hover"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">
                    Mô tả (tuỳ chọn)
                  </label>
                  <input
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="Ghi chú ngắn..."
                    className="w-full rounded-xl border border-line bg-bg px-3.5 py-2 text-sm outline-none focus:border-brand-hover"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted">
                    Lưu vào thư mục (tuỳ chọn)
                  </label>
                  <button
                    type="button"
                    onClick={() => setCreatingFolder((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-hover hover:underline"
                  >
                    <FolderPlus size={13} />
                    {creatingFolder ? "Đóng" : "+ Tạo thư mục mới"}
                  </button>
                </div>

                {creatingFolder && (
                  <div className="mb-2 flex gap-2 rounded-xl border border-brand/40 bg-bg p-2.5">
                    <input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCreateFolderInline();
                        }
                      }}
                      placeholder="Tên thư mục mới (vd: Daily Vocab)..."
                      className="flex-1 rounded-lg border border-line bg-card px-3 py-1.5 text-xs outline-none focus:border-brand-hover"
                    />
                    <button
                      type="button"
                      onClick={handleCreateFolderInline}
                      disabled={!newFolderName.trim()}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-50"
                    >
                      <Plus size={13} /> Tạo
                    </button>
                  </div>
                )}

                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bg px-3.5 py-2 text-sm outline-none focus:border-brand-hover"
                >
                  <option value="">Không thuộc thư mục nào</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : studySets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-bg p-6 text-center text-xs text-muted">
              Bạn chưa có học phần nào. Hãy chuyển sang tab{" "}
              <button
                type="button"
                onClick={() => setMode("new")}
                className="font-bold text-brand-hover hover:underline"
              >
                Tạo học phần mới
              </button>{" "}
              để tạo học phần đầu tiên.
            </div>
          ) : (
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {studySets.map((s) => {
                const folderName = s.folderId ? folderNameMap.get(s.folderId) : undefined;
                const checked = activeSetId === s.id;
                return (
                  <label
                    key={s.id}
                    onClick={() => setSelectedSetId(s.id)}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-xs transition ${
                      checked
                        ? "border-brand bg-brand/15 text-ink"
                        : "border-line bg-bg text-ink/90 hover:border-brand/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-bold">{s.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                        <span>{s.wordIds.length} từ</span>
                        {folderName && (
                          <span className="rounded bg-card px-1.5 py-0.5 font-medium text-ink/80">
                            {folderName}
                          </span>
                        )}
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="existingStudySet"
                      checked={checked}
                      onChange={() => setSelectedSetId(s.id)}
                      className="shrink-0 accent-brand"
                    />
                  </label>
                );
              })}
            </div>
          )}

          {/* Danh sách từ để chọn / bỏ chọn */}
          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted">
                Chọn từ thêm vào ({selectedIds.size}/{words.length})
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(words.map((w) => w.id)))}
                  className="font-semibold text-brand-hover hover:underline"
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="font-semibold text-muted hover:text-rose-500"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>

            <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-2xl border border-line bg-bg p-2">
              {words.map((w) => {
                const isChecked = selectedIds.has(w.id);
                return (
                  <label
                    key={w.id}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-xs transition ${
                      isChecked ? "bg-card" : "opacity-60 hover:opacity-90"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleWord(w.id)}
                      className="h-4 w-4 shrink-0 accent-brand"
                    />
                    <span className="font-bold text-ink">{w.word}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{w.vi}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${levelColor[w.level]}`}
                    >
                      {w.level}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-line px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-2 text-xs font-semibold text-muted hover:text-ink"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg disabled:opacity-50"
          >
            <Check size={14} />
            {mode === "new"
              ? `Tạo học phần (${selectedIds.size} từ)`
              : `Thêm ${selectedIds.size} từ`}
          </button>
        </div>
      </form>
    </div>
  );
}
