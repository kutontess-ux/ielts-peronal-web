"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BookMarked, BookmarkCheck, BookOpenCheck, Check, ChevronDown, ChevronUp, Edit3,
  FolderPlus, HelpCircle, Highlighter, Languages, Loader2, Plus, RefreshCw, Sparkles,
  SplitSquareVertical, Trash2, Volume2, X, Zap,
} from "lucide-react";
import { cleanTerm, normKey, possibleLemmas } from "@/lib/normalize";

type Passage = {
  id: number;
  title: string;
  source_name: string | null;
  topic: string | null;
  content: string;
  score_correct: number | null;
  score_total: number | null;
  studied_at: string;
};

type ReadingNote = {
  id: number;
  passage_id: number;
  kind: "vocab" | "sentence" | "question";
  target_text: string;
  result_json: Record<string, unknown>;
  created_at: string;
};

type PassageTranslation = {
  paragraphs: string[];
  sentences: { en: string; vi: string }[];
  translated_at?: string;
};

type VocabLookup = {
  lemma: string;
  surface?: string;
  norm_key: string;
  ipa: string;
  pos: string;
  meaning_vi: string;
  meaning_in_context: string;
  definition_en: string;
  example: string;
  example_vi?: string;
  cefr_level: string;
  topic: string;
  is_awl: boolean;
  collocations: string[];
  synonyms: string[];
  existsInBank: boolean;
  bankSource?: string | null;
  ai_picked?: boolean;
  manual_lookup?: boolean;
};

type SentenceBreakdown = {
  translation_vi: string;
  subject: string;
  main_verb: string;
  clauses: string[];
  grammar_points: string[];
  key_vocab: { word: string; meaning_vi: string }[];
};

type QuestionExplanation = {
  evidence_quote: string;
  explanation_vi: string;
  paraphrases: { question_phrase: string; passage_phrase: string }[];
  tip_vi: string;
  correctAnswer?: string;
  userAnswer?: string;
};

type BookMeta = {
  id: string;
  title: string;
  desc: string;
  band: string;
  target?: number;
};

const BOOKS_STORAGE_KEY = "ielts_custom_books_v1";
const BASE_BOOKS: BookMeta[] = [
  { id: "book-reading", title: "Từ vựng Reading (Mặc định)", desc: "Từ vựng nhặt từ các bài đọc IELTS", band: "Band 6.5" },
  { id: "book-3000", title: "The Oxford 3000 (Chuẩn CEFR)", desc: "Danh sách từ vựng cốt lõi", band: "Band 6.5", target: 3000 },
];

function slugifyBook(s: string): string {
  return (
    "book-" +
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) +
    "-" +
    Math.random().toString(36).slice(2, 5)
  );
}

type ToolTab = "none" | "vocab" | "sentence" | "question" | "notes";

