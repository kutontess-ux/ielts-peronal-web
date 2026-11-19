"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookMarked,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  LayoutGrid,
  Loader2,
  Plus,
  Repeat,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { levelColor, type Word } from "@/lib/mock";
import { enrollWordsInSrs } from "@/lib/srs";
import { notifyDueUpdated } from "@/lib/due-events";
import { setActivityLabel } from "@/lib/activity";
import ExportButton from "@/components/ExportPanel";
import { BadgePickerModal, CardBadge, EditBadgeButton, useCardBadges } from "@/components/CardBadgePicker";

export type BookMeta = {
  id: string; // trùng với cột words.source (vd: "book-3000")
  title: string;
  desc: string;
  band: string;
  target?: number;
};

const DEFAULT_BOOK: BookMeta = {
  id: "book-3000",
  title: "The Oxford 3000 & 5000 (Chuẩn CEFR)",
  desc: "Danh sách từ vựng cốt lõi chuẩn Oxford 3000 + Oxford 5000 (CEFR A2–C1), tự động lọc trùng kho",
  band: "Band 6.5–7.5",
  target: 5000,
};

const COLLEGIATE_BOOK: BookMeta = {
  id: "book-5000",
  title: "5000 Collegiate Words (IELTS Prep)",
  desc: "Bộ 5000 từ vựng học thuật chuyên sâu chia theo từng cấp độ & chủ đề kiểu Quizlet",
  band: "Band 7.0+",
  target: 5000,
};

const STORAGE_KEY = "ielts_custom_books_v1";

type AgentCandidate = {
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
};

const LEVELS = ["A2", "B1", "B2", "C1", "C2"];

function slugify(s: string): string {
  return (
    "book-" +
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)
  );
}