function formatDate(d: string) {
  const [y, m, day] = (d || "").split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

function extractSentenceFromParagraph(paragraph: string, target: string): string {
  const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [paragraph];
  const lower = target.toLowerCase();
  const found = sentences.find((s) => s.toLowerCase().includes(lower));
  return (found ?? paragraph).trim();
}

function speakWord(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-GB";
  window.speechSynthesis.speak(u);
}

function ReadingDetailInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const passageId = Number(params.id);
  const autoTranslateParam = searchParams.get("autoTranslate") === "1";

  const [passage, setPassage] = useState<Passage | null>(null);
  const [notes, setNotes] = useState<ReadingNote[]>([]);
  const [passageTranslation, setPassageTranslation] = useState<PassageTranslation | null>(null);
  const [showBilingual, setShowBilingual] = useState(false);
  const [highlightAiVocab, setHighlightAiVocab] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Mặc định giao diện sạch ("none")
  const [activeTool, setActiveTool] = useState<ToolTab>("none");
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [highlightQuote, setHighlightQuote] = useState<string>("");

  // Sửa điểm nhanh
  const [editingScore, setEditingScore] = useState(false);
  const [scInput, setScInput] = useState("");
  const [stInput, setStInput] = useState("");

  // Tra từ
  const [vocabLoading, setVocabLoading] = useState(false);
  const [vocabError, setVocabError] = useState("");
  const [vocabResult, setVocabResult] = useState<VocabLookup | null>(null);
  const [vocabNoteId, setVocabNoteId] = useState<number | null>(null);
  const [vocabCached, setVocabCached] = useState(false);
  const [contextSentenceVi, setContextSentenceVi] = useState("");
  const [contextBoxExpanded, setContextBoxExpanded] = useState(false);
  const [lastLookupTerm, setLastLookupTerm] = useState<{ term: string; sentence: string; paragraphIdx?: number }>({
    term: "",
    sentence: "",
  });
  const [addingWord, setAddingWord] = useState(false);
  const [addedBookTitle, setAddedBookTitle] = useState("");
  const [manualTerm, setManualTerm] = useState("");

  // Dịch toàn bài & Soạn sẵn từ vựng (1 lượt AI)
  const [fullTranslateLoading, setFullTranslateLoading] = useState(false);
  const [batchMsg, setBatchMsg] = useState("");
  const autoTriggeredRef = useRef(false);

  // Admin sửa nghĩa từ hiện tại hoặc thêm từ tay
  const [editingVocabMeaning, setEditingVocabMeaning] = useState(false);
  const [editVocabVi, setEditVocabVi] = useState("");
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [mLemma, setMLemma] = useState("");
  const [mIpa, setMIpa] = useState("");
  const [mMeaning, setMMeaning] = useState("");
  const [mLevel, setMLevel] = useState("B2");

  // Modal chọn / tạo Bộ sách khi thêm vào Kho
  const [showBookModal, setShowBookModal] = useState(false);
  const [pendingVocabToAdd, setPendingVocabToAdd] = useState<VocabLookup | null>(null);
  const [books, setBooks] = useState<BookMeta[]>(BASE_BOOKS);
  const [selectedBookId, setSelectedBookId] = useState("book-reading");
  const [creatingBook, setCreatingBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [newBookBand, setNewBookBand] = useState("Band 6.5");
  const [bookModalError, setBookModalError] = useState("");

  // Đóng/mở danh sách từ đã tra & mở rộng ghi chú
  const [vocabHistoryOpen, setVocabHistoryOpen] = useState(false);
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<number>>(new Set());

  // Phân tích câu
  const [sentenceInput, setSentenceInput] = useState("");
  const [sentenceLoading, setSentenceLoading] = useState(false);
  const [sentenceResult, setSentenceResult] = useState<SentenceBreakdown | null>(null);
  const [sentenceCached, setSentenceCached] = useState(false);
  const [sentenceError, setSentenceError] = useState("");

  // Hỏi câu sai
  const [questionInput, setQuestionInput] = useState("");
  const [correctAnsInput, setCorrectAnsInput] = useState("");
  const [userAnsInput, setUserAnsInput] = useState("");
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionResult, setQuestionResult] = useState<QuestionExplanation | null>(null);
  const [questionCached, setQuestionCached] = useState(false);
  const [questionError, setQuestionError] = useState("");

  // Admin sửa ghi chú trong tab Ghi chú
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  useEffect(() => {
    if (!Number.isFinite(passageId) || passageId <= 0) return;
    let active = true;
    (async () => {
      try {
        const r = await fetch(`/api/reading/${passageId}`, { cache: "no-store" });
        const j = await r.json();
        if (!active) return;
        if (!r.ok) throw new Error(j.error || "Không tải được bài đọc");
        setPassage(j.passage);
        setNotes(j.notes ?? []);
        if (j.passageTranslation) {
          setPassageTranslation(j.passageTranslation as PassageTranslation);
        }
        setScInput(j.passage.score_correct !== null ? String(j.passage.score_correct) : "");
        setStInput(j.passage.score_total !== null ? String(j.passage.score_total) : "13");
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [passageId]);

  function loadBooksFromStorage() {
    try {
      const raw = localStorage.getItem(BOOKS_STORAGE_KEY);
      const custom: BookMeta[] = raw ? JSON.parse(raw) : [];
      const merged = [...BASE_BOOKS];
      for (const b of custom) {
        if (!merged.some((x) => x.id === b.id)) merged.push(b);
      }
      setBooks(merged);
    } catch {
      setBooks(BASE_BOOKS);
    }
  }

  const paragraphs = useMemo(() => {
    if (!passage?.content) return [];
    return passage.content
      .split(/\n+/)
      .map((p) => p.replace(/\blorem(?:\s+ipsum)?\b/gi, "").trim())
      .filter((p) => p.length > 0 && !/^lorem$/i.test(p));
  }, [passage]);

  const vocabNotes = useMemo(() => notes.filter((n) => n.kind === "vocab"), [notes]);
  const aiPickedCount = useMemo(
    () =>
      vocabNotes.filter((n) => {
        const rj = (n.result_json ?? {}) as Record<string, unknown>;
        return rj.manual_lookup !== true;
      }).length,
    [vocabNotes]
  );

  // Tìm bản dịch tiếng Việt của một câu tiếng Anh từ dữ liệu dịch toàn bài đã lưu (0 token)
  const findSentenceTranslationVi = useCallback(
    (sentenceEn: string, paragraphIdx?: number, paragraphEn?: string): string => {
      if (!passageTranslation) return "";
      const cleanSent = sentenceEn.trim().toLowerCase();
      if (cleanSent && Array.isArray(passageTranslation.sentences)) {
        const exactOrSub = passageTranslation.sentences.find((s) => {
          const enLower = (s.en || "").trim().toLowerCase();
          return (
            enLower &&
            (enLower === cleanSent ||
              enLower.includes(cleanSent.slice(0, Math.min(40, cleanSent.length))) ||
              cleanSent.includes(enLower.slice(0, Math.min(40, enLower.length))))
          );
        });
        if (exactOrSub?.vi) return exactOrSub.vi;
      }
      if (
        paragraphIdx !== undefined &&
        Array.isArray(passageTranslation.paragraphs) &&
        passageTranslation.paragraphs[paragraphIdx]
      ) {
        const paraVi = passageTranslation.paragraphs[paragraphIdx];
        if (paragraphEn && sentenceEn) {
          const enSentences = paragraphEn.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
          const viSentences = paraVi.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
          const sIdx = enSentences.findIndex((s) => s.toLowerCase().includes(cleanSent.slice(0, Math.min(30, cleanSent.length))));
          if (sIdx >= 0 && viSentences.length === enSentences.length && viSentences[sIdx]) {
            return viSentences[sIdx];
          }
        }
        return paraVi;
      }
      return "";
    },
    [passageTranslation]
  );

  // Tìm từ vựng trực tiếp trong danh sách từ đã dịch sẵn của bài trên trình duyệt (0ms, 0 request)
  const findLocalVocabNote = useCallback(
    (rawTerm: string): ReadingNote | undefined => {
      const clean = cleanTerm(rawTerm);
      if (!clean) return undefined;
      const candidates = new Set(possibleLemmas(clean));
      candidates.add(normKey(clean));

      return vocabNotes.find((n) => {
        const rj = (n.result_json ?? {}) as Record<string, unknown>;
        const nk = typeof rj.norm_key === "string" ? rj.norm_key : normKey(n.target_text);
        const surface = typeof rj.surface === "string" ? cleanTerm(rj.surface) : "";
        const surfaceKey = surface ? normKey(surface) : "";
        return (
          candidates.has(nk) ||
          cleanTerm(n.target_text) === clean ||
          surface === clean ||
          (surfaceKey !== "" && candidates.has(surfaceKey))
        );
      });
    },
    [vocabNotes]
  );

  // Kiểm tra từ có nằm trong danh sách từ phổ biến/hay dùng do AI chọn ra hay không
  const isAiPickedWord = useCallback(
    (rawTerm: string): boolean => {
      const matched = findLocalVocabNote(rawTerm);
      if (!matched) return false;
      const rj = (matched.result_json ?? {}) as Record<string, unknown>;
      return rj.manual_lookup !== true;
    },
    [findLocalVocabNote]
  );

  const handleFullTranslate = useCallback(
    async (forceAi = false) => {
      if (!passage || fullTranslateLoading) return;
      setFullTranslateLoading(true);
      setBatchMsg("");
      setVocabError("");
      try {
        const r = await fetch("/api/reading/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "full_translate",
            passageId: passage.id,
            passageContent: passage.content,
            forceAi,
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Không dịch được toàn bài");
        if (j.passageTranslation) {
          setPassageTranslation(j.passageTranslation as PassageTranslation);
          setShowBilingual(true);
        }
        const added: ReadingNote[] = j.addedNotes ?? [];
        if (added.length > 0) {
          setNotes((prev) => [...added, ...prev]);
        }
        const count = (j.items ?? []).length;
        setBatchMsg(
          j.cached
            ? "Đã tải bản dịch toàn bài từ bộ nhớ (0 token)!"
            : `Đã dịch toàn bài (${(j.passageTranslation?.paragraphs ?? []).length} đoạn) & soạn sẵn ${count} từ vựng trong 1 request duy nhất! Từ giờ bấm tra từ tốn 0 request.`
        );
      } catch (e) {
        setVocabError((e as Error).message);
      } finally {
        setFullTranslateLoading(false);
      }
    },
    [passage, fullTranslateLoading]
  );

  // Tự động dịch toàn bài 1 lần ngay khi vừa tạo bài đọc mới (?autoTranslate=1)
  useEffect(() => {
    if (
      !loading &&
      passage &&
      autoTranslateParam &&
      !passageTranslation &&
      !autoTriggeredRef.current
    ) {
      autoTriggeredRef.current = true;
      router.replace(`/reading/${passage.id}`, { scroll: false });
      void handleFullTranslate(false);
    }
  }, [loading, passage, autoTranslateParam, passageTranslation, handleFullTranslate, router]);

  async function saveScore() {
    if (!passage) return;
    const sc = scInput.trim() === "" ? null : Number(scInput);
    const st = stInput.trim() === "" ? null : Number(scoreTotalOrDefault(stInput));
    const r = await fetch("/api/reading", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: passage.id,
        score_correct: Number.isFinite(sc) ? sc : null,
        score_total: Number.isFinite(st) ? st : null,
      }),
    });
    if (r.ok) {
      setPassage({
        ...passage,
        score_correct: Number.isFinite(sc) ? sc : null,
        score_total: Number.isFinite(st) ? st : null,
      });
      setEditingScore(false);
    }
  }

  function scoreTotalOrDefault(val: string) {
    return val;
  }

  async function lookupTerm(term: string, sentence: string, forceAi = false, paragraphIdx?: number) {
    const clean = term.trim();
    if (!clean || !passage) return;
    setActiveTool("vocab");
    setMobileSheetOpen(true);
    setVocabError("");
    setAddedBookTitle("");
    setEditingVocabMeaning(false);
    setLastLookupTerm({ term: clean, sentence, paragraphIdx });

    const preTranslatedVi = findSentenceTranslationVi(sentence, paragraphIdx);
    setContextSentenceVi(preTranslatedVi);

    // Tầng 0 (Client-side 0ms, 0 request): Nếu từ đã có trong danh sách từ đã dịch sẵn của bài thì hiện ngay lập tức!
    if (!forceAi) {
      const localMatch = findLocalVocabNote(clean);
      if (localMatch) {
        const rj = localMatch.result_json as Partial<VocabLookup>;
        setVocabResult({
          lemma: rj.lemma ?? localMatch.target_text,
          surface: rj.surface ?? clean,
          norm_key: rj.norm_key ?? normKey(localMatch.target_text),
          ipa: rj.ipa ?? "",
          pos: rj.pos ?? "",
          meaning_vi: rj.meaning_vi ?? "",
          meaning_in_context: rj.meaning_in_context ?? rj.meaning_vi ?? "",
          definition_en: rj.definition_en ?? "",
          example: rj.example || sentence,
          example_vi: rj.example_vi || preTranslatedVi,
          cefr_level: rj.cefr_level ?? "B2",
          topic: rj.topic ?? "Other",
          is_awl: !!rj.is_awl,
          collocations: rj.collocations ?? [],
          synonyms: rj.synonyms ?? [],
          existsInBank: !!rj.existsInBank,
          bankSource: rj.bankSource ?? null,
        });
        setVocabNoteId(localMatch.id);
        setVocabCached(true);
        setVocabLoading(false);
        return;
      }
    }

    setVocabLoading(true);
    setVocabResult(null);
    setVocabNoteId(null);
    setVocabCached(false);

    try {
      const r = await fetch("/api/reading/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "vocab",
          passageId: passage.id,
          term: clean,
          sentence,
          forceAi,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Không tra được từ này");
      setVocabResult({
        ...j.vocab,
        example_vi: j.vocab?.example_vi || preTranslatedVi,
      });
      setVocabCached(!!j.cached);
      if (j.note) {
        setVocabNoteId(j.note.id);
        setNotes((prev) => (prev.some((n) => n.id === j.note.id) ? prev : [j.note, ...prev]));
      }
    } catch (e) {
      setVocabError((e as Error).message);
    } finally {
      setVocabLoading(false);
    }
  }

  async function saveManualVocab(e: React.FormEvent) {
    e.preventDefault();
    if (!passage || !mLemma.trim() || !mMeaning.trim()) return;
    const payload: VocabLookup = {
      lemma: mLemma.trim().toLowerCase(),
      norm_key: mLemma.trim().toLowerCase(),
      ipa: mIpa.trim(),
      pos: "",
      meaning_vi: mMeaning.trim(),
      meaning_in_context: mMeaning.trim(),
      definition_en: "",
      example: "",
      cefr_level: mLevel,
      topic: passage.topic ?? "Other",
      is_awl: false,
      collocations: [],
      synonyms: [],
      existsInBank: false,
    };

    const r = await fetch("/api/reading/analyze", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passageId: passage.id,
        kind: "vocab",
        targetText: payload.lemma,
        resultJson: payload,
      }),
    });
    const j = await r.json();
    if (r.ok && j.note) {
      setNotes((prev) => [j.note, ...prev]);
      setVocabResult(payload);
      setVocabNoteId(j.note.id);
      setVocabCached(true);
      setShowManualAdd(false);
      setMLemma("");
      setMIpa("");
      setMMeaning("");
    }
  }

  async function saveEditedVocabMeaning() {
    if (!vocabResult || !editVocabVi.trim()) return;
    const updated = { ...vocabResult, meaning_in_context: editVocabVi.trim(), meaning_vi: editVocabVi.trim() };
    setVocabResult(updated);
    setEditingVocabMeaning(false);

    if (vocabNoteId) {
      const r = await fetch("/api/reading/analyze", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: vocabNoteId, resultJson: updated }),
      });
      if (r.ok) {
        setNotes((prev) =>
          prev.map((n) => (n.id === vocabNoteId ? { ...n, result_json: updated } : n))
        );
      }
    }
  }

  function openBookPicker(target?: VocabLookup) {
    const item = target ?? vocabResult;
    if (!item) return;
    loadBooksFromStorage();
    setPendingVocabToAdd(item);
    setCreatingBook(false);
    setNewBookTitle("");
    setBookModalError("");
    setShowBookModal(true);
  }

  async function confirmAddToBook() {
    const target = pendingVocabToAdd ?? vocabResult;
    if (!target || addingWord) return;
    setAddingWord(true);
    setBookModalError("");
    try {
      let targetBookId = selectedBookId;
      let targetBookTitle = books.find((b) => b.id === selectedBookId)?.title ?? "Từ vựng Reading";

      if (creatingBook && newBookTitle.trim()) {
        const newBook: BookMeta = {
          id: slugifyBook(newBookTitle.trim()),
          title: newBookTitle.trim(),
          desc: `Tạo từ bài đọc: ${passage?.title ?? ""}`,
          band: newBookBand,
        };
        const raw = localStorage.getItem(BOOKS_STORAGE_KEY);
        const custom: BookMeta[] = raw ? JSON.parse(raw) : [];
        localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify([...custom, newBook]));
        setBooks((prev) => [...prev, newBook]);
        targetBookId = newBook.id;
        targetBookTitle = newBook.title;
      }

      const validLevels = new Set(["A2", "B1", "B2", "C1", "C2"]);
      const cefr = validLevels.has(String(target.cefr_level).toUpperCase())
        ? String(target.cefr_level).toUpperCase()
        : "B2";

      const r = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: targetBookId,
          items: [
            {
              lemma: target.lemma,
              norm_key: target.norm_key || target.lemma.toLowerCase().trim(),
              ipa: target.ipa || "",
              pos: target.pos || "",
              meaning_vi: target.meaning_in_context || target.meaning_vi || "",
              definition_en: target.definition_en || "",
              example: target.example || "",
              cefr_level: cefr,
              topic: target.topic || "Other",
              is_awl: !!target.is_awl,
              collocations: target.collocations ?? [],
              synonyms: target.synonyms ?? [],
            },
          ],
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Không lưu được vào Kho");

      if (vocabResult && vocabResult.norm_key === target.norm_key) {
        setVocabResult({ ...vocabResult, existsInBank: true, bankSource: targetBookId });
      }
      setNotes((prev) =>
        prev.map((n) => {
          if (n.kind !== "vocab") return n;
          const rj = n.result_json as Record<string, unknown>;
          if (rj.norm_key === target.norm_key || n.target_text === target.lemma) {
            return { ...n, result_json: { ...rj, existsInBank: true, bankSource: targetBookId } };
          }
          return n;
        })
      );
      setAddedBookTitle(targetBookTitle);
      setShowBookModal(false);
    } catch (e) {
      setBookModalError((e as Error).message);
    } finally {
      setAddingWord(false);
    }
  }

  function handleParagraphMouseUp(paragraph: string, paragraphIdx?: number) {
    const sel = window.getSelection()?.toString().trim() ?? "";
    if (sel) {
      if (activeTool === "sentence" && sel.split(/\s+/).length > 4) {
        setSentenceInput(sel);
        return;
      }
      if (activeTool === "vocab" && sel.split(/\s+/).length <= 5) {
        const sentence = extractSentenceFromParagraph(paragraph, sel);
        lookupTerm(sel, sentence, false, paragraphIdx);
      }
    }
  }

  function handleWordClick(
    word: string,
    paragraph: string,
    paragraphIdx?: number,
    forceVocabTool = false
  ) {
    if (activeTool !== "vocab" && !forceVocabTool) return;
    const sel = window.getSelection()?.toString().trim() ?? "";
    if (sel && sel.split(/\s+/).length > 1) return;

    const clean = word.replace(/^[^a-zA-Z]+|[^a-zA-Z'-]+$/g, "");
    if (!clean) return;
    if (activeTool !== "vocab" && forceVocabTool) {
      setActiveTool("vocab");
    }
    const sentence = extractSentenceFromParagraph(paragraph, clean);
    void lookupTerm(clean, sentence, false, paragraphIdx);
  }

  async function analyzeSentence(e?: React.FormEvent, forceAi = false) {
    e?.preventDefault();
    if (!sentenceInput.trim() || !passage) return;
    setSentenceLoading(true);
    setSentenceError("");
    setSentenceCached(false);
    try {
      const r = await fetch("/api/reading/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "sentence",
          passageId: passage.id,
          sentence: sentenceInput.trim(),
          forceAi,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Không phân tích được câu");
      setSentenceResult(j.sentence);
      setSentenceCached(!!j.cached);
      if (j.note) {
        setNotes((prev) => (prev.some((n) => n.id === j.note.id) ? prev : [j.note, ...prev]));
      }
    } catch (err) {
      setSentenceError((err as Error).message);
    } finally {
      setSentenceLoading(false);
    }
  }

  async function explainQuestion(e?: React.FormEvent, forceAi = false) {
    e?.preventDefault();
    if (!questionInput.trim() || !passage) return;
    setQuestionLoading(true);
    setQuestionError("");
    setQuestionCached(false);
    try {
      const r = await fetch("/api/reading/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "question",
          passageId: passage.id,
          question: questionInput.trim(),
          correctAnswer: correctAnsInput.trim(),
          userAnswer: userAnsInput.trim(),
          passageContent: passage.content,
          forceAi,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Không phân tích được câu hỏi");
      setQuestionResult(j.question);
      setQuestionCached(!!j.cached);
      if (j.question?.evidence_quote) {
        setHighlightQuote(j.question.evidence_quote);
      }
      if (j.note) {
        setNotes((prev) => (prev.some((n) => n.id === j.note.id) ? prev : [j.note, ...prev]));
      }
    } catch (err) {
      setQuestionError((err as Error).message);
    } finally {
      setQuestionLoading(false);
    }
  }

  async function saveNoteEdit(note: ReadingNote) {
    if (!editingNoteText.trim()) return;
    const res = { ...note.result_json };
    if (note.kind === "vocab") {
      res.meaning_in_context = editingNoteText.trim();
      res.meaning_vi = editingNoteText.trim();
    } else if (note.kind === "sentence") {
      res.translation_vi = editingNoteText.trim();
    } else {
      res.explanation_vi = editingNoteText.trim();
    }
    const r = await fetch("/api/reading/analyze", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: note.id, resultJson: res }),
    });
    if (r.ok) {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, result_json: res } : n)));
      setEditingNoteId(null);
    }
  }

  async function deleteNote(noteId: number) {
    const r = await fetch(`/api/reading/analyze?noteId=${noteId}`, { method: "DELETE" });
    if (r.ok) setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }

  function renderParagraph(p: string, idx: number) {
    const quote = highlightQuote.trim();
    const hasQuote = quote.length > 12 && p.toLowerCase().includes(quote.toLowerCase());
    const translatedParagraph = passageTranslation?.paragraphs?.[idx] ?? "";

    // Làm nổi bật tiêu đề chính / tiêu đề phụ đầu bài đọc nếu người dùng dán cả tiêu đề vào nội dung
    const isTitleLine =
      idx === 0 &&
      p.length <= 90 &&
      !/[.!?]$/.test(p) &&
      (p.toLowerCase() === passage?.title.trim().toLowerCase() || p.split(/\s+/).length <= 10);
    const isSubtitleLine =
      idx === 1 &&
      p.length <= 140 &&
      !/[.]$/.test(p) &&
      !/^[A-Z]\.\s/.test(p) &&
      p.split(/\s+/).length <= 22;

    const textStyleClass = isTitleLine
      ? "text-2xl sm:text-3xl font-extrabold tracking-tight text-ink leading-snug"
      : isSubtitleLine
      ? "text-base sm:text-lg font-semibold text-muted leading-relaxed"
      : "text-[15.5px] leading-8 text-ink";

    let englishNode: React.ReactNode;

    if (activeTool === "vocab" || highlightAiVocab) {
      const tokens = p.split(/(\s+)/);
      englishNode = (
        <p onMouseUp={() => handleParagraphMouseUp(p, idx)} className={textStyleClass}>
          {tokens.map((tok, i) => {
            if (/^\s+$/.test(tok)) return tok;
            const aiHighlighted = highlightAiVocab && isAiPickedWord(tok);
            return (
              <span
                key={i}
                onClick={() => handleWordClick(tok, p, idx, aiHighlighted)}
                className={`rounded px-0.5 transition ${
                  activeTool === "vocab" || aiHighlighted
                    ? "cursor-pointer hover:bg-brand/25 hover:text-ink"
                    : ""
                } ${
                  aiHighlighted
                    ? "bg-amber-400/25 font-medium text-amber-950 ring-1 ring-amber-500/40 dark:bg-amber-400/20 dark:text-amber-200 dark:ring-amber-400/35"
                    : ""
                }`}
              >
                {tok}
              </span>
            );
          })}
        </p>
      );
    } else if (hasQuote) {
      const pos = p.toLowerCase().indexOf(quote.toLowerCase());
      const before = p.slice(0, pos);
      const match = p.slice(pos, pos + quote.length);
      const after = p.slice(pos + quote.length);
      englishNode = (
        <p onMouseUp={() => handleParagraphMouseUp(p, idx)} className={textStyleClass}>
          {before}
          <mark className="rounded bg-amber-300/45 px-1 py-0.5 text-amber-950 ring-1 ring-amber-500/50 dark:bg-amber-400/25 dark:text-amber-100 dark:ring-amber-400/50">
            {match}
          </mark>
          {after}
        </p>
      );
    } else {
      englishNode = (
        <p onMouseUp={() => handleParagraphMouseUp(p, idx)} className={textStyleClass}>
          {p}
        </p>
      );
    }

    return (
      <div key={idx} className="space-y-2">
        {englishNode}
        {showBilingual && translatedParagraph && (
          <div className="rounded-xl border-l-2 border-emerald-500/60 bg-emerald-500/5 px-3.5 py-2.5 text-[14px] leading-relaxed text-ink/85 dark:bg-emerald-500/10">
            {translatedParagraph}
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-card p-10 text-center text-sm text-muted">
        Đang mở bài đọc...
      </div>
    );
  }

  if (error || !passage) {
    return (
      <div className="space-y-4">
        <Link href="/reading" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
          <ArrowLeft size={16} /> Quay lại danh sách
        </Link>
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-700 dark:text-red-200">
          {error || "Không tìm thấy bài đọc"}
        </div>
      </div>
    );
  }

  const showPanel = activeTool !== "none";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div className="space-y-2">
          <Link href="/reading" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink">
            <ArrowLeft size={14} /> Lịch sử bài đọc
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl lg:text-4xl">{passage.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {passage.source_name && (
              <span className="rounded-lg bg-card px-2.5 py-1 font-medium text-ink">{passage.source_name}</span>
            )}
            {passage.topic && (
              <span className="rounded-lg bg-brand/15 px-2.5 py-1 font-medium text-brand-hover">{passage.topic}</span>
            )}
            <span>Ngày làm: {formatDate(passage.studied_at)}</span>
            <span>•</span>
            {editingScore ? (
              <span className="inline-flex items-center gap-1.5">
                <input
                  type="number"
                  value={scInput}
                  onChange={(e) => setScInput(e.target.value)}
                  className="w-12 rounded border border-line px-1.5 py-0.5 text-xs"
                />
                /
                <input
                  type="number"
                  value={stInput}
                  onChange={(e) => setStInput(e.target.value)}
                  className="w-12 rounded border border-line px-1.5 py-0.5 text-xs"
                />
                <button onClick={saveScore} className="rounded bg-brand px-2 py-0.5 text-xs font-semibold text-white">
                  Lưu
                </button>
                <button onClick={() => setEditingScore(false)} className="text-xs text-muted hover:text-ink">
                  Huỷ
                </button>
              </span>
            ) : (
              <button
                onClick={() => setEditingScore(true)}
                className="rounded-lg bg-card px-2.5 py-1 font-semibold text-ink hover:bg-card-hover"
                title="Bấm để sửa điểm"
              >
                Điểm:{" "}
                {passage.score_correct !== null && passage.score_total !== null
                  ? `${passage.score_correct}/${passage.score_total}`
                  : "Chưa nhập (bấm sửa)"}
              </button>
            )}
          </div>
        </div>

        {/* Thanh công cụ chế độ */}
        <div className="flex flex-wrap items-center gap-2">
          {passageTranslation ? (
            <button
              onClick={() => setShowBilingual((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                showBilingual
                  ? "bg-emerald-600 text-white"
                  : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
              }`}
              title="Bật/tắt bản dịch tiếng Việt ngay dưới từng đoạn văn (0 token)"
            >
              <BookOpenCheck size={15} /> {showBilingual ? "Đang bật Song ngữ" : "Xem Song ngữ (0 token)"}
            </button>
          ) : (
            <button
              onClick={() => handleFullTranslate(false)}
              disabled={fullTranslateLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300"
              title="Dịch toàn bộ bài đọc và trích xuất sẵn bộ từ vựng chỉ trong 1 request AI"
            >
              {fullTranslateLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {fullTranslateLoading ? "Đang dịch toàn bài..." : "Dịch toàn bài & Soạn từ (1 request)"}
            </button>
          )}

          {aiPickedCount > 0 && (
            <button
              onClick={() => setHighlightAiVocab((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                highlightAiVocab
                  ? "bg-amber-500 text-amber-950"
                  : "border border-amber-500/40 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300"
              }`}
              title="Bật/tắt tô màu những từ vựng IELTS phổ biến, hay dùng được AI chọn trong bài"
            >
              <Highlighter size={15} />{" "}
              {highlightAiVocab ? `Đang tô màu từ AI (${aiPickedCount})` : `Tô màu từ hay dùng (${aiPickedCount})`}
            </button>
          )}

          <button
            onClick={() => {
              if (activeTool === "vocab") {
                setActiveTool("none");
                setMobileSheetOpen(false);
              } else {
                setActiveTool("vocab");
                setMobileSheetOpen(false);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              activeTool === "vocab" ? "bg-brand text-white" : "border border-line bg-card text-muted hover:text-ink"
            }`}
          >
            <Languages size={15} /> Tra từ ({vocabNotes.length})
          </button>

          <button
            onClick={() => {
              const sel = window.getSelection()?.toString().trim() ?? "";
              if (sel && sel.split(/\s+/).length > 4) setSentenceInput(sel);
              if (activeTool === "sentence") {
                setActiveTool("none");
                setMobileSheetOpen(false);
              } else {
                setActiveTool("sentence");
                setMobileSheetOpen(true);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              activeTool === "sentence" ? "bg-brand text-white" : "border border-line bg-card text-muted hover:text-ink"
            }`}
          >
            <SplitSquareVertical size={15} /> Phân tích câu
          </button>

          <button
            onClick={() => {
              if (activeTool === "question") {
                setActiveTool("none");
                setMobileSheetOpen(false);
              } else {
                setActiveTool("question");
                setMobileSheetOpen(true);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              activeTool === "question" ? "bg-brand text-white" : "border border-line bg-card text-muted hover:text-ink"
            }`}
          >
            <HelpCircle size={15} /> Hỏi câu sai
          </button>

          <button
            onClick={() => {
              if (activeTool === "notes") {
                setActiveTool("none");
                setMobileSheetOpen(false);
              } else {
                setActiveTool("notes");
                setMobileSheetOpen(true);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              activeTool === "notes" ? "bg-brand text-white" : "border border-line bg-card text-muted hover:text-ink"
            }`}
          >
            <BookMarked size={15} /> Ghi chú ({notes.length})
          </button>
        </div>
      </div>

      {fullTranslateLoading && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-800 dark:text-emerald-200">
          <Loader2 size={16} className=" shrink-0 animate-spin" />
          <span>
            <b>Đang dịch toàn bộ bài đọc & trích sẵn bộ từ vựng (1 request AI duy nhất)...</b> Sau khi hoàn tất, bạn có thể xem song ngữ và bấm tra từ thoải mái mà không tốn thêm request.
          </span>
        </div>
      )}

      {!fullTranslateLoading && batchMsg && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-800 dark:text-emerald-200">
          <span>⚡ {batchMsg}</span>
          <button onClick={() => setBatchMsg("")} className="text-muted hover:text-ink">
            <X size={14} />
          </button>
        </div>
      )}

      {activeTool === "vocab" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/40 bg-brand/10 px-4 py-2.5 text-xs text-brand-hover">
          <span>
            <b>Chế độ Tra từ đang bật:</b> Chạm vào bất kỳ từ nào trong bài để xem nghĩa + câu dịch ngữ cảnh (hệ thống tự động lấy từ bộ nhớ nếu đã có, 0 token).
          </span>
          <div className="flex items-center gap-3">
            {aiPickedCount > 0 && (
              <button
                onClick={() => setHighlightAiVocab((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition ${
                  highlightAiVocab
                    ? "bg-amber-500 text-amber-950"
                    : "bg-amber-500/20 text-amber-800 hover:bg-amber-500/30 dark:text-amber-200"
                }`}
              >
                <Highlighter size={12} /> {highlightAiVocab ? "Tắt tô màu từ AI" : "Bật tô màu từ hay dùng"}
              </button>
            )}
            <button
              onClick={() => setMobileSheetOpen(true)}
              className="rounded-lg bg-brand/20 px-2.5 py-1 font-semibold text-brand-hover lg:hidden"
            >
              Mở khung tra / Soạn sẵn
            </button>
            <button
              onClick={() => {
                setActiveTool("none");
                setMobileSheetOpen(false);
              }}
              className="text-muted hover:text-ink"
            >
              Tắt
            </button>
          </div>
        </div>
      )}

      {/* Bố cục chính: trên PC chia 2 cột, trên điện thoại hiện popup nổi phía trước */}
      <div className={`grid gap-6 ${showPanel ? "lg:grid-cols-12" : ""}`}>
        <article
          className={`space-y-4 rounded-2xl border border-line bg-card/80 p-5 sm:p-8 dark:bg-card/50 ${
            showPanel ? "lg:col-span-7" : "mx-auto w-full max-w-3xl"
          }`}
        >
          {paragraphs.map((p, idx) => renderParagraph(p, idx))}
        </article>

        {showPanel && (
          <aside
            className={`${
              mobileSheetOpen ? "fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-3 sm:items-center" : "hidden"
            } lg:static lg:inset-auto lg:z-auto lg:col-span-5 lg:block lg:bg-transparent lg:p-0`}
            onClick={(e) => {
              if (e.target === e.currentTarget) setMobileSheetOpen(false);
            }}
          >
            <div className="max-h-[84vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-2xl lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:max-w-none lg:shadow-none">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h2 className="text-sm font-bold text-ink">
                  {activeTool === "vocab" && "Tra từ & Lưu vào Bộ sách"}
                  {activeTool === "sentence" && "Phân tích câu phức"}
                  {activeTool === "question" && "Giải thích câu làm sai"}
                  {activeTool === "notes" && `Ghi chú & Lịch sử (${notes.length})`}
                </h2>
                <button
                  onClick={() => {
                    setMobileSheetOpen(false);
                    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
                      setActiveTool("none");
                    } else if (activeTool !== "vocab") {
                      setActiveTool("none");
                    }
                  }}
                  className="rounded-lg p-1 text-muted hover:bg-bg hover:text-ink"
                >
                  <X size={16} />
                </button>
              </div>

              {/* TAB 1: TRA TỪ */}
              {activeTool === "vocab" && (
                <div className="space-y-4">
                  {/* Thanh tra nhanh + Nút Dịch toàn bài / thêm tay */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      lookupTerm(manualTerm, manualTerm);
                    }}
                    className="flex gap-2"
                  >
                    <input
                      value={manualTerm}
                      onChange={(e) => setManualTerm(e.target.value)}
                      placeholder="Gõ từ/cụm từ hoặc bấm vào bài..."
                      className="flex-1 rounded-xl border border-line px-3 py-2 text-xs outline-none focus:border-brand"
                    />
                    <button type="submit" className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-hover hover:text-bg">
                      Tra
                    </button>
                  </form>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleFullTranslate(!!passageTranslation)}
                      disabled={fullTranslateLoading}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300"
                    >
                      {fullTranslateLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      {passageTranslation
                        ? "Dịch lại toàn bài & Soạn từ (1 lượt AI)"
                        : "Dịch toàn bài & Soạn 35 từ (1 lượt AI)"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowManualAdd((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-xl border border-line bg-bg px-3 py-2 text-[11px] font-semibold text-muted hover:text-ink"
                    >
                      <Edit3 size={13} /> Tự thêm tay (0 token)
                    </button>
                  </div>

                  {showManualAdd && (
                    <form onSubmit={saveManualVocab} className="space-y-2 rounded-xl border border-line bg-bg p-3 text-xs">
                      <div className="font-semibold text-ink">Admin tự thêm từ (không tốn API)</div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          required
                          value={mLemma}
                          onChange={(e) => setMLemma(e.target.value)}
                          placeholder="Từ tiếng Anh *"
                          className="rounded-lg border border-line px-2.5 py-1.5 outline-none focus:border-brand"
                        />
                        <input
                          value={mIpa}
                          onChange={(e) => setMIpa(e.target.value)}
                          placeholder="IPA (tuỳ chọn)"
                          className="rounded-lg border border-line px-2.5 py-1.5 outline-none focus:border-brand"
                        />
                      </div>
                      <div className="flex gap-2">
                        <input
                          required
                          value={mMeaning}
                          onChange={(e) => setMMeaning(e.target.value)}
                          placeholder="Nghĩa tiếng Việt *"
                          className="flex-1 rounded-lg border border-line px-2.5 py-1.5 outline-none focus:border-brand"
                        />
                        <select
                          value={mLevel}
                          onChange={(e) => setMLevel(e.target.value)}
                          className="rounded-lg border border-line px-2 py-1.5 outline-none"
                        >
                          {["B1", "B2", "C1", "C2"].map((lv) => (
                            <option key={lv} value={lv}>{lv}</option>
                          ))}
                        </select>
                      </div>
                      <button type="submit" className="w-full rounded-lg bg-brand py-1.5 font-semibold text-white">
                        Lưu vào lịch sử bài
                      </button>
                    </form>
                  )}

                  {vocabLoading && (
                    <div className="space-y-2.5 py-3 text-xs text-muted">
                      <div className="flex items-center gap-2 text-sm">
                        <Loader2 size={16} className="animate-spin" /> Đang kiểm tra Kho & tra nghĩa...
                      </div>
                      {contextSentenceVi && (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-ink">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                              Dịch câu ngữ cảnh (0 token)
                            </span>
                            {contextSentenceVi.length > 120 && (
                              <button
                                type="button"
                                onClick={() => setContextBoxExpanded((v) => !v)}
                                className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                              >
                                {contextBoxExpanded ? "Thu gọn" : "Mở rộng"}
                                {contextBoxExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            )}
                          </div>
                          <p
                            className={`mt-1 leading-relaxed ${
                              !contextBoxExpanded && contextSentenceVi.length > 120 ? "line-clamp-2" : ""
                            }`}
                          >
                            {contextSentenceVi}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {vocabError && (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-200">
                      {vocabError}
                    </div>
                  )}

                  {vocabResult && (
                    <div className="space-y-3 rounded-xl border border-line bg-bg/60 p-3.5">
                      {vocabCached && (
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                            <Zap size={11} /> Lấy từ bản dịch bài / Kho (0 token)
                          </span>
                          {lastLookupTerm.term && (
                            <button
                              onClick={() =>
                                lookupTerm(
                                  lastLookupTerm.term,
                                  lastLookupTerm.sentence,
                                  true,
                                  lastLookupTerm.paragraphIdx
                                )
                              }
                              className="inline-flex items-center gap-1 text-muted hover:text-ink"
                            >
                              <RefreshCw size={11} /> Hỏi lại AI
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-ink">{vocabResult.lemma}</span>
                            <button
                              onClick={() => speakWord(vocabResult.lemma)}
                              className="rounded-lg p-1 text-muted hover:bg-card hover:text-ink"
                              title="Nghe phát âm"
                            >
                              <Volume2 size={16} />
                            </button>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                            {vocabResult.ipa && <span>{vocabResult.ipa}</span>}
                            {vocabResult.pos && <span className="rounded bg-card px-1.5 py-0.5">{vocabResult.pos}</span>}
                            <span className="rounded bg-brand/20 px-1.5 py-0.5 font-semibold text-brand-hover">
                              {vocabResult.cefr_level}
                            </span>
                            {vocabResult.is_awl && (
                              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                                AWL
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setEditVocabVi(vocabResult.meaning_in_context || vocabResult.meaning_vi);
                            setEditingVocabMeaning((v) => !v);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted hover:bg-card hover:text-ink"
                          title="Admin sửa nghĩa"
                        >
                          <Edit3 size={12} /> Sửa
                        </button>
                      </div>

                      {editingVocabMeaning ? (
                        <div className="flex gap-2">
                          <input
                            value={editVocabVi}
                            onChange={(e) => setEditVocabVi(e.target.value)}
                            className="flex-1 rounded-lg border border-line px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                          />
                          <button
                            onClick={saveEditedVocabMeaning}
                            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Lưu
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-xl bg-card p-3 text-sm">
                          <div className="text-xs font-semibold text-brand-hover">Nghĩa trong câu này:</div>
                          <div className="mt-0.5 font-semibold text-ink">
                            {vocabResult.meaning_in_context || vocabResult.meaning_vi}
                          </div>
                          {vocabResult.meaning_vi && vocabResult.meaning_in_context !== vocabResult.meaning_vi && (
                            <div className="mt-1 text-xs text-muted">Nghĩa chung: {vocabResult.meaning_vi}</div>
                          )}
                          {vocabResult.definition_en && (
                            <div className="mt-1.5 text-xs text-muted">{vocabResult.definition_en}</div>
                          )}
                        </div>
                      )}

                      {(vocabResult.example || vocabResult.example_vi || contextSentenceVi) && (() => {
                        const transText = vocabResult.example_vi || contextSentenceVi || "";
                        const isLong = (vocabResult.example?.length ?? 0) + transText.length > 180;
                        return (
                          <div className="space-y-1 rounded-xl border border-line/70 bg-card/70 p-2.5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-muted">Câu ngữ cảnh & Dịch nghĩa</span>
                              {isLong && (
                                <button
                                  type="button"
                                  onClick={() => setContextBoxExpanded((v) => !v)}
                                  className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand-hover hover:underline"
                                >
                                  {contextBoxExpanded ? "Thu gọn" : "Mở rộng"}
                                  {contextBoxExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                              )}
                            </div>
                            {vocabResult.example && (
                              <div className={`italic text-ink/90 ${!contextBoxExpanded && isLong ? "line-clamp-2" : ""}`}>
                                “{vocabResult.example}”
                              </div>
                            )}
                            {transText && (
                              <div className={`text-emerald-700 dark:text-emerald-300 ${!contextBoxExpanded && isLong ? "line-clamp-2" : ""}`}>
                                → {transText}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {vocabResult.collocations?.length > 0 && (
                        <div className="text-xs">
                          <span className="font-semibold text-muted">Collocations: </span>
                          <span className="text-ink/90">{vocabResult.collocations.join(" · ")}</span>
                        </div>
                      )}

                      {/* Trạng thái Kho từ vựng rõ ràng */}
                      <div className="flex items-center justify-between rounded-lg bg-card px-2.5 py-1.5 text-[11px]">
                        <span className="text-muted">Trạng thái Kho:</span>
                        {vocabResult.existsInBank ? (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                            ✓ Đã có trong Kho{vocabResult.bankSource ? ` (${vocabResult.bankSource})` : ""}
                          </span>
                        ) : (
                          <span className="font-semibold text-amber-700 dark:text-amber-300">○ Chưa có trong Kho</span>
                        )}
                      </div>

                      <button
                        onClick={() => openBookPicker(vocabResult)}
                        disabled={vocabResult.existsInBank}
                        className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition ${
                          vocabResult.existsInBank
                            ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                            : "bg-brand text-white hover:bg-brand-hover hover:text-bg"
                        }`}
                      >
                        {vocabResult.existsInBank ? (
                          <>
                            <Check size={15} />{" "}
                            {addedBookTitle ? `Đã thêm vào "${addedBookTitle}"` : "Đã có trong Kho từ vựng"}
                          </>
                        ) : (
                          <>
                            <Plus size={15} /> Thêm vào Kho từ vựng
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Lịch sử các từ đã dịch sẵn / đã tra trong bài — có nút đóng/mở gọn gàng */}
                  {vocabNotes.length > 0 && (
                    <div className="space-y-2 border-t border-line pt-3">
                      <button
                        type="button"
                        onClick={() => setVocabHistoryOpen((v) => !v)}
                        className="flex w-full items-center justify-between text-xs font-semibold text-muted hover:text-ink"
                      >
                        <span>Từ đã dịch sẵn trong bài ({vocabNotes.length}) — bấm xem 0 token</span>
                        {vocabHistoryOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>

                      {vocabHistoryOpen && (
                        <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pt-1">
                          {vocabNotes.map((n) => {
                            const rj = n.result_json as Partial<VocabLookup>;
                            return (
                              <button
                                key={n.id}
                                onClick={() => {
                                  setVocabResult({
                                    lemma: rj.lemma ?? n.target_text,
                                    surface: rj.surface ?? n.target_text,
                                    norm_key: rj.norm_key ?? n.target_text,
                                    ipa: rj.ipa ?? "",
                                    pos: rj.pos ?? "",
                                    meaning_vi: rj.meaning_vi ?? "",
                                    meaning_in_context: rj.meaning_in_context ?? rj.meaning_vi ?? "",
                                    definition_en: rj.definition_en ?? "",
                                    example: rj.example ?? "",
                                    example_vi: rj.example_vi ?? "",
                                    cefr_level: rj.cefr_level ?? "B2",
                                    topic: rj.topic ?? "Other",
                                    is_awl: !!rj.is_awl,
                                    collocations: rj.collocations ?? [],
                                    synonyms: rj.synonyms ?? [],
                                    existsInBank: !!rj.existsInBank,
                                    bankSource: rj.bankSource ?? null,
                                  });
                                  setVocabNoteId(n.id);
                                  setVocabCached(true);
                                  setAddedBookTitle("");
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-line bg-bg px-2.5 py-1 text-xs text-ink/90 hover:border-brand hover:text-ink"
                              >
                                {rj.existsInBank && <Check size={11} className="text-emerald-600 dark:text-emerald-400" />}
                                {n.target_text}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: PHÂN TÍCH CÂU */}
              {activeTool === "sentence" && (
                <div className="space-y-4">
                  <form onSubmit={(e) => analyzeSentence(e, false)} className="space-y-2.5">
                    <textarea
                      rows={3}
                      value={sentenceInput}
                      onChange={(e) => setSentenceInput(e.target.value)}
                      placeholder="Bôi đen 1 câu trong bài đọc (sẽ tự điền vào đây) hoặc dán câu khó hiểu..."
                      className="w-full rounded-xl border border-line px-3 py-2 text-xs leading-relaxed outline-none focus:border-brand"
                    />
                    {sentenceInput.trim() && !sentenceResult && findSentenceTranslationVi(sentenceInput) && (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                        <div className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300">
                          <Zap size={12} /> Bản dịch có sẵn từ bài đọc (0 token):
                        </div>
                        <p className="mt-1 leading-relaxed text-ink">
                          {findSentenceTranslationVi(sentenceInput)}
                        </p>
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={sentenceLoading || !sentenceInput.trim()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-50"
                    >
                      {sentenceLoading ? (
                        <>
                          <Loader2 size={15} className="animate-spin" /> Đang phân tích...
                        </>
                      ) : (
                        <>
                          <Sparkles size={15} /> Phân tích cấu trúc ngữ pháp chi tiết
                        </>
                      )}
                    </button>
                  </form>

                  {sentenceError && (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-200">
                      {sentenceError}
                    </div>
                  )}

                  {sentenceResult && (
                    <div className="space-y-3 text-xs">
                      {sentenceCached && (
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <Zap size={11} /> Lấy từ lịch sử (0 token)
                          </span>
                          <button
                            onClick={() => analyzeSentence(undefined, true)}
                            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink"
                          >
                            <RefreshCw size={11} /> Phân tích lại
                          </button>
                        </div>
                      )}
                      <div className="rounded-xl bg-bg p-3">
                        <div className="font-semibold text-brand-hover">Dịch nghĩa học thuật</div>
                        <p className="mt-1 leading-relaxed text-ink">{sentenceResult.translation_vi}</p>
                      </div>
                      <div className="space-y-1.5 rounded-xl bg-bg p-3">
                        <div>
                          <span className="font-semibold text-muted">Chủ ngữ chính: </span>
                          <span className="text-ink">{sentenceResult.subject}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-muted">Động từ chính: </span>
                          <span className="text-ink">{sentenceResult.main_verb}</span>
                        </div>
                      </div>
                      {sentenceResult.clauses?.length > 0 && (
                        <div className="space-y-1">
                          <div className="font-semibold text-muted">Các mệnh đề / cụm bổ nghĩa:</div>
                          <ul className="list-disc space-y-1 pl-4 text-ink/90">
                            {sentenceResult.clauses.map((c, i) => <li key={i}>{c}</li>)}
                          </ul>
                        </div>
                      )}
                      {sentenceResult.grammar_points?.length > 0 && (
                        <div className="space-y-1">
                          <div className="font-semibold text-muted">Điểm ngữ pháp đáng chú ý:</div>
                          <ul className="list-disc space-y-1 pl-4 text-ink/90">
                            {sentenceResult.grammar_points.map((g, i) => <li key={i}>{g}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: HỎI CÂU SAI */}
              {activeTool === "question" && (
                <div className="space-y-4">
                  <form onSubmit={(e) => explainQuestion(e, false)} className="space-y-2.5">
                    <textarea
                      rows={3}
                      value={questionInput}
                      onChange={(e) => setQuestionInput(e.target.value)}
                      placeholder="Dán câu hỏi bạn làm sai (vd: Do the following statements agree...)"
                      className="w-full rounded-xl border border-line px-3 py-2 text-xs leading-relaxed outline-none focus:border-brand"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={correctAnsInput}
                        onChange={(e) => setCorrectAnsInput(e.target.value)}
                        placeholder="Đáp án đúng (vd: NOT GIVEN)"
                        className="rounded-xl border border-line px-3 py-2 text-xs outline-none focus:border-brand"
                      />
                      <input
                        value={userAnsInput}
                        onChange={(e) => setUserAnsInput(e.target.value)}
                        placeholder="Bạn chọn (vd: FALSE)"
                        className="rounded-xl border border-line px-3 py-2 text-xs outline-none focus:border-brand"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={questionLoading || !questionInput.trim()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-50"
                    >
                      {questionLoading ? (
                        <>
                          <Loader2 size={15} className="animate-spin" /> Đang tìm dẫn chứng...
                        </>
                      ) : (
                        <>
                          <Sparkles size={15} /> Tìm dẫn chứng & Giải thích
                        </>
                      )}
                    </button>
                  </form>

                  {questionError && (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-200">
                      {questionError}
                    </div>
                  )}

                  {questionResult && (
                    <div className="space-y-3 text-xs">
                      {questionCached && (
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <Zap size={11} /> Lấy từ lịch sử (0 token)
                          </span>
                          <button
                            onClick={() => explainQuestion(undefined, true)}
                            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink"
                          >
                            <RefreshCw size={11} /> Hỏi lại AI
                          </button>
                        </div>
                      )}
                      {questionResult.evidence_quote && (
                        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 dark:border-amber-400/40 dark:bg-amber-400/10">
                          <div className="font-semibold text-amber-800 dark:text-amber-300">Câu dẫn chứng trong bài:</div>
                          <p className="mt-1 italic text-amber-950 dark:text-amber-100">“{questionResult.evidence_quote}”</p>
                        </div>
                      )}
                      <div className="rounded-xl bg-bg p-3">
                        <div className="font-semibold text-brand-hover">Giải thích</div>
                        <p className="mt-1 leading-relaxed text-ink">{questionResult.explanation_vi}</p>
                      </div>
                      {questionResult.paraphrases?.length > 0 && (
                        <div className="space-y-1.5 rounded-xl bg-bg p-3">
                          <div className="font-semibold text-muted">Cặp Paraphrase cần nhớ:</div>
                          {questionResult.paraphrases.map((pr, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-1.5 text-ink/90">
                              <span className="rounded bg-card px-1.5 py-0.5">{pr.question_phrase}</span>
                              <span className="text-muted">↔</span>
                              <span className="rounded bg-card px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">{pr.passage_phrase}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {questionResult.tip_vi && (
                        <div className="text-muted">
                          <b>Mẹo:</b> {questionResult.tip_vi}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: GHI CHÚ & LỊCH SỬ ĐÃ LƯU (MỞ RỘNG ĐẦY ĐỦ) */}
              {activeTool === "notes" && (
                <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
                  {notes.length === 0 ? (
                    <p className="py-4 text-xs text-muted">
                      Chưa có ghi chú nào. Mọi từ đã tra, câu phức đã phân tích, hay câu sai đã hỏi đều tự lưu ở đây (xem lại 0 token).
                    </p>
                  ) : (
                    notes.map((n) => {
                      const res = n.result_json as Record<string, unknown>;
                      const isExpanded = expandedNoteIds.has(n.id);
                      const toggleExpand = () =>
                        setExpandedNoteIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(n.id)) next.delete(n.id);
                          else next.add(n.id);
                          return next;
                        });

                      const mainText =
                        n.kind === "vocab"
                          ? String(res.meaning_in_context ?? res.meaning_vi ?? "")
                          : n.kind === "sentence"
                          ? String(res.translation_vi ?? "")
                          : String(res.explanation_vi ?? "");

                      return (
                        <div key={n.id} className="space-y-2 rounded-xl border border-line bg-bg p-3 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <span className="inline-flex items-center gap-1 rounded bg-brand/20 px-1.5 py-0.5 text-[11px] font-semibold text-brand-hover">
                              <BookmarkCheck size={12} />
                              {n.kind === "vocab" ? "Từ vựng" : n.kind === "sentence" ? "Phân tích câu" : "Câu làm sai"}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={toggleExpand}
                                className="inline-flex items-center gap-0.5 text-[11px] text-brand-hover hover:underline"
                              >
                                {isExpanded ? "Thu gọn" : "Mở rộng"}
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingNoteId(editingNoteId === n.id ? null : n.id);
                                  setEditingNoteText(mainText);
                                }}
                                className="text-muted hover:text-ink"
                                title="Admin sửa ghi chú"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button onClick={() => deleteNote(n.id)} className="text-muted hover:text-red-600 dark:hover:text-red-300" title="Xoá ghi chú">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          <div className="font-semibold text-ink">{n.target_text}</div>

                          {editingNoteId === n.id ? (
                            <div className="space-y-2">
                              <textarea
                                rows={2}
                                value={editingNoteText}
                                onChange={(e) => setEditingNoteText(e.target.value)}
                                className="w-full rounded-lg border border-line px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                              />
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingNoteId(null)} className="text-muted hover:text-ink">
                                  Huỷ
                                </button>
                                <button
                                  onClick={() => saveNoteEdit(n)}
                                  className="rounded-lg bg-brand px-3 py-1 font-semibold text-white"
                                >
                                  Lưu
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-muted">{mainText}</div>
                          )}

                          {/* Nội dung mở rộng đầy đủ giống lúc tra cứu ban đầu */}
                          {isExpanded && n.kind === "vocab" && (() => {
                            const v = res as Partial<VocabLookup>;
                            const vocabObj: VocabLookup = {
                              lemma: v.lemma ?? n.target_text,
                              norm_key: v.norm_key ?? n.target_text,
                              ipa: v.ipa ?? "",
                              pos: v.pos ?? "",
                              meaning_vi: v.meaning_vi ?? "",
                              meaning_in_context: v.meaning_in_context ?? v.meaning_vi ?? "",
                              definition_en: v.definition_en ?? "",
                              example: v.example ?? "",
                              cefr_level: v.cefr_level ?? "B2",
                              topic: v.topic ?? "Other",
                              is_awl: !!v.is_awl,
                              collocations: v.collocations ?? [],
                              synonyms: v.synonyms ?? [],
                              existsInBank: !!v.existsInBank,
                              bankSource: v.bankSource ?? null,
                            };
                            return (
                              <div className="space-y-2 border-t border-line/70 pt-2">
                                <div className="flex flex-wrap items-center gap-2 text-muted">
                                  {vocabObj.ipa && <span>{vocabObj.ipa}</span>}
                                  <button onClick={() => speakWord(vocabObj.lemma)} className="hover:text-ink" title="Nghe">
                                    <Volume2 size={14} />
                                  </button>
                                  {vocabObj.pos && <span className="rounded bg-card px-1.5 py-0.5">{vocabObj.pos}</span>}
                                  <span className="rounded bg-brand/20 px-1.5 py-0.5 text-brand-hover">{vocabObj.cefr_level}</span>
                                  {vocabObj.is_awl && <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">AWL</span>}
                                </div>
                                {vocabObj.definition_en && <div className="text-ink/85">{vocabObj.definition_en}</div>}
                                {vocabObj.collocations.length > 0 && (
                                  <div className="text-ink/85">
                                    <span className="text-muted">Collocations: </span>
                                    {vocabObj.collocations.join(" · ")}
                                  </div>
                                )}
                                {vocabObj.example && (
                                  <div className="italic text-muted">“{vocabObj.example}”</div>
                                )}
                                <div className="flex items-center justify-between pt-1">
                                  {vocabObj.existsInBank ? (
                                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">✓ Đã có trong Kho</span>
                                  ) : (
                                    <button
                                      onClick={() => openBookPicker(vocabObj)}
                                      className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 font-semibold text-white hover:bg-brand-hover hover:text-bg"
                                    >
                                      <Plus size={12} /> Thêm vào Kho
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {isExpanded && n.kind === "sentence" && (() => {
                            const s = res as Partial<SentenceBreakdown>;
                            return (
                              <div className="space-y-2 border-t border-line/70 pt-2 text-ink/90">
                                {s.subject && (
                                  <div><span className="text-muted">Chủ ngữ chính: </span>{s.subject}</div>
                                )}
                                {s.main_verb && (
                                  <div><span className="text-muted">Động từ chính: </span>{s.main_verb}</div>
                                )}
                                {s.clauses && s.clauses.length > 0 && (
                                  <ul className="list-disc space-y-1 pl-4">
                                    {s.clauses.map((c, i) => <li key={i}>{c}</li>)}
                                  </ul>
                                )}
                                {s.grammar_points && s.grammar_points.length > 0 && (
                                  <ul className="list-disc space-y-1 pl-4 text-muted">
                                    {s.grammar_points.map((g, i) => <li key={i}>{g}</li>)}
                                  </ul>
                                )}
                              </div>
                            );
                          })()}

                          {isExpanded && n.kind === "question" && (() => {
                            const q = res as Partial<QuestionExplanation>;
                            return (
                              <div className="space-y-2 border-t border-line/70 pt-2">
                                {q.evidence_quote && (
                                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 italic text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                                    “{q.evidence_quote}”
                                  </div>
                                )}
                                {q.paraphrases && q.paraphrases.length > 0 && (
                                  <div className="space-y-1">
                                    <div className="font-semibold text-muted">Paraphrase:</div>
                                    {q.paraphrases.map((pr, i) => (
                                      <div key={i} className="flex flex-wrap items-center gap-1">
                                        <span className="rounded bg-card px-1.5 py-0.5">{pr.question_phrase}</span>
                                        <span>↔</span>
                                        <span className="rounded bg-card px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">{pr.passage_phrase}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {q.tip_vi && <div className="text-muted"><b>Mẹo:</b> {q.tip_vi}</div>}
                                {q.evidence_quote && (
                                  <button
                                    onClick={() => {
                                      setHighlightQuote(q.evidence_quote!);
                                      setMobileSheetOpen(false);
                                    }}
                                    className="text-[11px] font-semibold text-amber-700 hover:underline dark:text-amber-300"
                                  >
                                    Highlight dẫn chứng trong bài
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Modal chọn / tạo Bộ sách khi thêm từ vào Kho */}
      {showBookModal && (pendingVocabToAdd ?? vocabResult) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ink">
                  Chọn bộ sách lưu từ “{(pendingVocabToAdd ?? vocabResult)!.lemma}”
                </h3>
                <p className="mt-0.5 text-xs text-muted">Từ sẽ được xếp vào đúng bộ trong Kho từ vựng.</p>
              </div>
              <button onClick={() => setShowBookModal(false)} className="rounded-lg p-1 text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            {bookModalError && (
              <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
                {bookModalError}
              </div>
            )}

            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {books.map((b) => (
                <label
                  key={b.id}
                  onClick={() => {
                    setSelectedBookId(b.id);
                    setCreatingBook(false);
                  }}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs transition ${
                    !creatingBook && selectedBookId === b.id
                      ? "border-brand bg-brand/15 text-ink"
                      : "border-line bg-bg text-ink/90 hover:border-brand/50"
                  }`}
                >
                  <div>
                    <div className="font-semibold">{b.title}</div>
                    <div className="mt-0.5 text-[11px] text-muted">{b.band}</div>
                  </div>
                  <input
                    type="radio"
                    name="book"
                    checked={!creatingBook && selectedBookId === b.id}
                    onChange={() => {
                      setSelectedBookId(b.id);
                      setCreatingBook(false);
                    }}
                    className="accent-brand"
                  />
                </label>
              ))}
            </div>

            <div className="mt-3 border-t border-line pt-3">
              {!creatingBook ? (
                <button
                  type="button"
                  onClick={() => setCreatingBook(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-hover hover:underline"
                >
                  <FolderPlus size={15} /> + Tạo bộ sách mới ngay tại đây
                </button>
              ) : (
                <div className="space-y-2 rounded-xl border border-brand/40 bg-bg p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink">Tạo bộ sách mới</span>
                    <button onClick={() => setCreatingBook(false)} className="text-muted hover:text-ink">
                      Huỷ
                    </button>
                  </div>
                  <input
                    value={newBookTitle}
                    onChange={(e) => setNewBookTitle(e.target.value)}
                    placeholder="Tên bộ sách (vd: Cam 18 Test 1)"
                    className="w-full rounded-lg border border-line px-3 py-1.5 outline-none focus:border-brand"
                  />
                  <select
                    value={newBookBand}
                    onChange={(e) => setNewBookBand(e.target.value)}
                    className="w-full rounded-lg border border-line px-3 py-1.5 outline-none"
                  >
                    <option value="Band 6.0">Mục tiêu Band 6.0</option>
                    <option value="Band 6.5">Mục tiêu Band 6.5</option>
                    <option value="Band 7.0">Mục tiêu Band 7.0</option>
                  </select>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowBookModal(false)}
                className="rounded-xl border border-line px-4 py-2 text-xs font-semibold text-muted hover:text-ink"
              >
                Huỷ
              </button>
              <button
                onClick={confirmAddToBook}
                disabled={addingWord || (creatingBook && !newBookTitle.trim())}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg disabled:opacity-50"
              >
                {addingWord ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Lưu vào bộ này
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReadingDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-line bg-card p-10 text-center text-sm text-muted">
          Đang mở bài đọc...
        </div>
      }
    >
      <ReadingDetailInner />
    </Suspense>
  );
}