export default function BookSection({
  words,
  onReload,
  WordGrid,
  isAdmin = false,
  selectedBookId,
  onSelectBook,
}: {
  words: Word[];
  onReload: () => Promise<void>;
  WordGrid: React.ComponentType<{ list: Word[] }>;
  isAdmin?: boolean;
  selectedBookId?: string | null;
  onSelectBook?: (bookId: string | null) => void;
}) {
  const [customBooks, setCustomBooks] = useState<BookMeta[]>([]);
  const [internalBookId, setInternalBookId] = useState<string | null>(null);
  const activeBookId = selectedBookId !== undefined ? selectedBookId : internalBookId;
  const setActiveBookId = (id: string | null) => {
    if (onSelectBook) onSelectBook(id);
    else setInternalBookId(id);
  };
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newBand, setNewBand] = useState("Band 6.5");

  // Bộ lọc trong sách
  const [bookTopic, setBookTopic] = useState("Tất cả");
  const [bookLevels, setBookLevels] = useState<string[]>([]);
  const [bookSearch, setBookSearch] = useState("");

  // Nạp 30 từ (cho The Oxford 3000 - chỉ Admin)
  const [oxLevel, setOxLevel] = useState("Tất cả");
  const [seedBusy, setSeedBusy] = useState(false);
  const [autoSeeding, setAutoSeeding] = useState(false);
  const autoSeedStopRef = useRef(false);

  const { badges, saveBadge } = useCardBadges();
  const [editingBadge, setEditingBadge] = useState<{ key: string; title: string } | null>(null);

  // Agent tìm từ theo yêu cầu (chỉ Admin)
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentBusy, setAgentBusy] = useState<"" | "find" | "save">("");
  const [agentCandidates, setAgentCandidates] = useState<AgentCandidate[] | null>(null);
  const [agentSkipped, setAgentSkipped] = useState(0);
  const [agentOff, setAgentOff] = useState<Set<string>>(new Set());

  // Đóng/mở phần công cụ & bộ lọc trong bộ sách (đóng sẵn trên điện thoại cho gọn)
  const [toolsOpen, setToolsOpen] = useState(false);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [srsBusy, setSrsBusy] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (window.innerWidth >= 768) setToolsOpen(true);
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setCustomBooks(JSON.parse(raw));
      } catch {
        // bỏ qua
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Tự nhận diện các sách bắt đầu bằng "book-" có trong DB cộng đồng
  const books = useMemo(() => {
    const map = new Map<string, BookMeta>();
    map.set(DEFAULT_BOOK.id, DEFAULT_BOOK);
    map.set(COLLEGIATE_BOOK.id, COLLEGIATE_BOOK);
    if (isAdmin) {
      for (const b of customBooks) {
        map.set(b.id, {
          ...b,
          desc: b.desc === "Bộ sách từ vựng cá nhân" ? "Bộ sách từ vựng cộng đồng" : b.desc,
        });
      }
    }
    for (const w of words) {
      if (w.source && w.source.startsWith("book-") && !map.has(w.source)) {
        const matchedCustom = customBooks.find((b) => b.id === w.source);
        map.set(w.source, {
          id: w.source,
          title: matchedCustom?.title || w.source.replace(/^book-/, "").replace(/-/g, " "),
          desc:
            matchedCustom?.desc && matchedCustom.desc !== "Bộ sách từ vựng cá nhân"
              ? matchedCustom.desc
              : "Bộ sách từ vựng cộng đồng",
          band: matchedCustom?.band || "Cộng đồng",
          target: matchedCustom?.target,
        });
      }
    }
    return Array.from(map.values());
  }, [customBooks, isAdmin, words]);

  const activeBook = books.find((b) => b.id === activeBookId) ?? null;

  const createBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newTitle.trim()) return;
    let id = slugify(newTitle);
    if (id === "book-" || books.some((b) => b.id === id)) {
      id = `${id}-${Date.now().toString(36).slice(-4)}`;
    }
    const created: BookMeta = {
      id,
      title: newTitle.trim(),
      desc: newDesc.trim() || "Bộ sách từ vựng cộng đồng",
      band: newBand,
    };
    const next = [...customBooks, created];
    setCustomBooks(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // bỏ qua
    }
    setNewTitle("");
    setNewDesc("");
    setCreating(false);
    setActiveBookId(id);
  };

  const detachBook = async (book: BookMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin || book.id === DEFAULT_BOOK.id) return;
    if (
      !window.confirm(
        `Gỡ bộ sách "${book.title}" khỏi mục Bộ sách cộng đồng?\n(Các từ vựng bên trong vẫn được giữ trong kho chung để không ảnh hưởng Thẻ ghi nhớ của người học.)`
      )
    ) {
      return;
    }
    setActivityLabel("/api/words", `Đang gỡ bộ sách "${book.title}"...`);
    try {
      const r = await fetch("/api/words", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detach_book", source: book.id }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "Không gỡ được bộ sách");
      }
      const next = customBooks.filter((b) => b.id !== book.id);
      setCustomBooks(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // bỏ qua
      }
      if (activeBookId === book.id) setActiveBookId(null);
      await onReload();
    } catch (errObj) {
      window.alert((errObj as Error).message);
    }
  };

  // Bộ lọc theo cấp độ chuẩn Quizlet (Tất cả / Beginner / Intermediate / Advanced)
  const [tierFilter, setTierFilter] = useState<"all" | "beginner" | "intermediate" | "advanced">("all");
  const [viewMode, setViewMode] = useState<"modules" | "all">("modules");
  const [moduleSort, setModuleSort] = useState<"default" | "most" | "least" | "az">("default");

  const bookWords = useMemo(
    () => (activeBook ? words.filter((w) => w.source === activeBook.id) : []),
    [words, activeBook]
  );
  const bookTopics = useMemo(
    () => Array.from(new Set(bookWords.map((w) => w.topic))).sort(),
    [bookWords]
  );
  const bookPresentLevels = useMemo(
    () => LEVELS.filter((l) => bookWords.some((w) => w.level === l)),
    [bookWords]
  );

  const bookFiltered = useMemo(
    () =>
      bookWords.filter((w) => {
        if (bookTopic !== "Tất cả" && w.topic !== bookTopic) return false;
        if (bookLevels.length > 0 && !bookLevels.includes(w.level)) return false;
        if (tierFilter === "beginner" && !["A2", "B1"].includes(w.level)) return false;
        if (tierFilter === "intermediate" && w.level !== "B2") return false;
        if (tierFilter === "advanced" && !["C1", "C2"].includes(w.level)) return false;
        if (bookSearch.trim()) {
          const q = bookSearch.trim().toLowerCase();
          const tierLabel = ["C1", "C2"].includes(w.level)
            ? "advanced"
            : w.level === "B2"
            ? "intermediate"
            : "beginner";
          const haystack = `${w.word} ${w.vi} ${w.en} ${w.topic || ""} ${tierLabel}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      }),
    [bookWords, bookTopic, bookLevels, tierFilter, bookSearch]
  );

  // Nhóm thành các học phần ~65 từ theo Chủ đề & Cấp độ giống Quizlet
  const studyModules = useMemo(() => {
    const CHUNK_SIZE = 65;
    const groups = new Map<string, Word[]>();
    for (const w of bookFiltered) {
      const tierLabel = ["C1", "C2"].includes(w.level)
        ? "Advanced"
        : w.level === "B2"
        ? "Intermediate"
        : "Beginner";
      const key = `${tierLabel} · ${w.topic || "General"}`;
      const list = groups.get(key) ?? [];
      list.push(w);
      groups.set(key, list);
    }

    const modules: {
      id: string;
      title: string;
      tier: string;
      topic: string;
      part: number;
      totalParts: number;
      words: Word[];
    }[] = [];
    for (const [key, wordList] of groups.entries()) {
      const [tier, topic] = key.split(" · ");
      const totalParts = Math.ceil(wordList.length / CHUNK_SIZE);
      for (let i = 0; i < totalParts; i++) {
        const slice = wordList.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const title = totalParts > 1 ? `${topic} – Phần ${i + 1}` : topic;
        modules.push({
          id: `${key}-p${i + 1}`,
          title: `IELTS: ${tier} ${title}`,
          tier,
          topic,
          part: i + 1,
          totalParts,
          words: slice,
        });
      }
    }

    if (moduleSort === "most") {
      modules.sort((a, b) => b.words.length - a.words.length);
    } else if (moduleSort === "least") {
      modules.sort((a, b) => a.words.length - b.words.length);
    } else if (moduleSort === "az") {
      modules.sort((a, b) => a.title.localeCompare(b.title));
    }

    return modules;
  }, [bookFiltered, moduleSort]);

  const toggleLevel = (l: string) =>
    setBookLevels((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  const seed3000 = async () => {
    if (!isAdmin) return;
    setSeedBusy(true); setErr(""); setMsg("");
    try {
      setActivityLabel("/api/books/ielts-3000", "Đang lấy 30 từ chuẩn The Oxford 3000 & bổ sung nghĩa...");
      const r = await fetch("/api/books/ielts-3000", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: oxLevel, count: 30 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg(`Đã nạp thêm ${j.added} từ mới vào sách (tự động loại trùng với kho).`);
      await onReload();
      notifyDueUpdated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSeedBusy(false);
    }
  };

  const seed3000Auto = async (batchCount = 150) => {
    if (!isAdmin) return;
    if (autoSeeding) {
      autoSeedStopRef.current = true;
      return;
    }
    autoSeedStopRef.current = false;
    setAutoSeeding(true);
    setSeedBusy(true);
    setErr("");
    setMsg("");

    let sessionAdded = 0;
    let round = 0;
    try {
      while (!autoSeedStopRef.current) {
        round += 1;
        setActivityLabel(
          "/api/books/ielts-3000",
          `Đợt ${round}: Đang nạp ${batchCount} từ Oxford 3000 & AI bổ sung nghĩa...`
        );
        const r = await fetch("/api/books/ielts-3000", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level: oxLevel, count: batchCount }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Lỗi HTTP ${r.status}`);

        sessionAdded += Number(j.added ?? 0);
        const remaining = Number(j.remaining ?? 0);
        setMsg(
          `Đang nạp tự động Oxford 3000 (đợt ${round}): đã thêm +${sessionAdded} từ · Còn lại ${remaining} từ chưa nạp.`
        );

        if (remaining <= 0 || Number(j.added ?? 0) === 0) {
          setMsg(`Hoàn tất! Đã nạp xong toàn bộ sách The Oxford 3000 (+${sessionAdded} từ mới).`);
          break;
        }
      }
      if (autoSeedStopRef.current) {
        setMsg(`Đã tạm dừng nạp tự động Oxford 3000. Phiên này đã thêm +${sessionAdded} từ (bấm lại để nạp tiếp).`);
      }
      await onReload();
      notifyDueUpdated();
    } catch (e) {
      setErr(`Dừng ở đợt ${round} (đã lưu ${sessionAdded} từ trước đó): ${(e as Error).message}`);
      await onReload().catch(() => {});
    } finally {
      setAutoSeeding(false);
      setSeedBusy(false);
    }
  };

  const seed5000 = async (batchCount = 30) => {
    if (!isAdmin) return;
    setSeedBusy(true); setErr(""); setMsg("");
    try {
      setActivityLabel("/api/books/collegiate-5000", `Đang nạp ${batchCount} từ 5000 Collegiate & nhờ AI tra phiên âm, nghĩa Việt...`);
      const r = await fetch("/api/books/collegiate-5000", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: batchCount }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg(
        `Đã nạp thêm ${j.added} từ mới vào sách 5000 Collegiate (Tổng trong sách: ${j.totalInBook ?? "?"} từ, còn lại: ${j.remaining ?? "?"} từ).`
      );
      await onReload();
      notifyDueUpdated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSeedBusy(false);
    }
  };

  const seed5000Auto = async (batchCount = 150) => {
    if (!isAdmin) return;
    if (autoSeeding) {
      autoSeedStopRef.current = true;
      return;
    }
    autoSeedStopRef.current = false;
    setAutoSeeding(true);
    setSeedBusy(true);
    setErr("");
    setMsg("");

    let sessionAdded = 0;
    let round = 0;
    try {
      while (!autoSeedStopRef.current) {
        round += 1;
        setActivityLabel(
          "/api/books/collegiate-5000",
          `Đợt ${round}: Đang nạp ${batchCount} từ & AI phân loại cấp độ/chủ đề...`
        );
        const r = await fetch("/api/books/collegiate-5000", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: batchCount }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Lỗi HTTP ${r.status}`);

        sessionAdded += Number(j.added ?? 0);
        const remaining = Number(j.remaining ?? 0);
        setMsg(
          `Đang nạp tự động (đợt ${round}): đã thêm +${sessionAdded} từ trong phiên này · Còn lại ${remaining} từ chưa nạp.`
        );

        if (remaining <= 0 || Number(j.added ?? 0) === 0) {
          setMsg(`Hoàn tất! Đã nạp xong toàn bộ sách 5000 Collegiate (+${sessionAdded} từ mới).`);
          break;
        }
      }
      if (autoSeedStopRef.current) {
        setMsg(`Đã tạm dừng nạp tự động. Phiên này đã thêm +${sessionAdded} từ (bấm lại để nạp tiếp).`);
      }
      await onReload();
      notifyDueUpdated();
    } catch (e) {
      setErr(`Dừng ở đợt ${round} (đã lưu ${sessionAdded} từ trước đó): ${(e as Error).message}`);
      await onReload().catch(() => {});
    } finally {
      setAutoSeeding(false);
      setSeedBusy(false);
    }
  };

  const agentFind = async () => {
    if (!isAdmin || !agentPrompt.trim()) return;
    setAgentBusy("find"); setErr(""); setMsg(""); setAgentCandidates(null);
    try {
      setActivityLabel("/api/books/agent-find", `Agent đang tìm từ: "${agentPrompt.trim().slice(0, 40)}"...`);
      const r = await fetch("/api/books/agent-find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: agentPrompt }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setAgentCandidates(j.items ?? []);
      setAgentSkipped(j.skippedDup ?? 0);
      setAgentOff(new Set());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAgentBusy("");
    }
  };

  const chosenCandidates = (agentCandidates ?? []).filter((c) => !agentOff.has(c.norm_key));

  const saveCandidates = async () => {
    if (!isAdmin || !activeBook || chosenCandidates.length === 0) return;
    setAgentBusy("save"); setErr("");
    try {
      setActivityLabel("/api/import/commit", `Đang lưu ${chosenCandidates.length} từ vào "${activeBook.title}"...`);
      const r = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: chosenCandidates, source: activeBook.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg(`Đã lưu ${j.added} từ mới vào sách "${activeBook.title}".`);
      setAgentCandidates(null);
      setAgentPrompt("");
      await onReload();
      notifyDueUpdated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAgentBusy("");
    }
  };

  const enrollBookToSrs = async () => {
    if (bookFiltered.length === 0 || srsBusy) return;
    setSrsBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await enrollWordsInSrs(bookFiltered.map((w) => w.id));
      await onReload();
      notifyDueUpdated();
      setMsg(
        res.enrolled > 0
          ? res.deferred > 0
            ? `Đã chuyển ${res.enrolled} từ vào Ôn tập & Kho cá nhân (${res.deferred} từ được dời lịch sang từ ${res.scheduledFromDay ?? "ngày sau"} do hôm nay đã đủ chỉ tiêu).`
            : `Đã chuyển ${res.enrolled} từ mới vào Ôn tập & Kho cá nhân.`
          : "Các từ này đã nằm sẵn trong Ôn tập của bạn."
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSrsBusy(false);
    }
  };

  // Màn hình danh sách các bộ sách
  if (!activeBook) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted">
            {isAdmin ? (
              "Bộ sách từ vựng dùng chung của cộng đồng — chỉ Admin được tạo bộ sách mới và bổ sung từ vựng."
            ) : (
              <>
                Bộ sách từ vựng dùng chung của cộng đồng — bạn có thể xem, tra cứu và xuất từ. Để tạo bộ từ cá nhân, hãy dùng mục{" "}
                <Link href="/vocab" className="font-semibold text-brand-hover hover:underline">
                  Thẻ ghi nhớ
                </Link>
                .
              </>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={() => setCreating((c) => !c)}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
            >
              <Plus size={16} strokeWidth={2} /> Tạo bộ sách mới
            </button>
          )}
        </div>

        {isAdmin && creating && (
          <form onSubmit={createBook} className="space-y-4 rounded-2xl border border-brand-hover bg-card p-5">
            <div className="font-bold">Tạo bộ sách cộng đồng mới</div>
            <div className="grid gap-3 md:grid-cols-3">
              <input
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Tên bộ sách (vd: Collocations Writing Task 2)"
                className="rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-brand-hover md:col-span-2"
              />
              <select
                value={newBand}
                onChange={(e) => setNewBand(e.target.value)}
                className="rounded-xl border border-line px-4 py-2.5 text-sm"
              >
                {["Band 6.5", "Band 7.0+", "Cộng đồng"].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </div>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Mô tả ngắn (không bắt buộc)"
              className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-brand-hover"
            />
            <div className="flex gap-2">
              <button type="submit" className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg">
                Tạo bộ sách
              </button>
              <button type="button" onClick={() => setCreating(false)} className="rounded-full bg-line px-5 py-2 text-sm font-semibold">
                Huỷ
              </button>
            </div>
          </form>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((b) => {
            const count = words.filter((w) => w.source === b.id).length;
            const badgeKey = `book:${b.id}`;
            return (
              <div
                key={b.id}
                onClick={() => {
                  setActiveBookId(b.id);
                  setBookTopic("Tất cả");
                  setBookLevels([]);
                  setBookSearch("");
                  setAgentCandidates(null);
                  setMsg("");
                  setErr("");
                }}
                className="group cursor-pointer rounded-2xl border-2 border-transparent bg-card p-6 text-left transition hover:border-brand-hover"
              >
                <div className="flex items-center justify-between">
                  <CardBadge custom={badges[badgeKey]} FallbackIcon={BookMarked} size={30} />
                  <div className="flex items-center gap-1.5">
                    {isAdmin && (
                      <EditBadgeButton
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingBadge({ key: badgeKey, title: b.title });
                        }}
                      />
                    )}
                    {isAdmin && b.id !== DEFAULT_BOOK.id && (
                      <button
                        type="button"
                        title="Gỡ bộ sách này khỏi danh sách cộng đồng"
                        onClick={(e) => void detachBook(b, e)}
                        className="rounded-full p-1 text-muted opacity-0 transition hover:bg-rose-500/20 hover:text-rose-600 group-hover:opacity-100 dark:hover:text-rose-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-bold text-sky-700 dark:bg-sky-400/20 dark:text-sky-300">{b.band}</span>
                  </div>
                </div>
                <div className="mt-4 text-lg font-bold">{b.title}</div>
                <div className="mt-1 line-clamp-2 text-sm text-muted">{b.desc}</div>
                <div className="mt-4 flex items-center gap-3">
                  {b.target ? (
                    <>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
                        <div className="h-full bg-brand-hover" style={{ width: `${Math.min(100, (count / b.target) * 100)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-brand-hover">{count} / {b.target}</span>
                    </>
                  ) : (
                    <span className="text-xs font-bold text-brand-hover">{count} từ</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {isAdmin && editingBadge && (
          <BadgePickerModal
            title={editingBadge.title}
            current={badges[editingBadge.key]}
            onSelect={(val) => saveBadge(editingBadge.key, val)}
            onClose={() => setEditingBadge(null)}
          />
        )}
      </div>
    );
  }

  const hasActiveFilters =
    bookTopic !== "Tất cả" ||
    bookLevels.length > 0 ||
    bookSearch.trim() !== "" ||
    tierFilter !== "all" ||
    moduleSort !== "default";

  const resetFilters = () => {
    setBookTopic("Tất cả");
    setBookLevels([]);
    setBookSearch("");
    setTierFilter("all");
    setModuleSort("default");
  };

  // Bộ lọc hiển thị trực tiếp phía trên danh sách học phần / từ vựng
  const filterControls = bookWords.length > 0 && (
    <div className="space-y-3 rounded-2xl border border-line bg-card/70 p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={bookSearch}
            onChange={(e) => setBookSearch(e.target.value)}
            placeholder="Tìm học phần, chủ đề hoặc từ vựng..."
            className="w-full rounded-full border border-line bg-bg py-2 pl-10 pr-4 text-sm outline-none focus:border-brand-hover"
          />
        </div>
        <select
          value={bookTopic}
          onChange={(e) => setBookTopic(e.target.value)}
          className="rounded-full border border-line bg-bg px-4 py-2 text-sm"
        >
          <option value="Tất cả">Chủ đề: Tất cả ({bookWords.length})</option>
          {bookTopics.map((t) => (
            <option key={t} value={t}>{t} ({bookWords.filter((w) => w.topic === t).length})</option>
          ))}
        </select>
        {viewMode === "modules" && (
          <select
            value={moduleSort}
            onChange={(e) => setModuleSort(e.target.value as typeof moduleSort)}
            className="rounded-full border border-line bg-bg px-4 py-2 text-sm"
          >
            <option value="default">Sắp xếp: Mặc định</option>
            <option value="most">Nhiều thẻ nhất</option>
            <option value="least">Ít thẻ nhất</option>
            <option value="az">Tên A → Z</option>
          </select>
        )}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-full border border-line bg-bg px-3.5 py-2 text-xs font-semibold text-muted transition hover:border-brand-hover hover:text-ink"
          >
            Xoá bộ lọc
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted">CEFR:</span>
        <button
          type="button"
          onClick={() => setBookLevels([])}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${bookLevels.length === 0 ? "bg-brand text-white" : "bg-bg text-muted hover:text-ink"}`}
        >
          Tất cả
        </button>
        {bookPresentLevels.map((l) => (
          <button
            type="button"
            key={l}
            onClick={() => toggleLevel(l)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${bookLevels.includes(l) ? "bg-brand text-white" : "bg-bg text-muted hover:text-ink"}`}
          >
            {l} ({bookWords.filter((w) => w.level === l).length})
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <button onClick={() => setActiveBookId(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft size={16} strokeWidth={1.75} /> Quay lại Bộ sách
      </button>

      <div className="rounded-3xl border border-line bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/20 text-brand-hover sm:h-14 sm:w-14">
              <BookMarked size={24} strokeWidth={1.5} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold sm:text-xl">{activeBook.title}</h2>
                <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-bold text-sky-700 dark:bg-sky-400/20 dark:text-sky-300">{activeBook.band}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted sm:text-sm">{activeBook.desc}</p>
              <div className="mt-1.5 text-xs font-bold text-brand-hover">
                {activeBook.target ? `${bookWords.length} / ${activeBook.target} từ` : `${bookWords.length} từ trong sách`}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {bookFiltered.length > 0 && (
              <button
                type="button"
                onClick={enrollBookToSrs}
                disabled={srsBusy}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3.5 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/25 disabled:opacity-50 dark:bg-emerald-400/15 dark:text-emerald-300"
              >
                {srsBusy ? <Loader2 size={14} className="animate-spin" /> : <Repeat size={14} />}
                {srsBusy ? "Đang chuyển..." : `Chuyển ${bookFiltered.length} từ vào ôn tập`}
              </button>
            )}
            {!isAdmin && bookFiltered.length > 0 && (
              <ExportButton words={bookFiltered} filename={activeBook.id} label={`Xuất ${bookFiltered.length} từ`} />
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setToolsOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:border-brand hover:text-ink"
              >
                {toolsOpen ? "Thu gọn công cụ nạp từ" : "Mở công cụ nạp từ"}
                {toolsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            )}
          </div>
        </div>

        {toolsOpen && (
          <div className="mt-5 space-y-5 border-t border-line pt-5">
            {isAdmin && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  {activeBook.id === "book-3000" && (
                    <>
                      <select
                        value={oxLevel}
                        onChange={(e) => setOxLevel(e.target.value)}
                        className="rounded-full border border-line px-4 py-2 text-sm"
                      >
                        <option value="Tất cả">Nạp Oxford: Ưu tiên B1–B2</option>
                        <option value="B1">Nạp từ mức B1</option>
                        <option value="B2">Nạp từ mức B2</option>
                        <option value="A2">Nạp từ mức A2</option>
                      </select>
                      <button
                        onClick={() => void seed3000Auto(150)}
                        disabled={seedBusy && !autoSeeding}
                        title="Tự động chạy liên tục từng lô 150 từ cho đến khi hết toàn bộ Oxford 3000"
                        className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-white transition disabled:opacity-40 ${
                          autoSeeding
                            ? "bg-rose-500 hover:bg-rose-400"
                            : "bg-brand hover:bg-brand-hover hover:text-bg"
                        }`}
                      >
                        {autoSeeding ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        {autoSeeding ? "Dừng nạp tự động" : "Nạp tự động toàn bộ (150 từ/lượt)"}
                      </button>
                      <button
                        onClick={seed3000}
                        disabled={seedBusy}
                        className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-4 py-2 text-sm font-semibold text-ink hover:border-brand-hover disabled:opacity-40"
                      >
                        {seedBusy && !autoSeeding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                        Nạp 30 từ
                      </button>
                    </>
                  )}
                  {activeBook.id === "book-5000" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => void seed5000Auto(150)}
                        disabled={seedBusy && !autoSeeding}
                        title="Tự động chạy liên tục từng lô 150 từ cho đến khi hết 5000 từ (có thể tạm dừng bất cứ lúc nào)"
                        className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-white transition disabled:opacity-40 ${
                          autoSeeding
                            ? "bg-rose-500 hover:bg-rose-400"
                            : "bg-brand hover:bg-brand-hover hover:text-bg"
                        }`}
                      >
                        {autoSeeding ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        {autoSeeding ? "Dừng nạp tự động" : "Nạp tự động toàn bộ (150 từ/lượt)"}
                      </button>
                      <button
                        onClick={() => void seed5000(150)}
                        disabled={seedBusy}
                        title="Nạp thử 1 lô 150 từ"
                        className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-4 py-2 text-sm font-semibold text-ink hover:border-brand-hover disabled:opacity-40"
                      >
                        {seedBusy && !autoSeeding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                        Nạp 150 từ
                      </button>
                    </div>
                  )}
                  {bookFiltered.length > 0 && (
                    <ExportButton words={bookFiltered} filename={activeBook.id} label={`Xuất ${bookFiltered.length} từ`} />
                  )}
                </div>

                {/* Agent tìm từ theo yêu cầu (chỉ Admin) */}
                <div className="rounded-2xl border border-line bg-bg/50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <Sparkles size={16} className="text-brand-hover" /> Nhờ Agent tìm từ bổ sung vào sách này
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={agentPrompt}
                      onChange={(e) => setAgentPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && agentFind()}
                      placeholder="Ví dụ: Tìm 15 từ C1 chủ đề Artificial Intelligence hoặc collocations Writing Task 2..."
                      className="min-w-0 w-full rounded-full border border-line px-4 py-2 text-sm outline-none focus:border-brand-hover sm:min-w-[240px] sm:flex-1"
                    />
                    <button
                      onClick={agentFind}
                      disabled={!agentPrompt.trim() || agentBusy !== ""}
                      className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-40"
                    >
                      {agentBusy === "find" ? <Loader2 size={15} className="animate-spin" /> : <Bot size={15} />}
                      {agentBusy === "find" ? "Agent đang tìm..." : "Cho Agent tìm"}
                    </button>
                  </div>

                  {agentCandidates && (
                    <div className="mt-4 space-y-3 border-t border-line pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>
                          Agent tìm thấy <b className="text-emerald-700 dark:text-emerald-300">{agentCandidates.length} từ mới</b>
                          {agentSkipped > 0 ? ` (đã tự loại ${agentSkipped} từ trùng với kho)` : ""} · Đang chọn {chosenCandidates.length}
                        </span>
                        <button
                          onClick={() => setAgentOff(agentOff.size ? new Set() : new Set(agentCandidates.map((c) => c.norm_key)))}
                          className="text-xs font-semibold text-muted hover:text-ink"
                        >
                          {agentOff.size ? "Chọn tất cả" : "Bỏ chọn tất cả"}
                        </button>
                      </div>
                      {agentCandidates.length > 0 && (
                        <>
                          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                            {agentCandidates.map((c) => {
                              const on = !agentOff.has(c.norm_key);
                              return (
                                <label key={c.norm_key} className={`flex cursor-pointer items-start gap-3 rounded-xl bg-card p-3 ${on ? "" : "opacity-40"}`}>
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() => {
                                      const s = new Set(agentOff);
                                      if (on) s.add(c.norm_key);
                                      else s.delete(c.norm_key);
                                      setAgentOff(s);
                                    }}
                                    className="mt-1 h-4 w-4 accent-[#4255ff]"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <b>{c.lemma}</b>
                                      <span className="text-xs text-muted">{c.ipa} · {c.pos}</span>
                                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${levelColor[c.cefr_level ?? "B2"]}`}>{c.cefr_level}</span>
                                      <span className="rounded-full bg-line px-2 py-0.5 text-[11px]">{c.topic}</span>
                                    </div>
                                    <div className="text-sm text-brand-hover">{c.meaning_vi}</div>
                                    <div className="truncate text-xs text-muted">{c.definition_en}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                          <button
                            onClick={saveCandidates}
                            disabled={chosenCandidates.length === 0 || agentBusy !== ""}
                            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40"
                          >
                            {agentBusy === "save" && <Loader2 size={15} className="animate-spin" />}
                            Lưu {chosenCandidates.length} từ vào sách này
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

          </div>
        )}

        {err && <div className="mt-4 rounded-xl bg-rose-500/15 p-3 text-sm text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">{err}</div>}
        {msg && <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/15 p-3 text-sm text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"><Check size={16} /> {msg}</div>}
      </div>

      {bookWords.length === 0 ? (
        <div className="space-y-4 rounded-2xl bg-card/60 p-8 text-center text-muted sm:p-10">
          {isAdmin ? (
            <>
              <div>
                Bộ sách này chưa có từ nào.{" "}
                {activeBook.id === "book-5000"
                  ? "Bấm nút bên dưới để tự động nạp và phân loại toàn bộ 5000 từ!"
                  : "Hãy mở công cụ ở trên hoặc bấm nút bên dưới để nạp từ."}
              </div>
              {activeBook.id === "book-5000" && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    onClick={() => void seed5000Auto(150)}
                    disabled={seedBusy && !autoSeeding}
                    className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-40 ${
                      autoSeeding ? "bg-rose-500 hover:bg-rose-400" : "bg-brand hover:bg-brand-hover hover:text-bg"
                    }`}
                  >
                    {autoSeeding ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {autoSeeding ? "Dừng nạp tự động" : "Nạp tự động toàn bộ (150 từ/lượt)"}
                  </button>
                  <button
                    onClick={() => void seed5000(150)}
                    disabled={seedBusy}
                    className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-4 py-2.5 text-sm font-semibold text-ink hover:border-brand-hover disabled:opacity-40"
                  >
                    {seedBusy && !autoSeeding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    Nạp 150 từ
                  </button>
                </div>
              )}
              {activeBook.id === "book-3000" && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    onClick={() => void seed3000Auto(150)}
                    disabled={seedBusy && !autoSeeding}
                    className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-40 ${
                      autoSeeding ? "bg-rose-500 hover:bg-rose-400" : "bg-brand hover:bg-brand-hover hover:text-bg"
                    }`}
                  >
                    {autoSeeding ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {autoSeeding ? "Dừng nạp tự động" : "Nạp tự động toàn bộ (150 từ/lượt)"}
                  </button>
                  <button
                    onClick={seed3000}
                    disabled={seedBusy}
                    className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-4 py-2.5 text-sm font-semibold text-ink hover:border-brand-hover disabled:opacity-40"
                  >
                    {seedBusy && !autoSeeding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    Nạp 30 từ
                  </button>
                </div>
              )}
            </>
          ) : (
            "Bộ sách này hiện chưa có từ vựng nào."
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Thanh phân loại cấp độ, bộ lọc & chế độ xem kiểu Quizlet */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: "all", label: "Tất cả" },
                  { key: "beginner", label: "Beginner Vocabulary (A2–B1)" },
                  { key: "intermediate", label: "Intermediate (B2)" },
                  { key: "advanced", label: "Advanced (C1–C2)" },
                ].map((t) => {
                  const on = tierFilter === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTierFilter(t.key as typeof tierFilter)}
                      className={`rounded-full px-4 py-2 text-xs font-bold transition sm:text-sm ${
                        on
                          ? "bg-brand text-white shadow-md shadow-brand/20"
                          : "border border-line bg-card text-muted hover:border-brand-hover hover:text-ink"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 rounded-full border border-line bg-card p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("modules")}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${
                    viewMode === "modules" ? "bg-brand text-white" : "text-muted hover:text-ink"
                  }`}
                >
                  <Layers size={13} /> Học phần
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("all")}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${
                    viewMode === "all" ? "bg-brand text-white" : "text-muted hover:text-ink"
                  }`}
                >
                  <LayoutGrid size={13} /> Danh sách từ ({bookFiltered.length})
                </button>
              </div>
            </div>

            {filterControls}
          </div>

          {/* Chế độ 1: Danh sách học phần chia nhỏ ~65 từ theo Chủ đề kiểu Quizlet */}
          {viewMode === "modules" ? (
            <div className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-muted">
                Gợi ý cho bạn · {studyModules.length} học phần theo chủ đề
              </div>
              {studyModules.length === 0 ? (
                <div className="space-y-3 rounded-2xl border border-line bg-card/60 p-8 text-center text-sm text-muted">
                  <div>Không tìm thấy học phần nào khớp với bộ lọc hiện tại.</div>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg"
                    >
                      Xoá bộ lọc
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {studyModules.map((m) => (
                    <Link
                      key={m.id}
                      href={`/vocab?source=${encodeURIComponent(activeBook.id)}&tier=${encodeURIComponent(m.tier)}&topic=${encodeURIComponent(m.topic)}&part=${m.part}`}
                      className="group flex cursor-pointer touch-manipulation flex-col justify-between rounded-2xl border border-line bg-card p-5 transition hover:border-brand-hover hover:bg-card-hover hover:shadow-lg hover:shadow-slate-900/5 active:scale-[0.99] dark:hover:shadow-black/20"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand-hover">
                            <Layers size={18} />
                          </div>
                          <span className="rounded-full bg-line px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                            {m.tier}
                          </span>
                        </div>
                        <div className="mt-3 font-bold text-ink group-hover:text-brand-hover">
                          {m.title}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {m.words.length} thẻ · Tác giả: IELTS Personal
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-hover group-hover:underline">
                          Học Flashcards →
                        </span>
                        <span className="text-[11px] text-muted">{m.words[0]?.level}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="text-sm text-muted">
                Hiển thị {bookFiltered.length} / {bookWords.length} từ trong sách
              </div>
              <WordGrid list={bookFiltered} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
