/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CharacterLoader } from "@/components/CharacterLoader";
import {
  ArrowLeft,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Compass,
  Copy,
  Eye,
  Flame,
  GraduationCap,
  GripVertical,
  Layers,
  Lightbulb,
  Maximize2,
  Minimize2,
  Pause,
  PenLine,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  StickyNote,
  Target,
  Timer,
  Volume2,
  X,
} from "lucide-react";
import { enrollWordsInSrs } from "@/lib/srs";
import { notifyDueUpdated } from "@/lib/due-events";
import { levelColor } from "@/lib/mock";
import { speakWord } from "@/lib/tts";
import {
  countWords,
  detectUsedTargetWords,
  getBlueprintForSession,
  getSubTypeMeta,
  isRewriteMatched,
  type DrillFocus,
  type OutlineGuideResult,
  type RecommendedVocabItem,
  type SentenceCorrectionItem,
  type WritingGradeResult,
  type WritingMode,
  type WritingSubType,
  type WritingTaskType,
} from "@/lib/writing-frameworks";

type TargetVocabItem = {
  id: number;
  word: string;
  lemma: string;
  ipa: string;
  pos: string;
  vi: string;
  meaning_vi: string;
  example: string;
  level: string;
  cefr_level: string;
  topic: string;
  collocations: string[];
};

type SubmissionDetail = {
  id: number;
  prompt_id: number | null;
  mode: WritingMode;
  drill_focus: DrillFocus;
  task_type: WritingTaskType;
  sub_type: WritingSubType;
  topic: string;
  prompt_snapshot: string;
  image_snapshot: string | null;
  target_words: string[];
  used_target_words: string[];
  step_drafts_json: Record<string, string>;
  content: string;
  word_count: number;
  duration_seconds: number;
  overall_band: number | null;
  tr_band: number | null;
  cc_band: number | null;
  lr_band: number | null;
  gra_band: number | null;
  feedback_json: WritingGradeResult | null;
  rewritten_sentences_json: Record<string, string>;
  discipline_completed: boolean;
  studied_at: string;
  created_at: string;
};

type PromptDetail = {
  id: number;
  task_type: WritingTaskType;
  sub_type: WritingSubType;
  title: string;
  source_name: string | null;
  topic: string;
  prompt_text: string;
  image_data_url: string | null;
  chart_notes: string | null;
  ai_guide_json: OutlineGuideResult | null;
};

const ERROR_BADGE_MAP: Record<
  "grammar" | "lexical" | "coherence" | "task_response" | "none",
  { label: string; cls: string }
> = {
  grammar: {
    label: "Lỗi Ngữ pháp (GRA)",
    cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
  lexical: {
    label: "Lỗi Từ vựng / Diễn đạt (LR)",
    cls: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  },
  coherence: {
    label: "Lỗi Liên kết & Mạch lạc (CC)",
    cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
  task_response: {
    label: "Lập luận / Trả lời đề (TR/TA)",
    cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  },
  none: {
    label: "Câu đạt chuẩn",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
};

function formatTimer(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function speakEnglish(text: string) {
  speakWord(text);
}

function WritingStudioInner() {
  const params = useParams<{ id: string }>();
  const submissionId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [prompt, setPrompt] = useState<PromptDetail | null>(null);
  const [targetVocab, setTargetVocab] = useState<TargetVocabItem[]>([]);
  const [aiGuide, setAiGuide] = useState<OutlineGuideResult | null>(null);
  const [guideCached, setGuideCached] = useState(false);

  // Chế độ phiên làm bài: "select" (màn hình chọn), "practice" (luyện tập), "exam" (phòng thi)
  const [sessionMode, setSessionMode] = useState<"select" | "practice" | "exam">("select");

  // Chế độ viết: "exam" (viết tự do 1 khung lớn - mặc định) hoặc "guided" (theo từng bước PEEL)
  const [editorMode, setEditorMode] = useState<"guided" | "exam">("exam");
  const [stepDrafts, setStepDrafts] = useState<Record<string, string>>({});
  const [content, setContent] = useState("");

  // Đồng hồ bấm giờ
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [examLocked, setExamLocked] = useState(false);

  // Split-pane kéo giãn & Toàn màn hình
  const [leftPanePct, setLeftPanePct] = useState(45);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingSplitRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Slide-over Drawer (chế độ Luyện tập) & Ghi chú nháp (cả 2 chế độ)
  const [drawerTab, setDrawerTab] = useState<null | "guide" | "vocab" | "dict">(null);
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [scratchpadText, setScratchpadText] = useState("");

  // Tra từ nhanh trong Drawer
  type DictWord = {
    id: number;
    word: string;
    ipa: string;
    pos: string;
    vi: string;
    en: string;
    level: string;
    example: string;
    topic: string;
  };
  const [dictQuery, setDictQuery] = useState("");
  const [dictResults, setDictResults] = useState<DictWord[]>([]);
  const [dictLoading, setDictLoading] = useState(false);
  const dictBookCacheRef = useRef<DictWord[] | null>(null);

  // Các tab điều hướng cột trái & cột phải
  const [leftTab, setLeftTab] = useState<"blueprint" | "ai_coach">("blueprint");
  const [rightTab, setRightTab] = useState<"write" | "feedback" | "rewrite" | "model">(
    "write"
  );

  // Quản lý tuần tự từng bước & đóng/mở gợi ý ở chế độ Step-by-step
  const [unlockedStepCount, setUnlockedStepCount] = useState(1);
  const [openStepKeys, setOpenStepKeys] = useState<Set<string>>(() => new Set());
  const [openHintStepKeys, setOpenHintStepKeys] = useState<Set<string>>(() => new Set());

  // Trạng thái xử lý API
  const [savingDraft, setSavingDraft] = useState(false);
  const [loadingGuide, setLoadingGuide] = useState(false);
  const [grading, setGrading] = useState(false);
  const [savingRewrite, setSavingRewrite] = useState(false);
  const [rewrittenMap, setRewrittenMap] = useState<Record<string, string>>({});
  const [savedVocabKeys, setSavedVocabKeys] = useState<Set<string>>(() => new Set());
  const [savingVocabKey, setSavingVocabKey] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const autoCompletedRef = useRef(false);
  const autoSubmittedExamRef = useRef(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3200);
  }

  // Khôi phục & lưu nháp Ghi chú (Scratchpad) theo từng bài
  useEffect(() => {
    if (!Number.isFinite(submissionId) || submissionId <= 0) return;
    try {
      const saved = localStorage.getItem(`writing_scratchpad_${submissionId}`);
      if (saved) setScratchpadText(saved);
    } catch {
      // ignore
    }
  }, [submissionId]);

  useEffect(() => {
    if (!Number.isFinite(submissionId) || submissionId <= 0) return;
    try {
      localStorage.setItem(`writing_scratchpad_${submissionId}`, scratchpadText);
    } catch {
      // ignore
    }
  }, [submissionId, scratchpadText]);

  // Theo dõi trạng thái toàn màn hình
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Kéo giãn 2 cột (Resizable Split Pane)
  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (!isDraggingSplitRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPanePct(Math.min(70, Math.max(25, Math.round(pct * 10) / 10)));
    }
    function onPointerUp() {
      if (isDraggingSplitRef.current) {
        isDraggingSplitRef.current = false;
        document.body.style.userSelect = "";
      }
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  // Tải chi tiết phiên luyện viết
  useEffect(() => {
    if (!Number.isFinite(submissionId) || submissionId <= 0) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/writing/${submissionId}`, { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok || !j.submission) {
          setError(j.error || "Không tải được phiên luyện viết");
          return;
        }
        const sub = j.submission as SubmissionDetail;
        setSubmission(sub);
        setPrompt(j.prompt ?? null);
        setTargetVocab(j.targetVocab ?? []);
        if (j.aiGuide) {
          setAiGuide(j.aiGuide);
          setGuideCached(true);
        }

        const bp = getBlueprintForSession(sub.task_type, sub.drill_focus, sub.sub_type);
        const rawDrafts = (sub.step_drafts_json ?? {}) as Record<string, string>;
        const initContent = sub.content ?? "";

        let resolvedDrafts: Record<string, string> = rawDrafts;
        if (Object.keys(rawDrafts).length === 0 && initContent.trim()) {
          const paras = initContent.trim().split(/\n\s*\n/);
          const mapped: Record<string, string> = {};
          bp.steps.forEach((step, idx) => {
            if (idx < bp.steps.length - 1) {
              mapped[step.key] = paras[idx] ?? "";
            } else {
              mapped[step.key] = paras.slice(idx).join("\n\n");
            }
          });
          resolvedDrafts = mapped;
        }
        setStepDrafts(resolvedDrafts);

        let highestFilledIdx = -1;
        bp.steps.forEach((step, idx) => {
          if ((resolvedDrafts[step.key] ?? "").trim()) {
            highestFilledIdx = idx;
          }
        });
        const initialUnlocked = Math.min(
          bp.steps.length,
          Math.max(1, highestFilledIdx + 1)
        );
        setUnlockedStepCount(initialUnlocked);
        const activeStepKey = bp.steps[initialUnlocked - 1]?.key ?? bp.steps[0]?.key;
        setOpenStepKeys(activeStepKey ? new Set([activeStepKey]) : new Set());

        setContent(initContent);
        setElapsedSeconds(Number(sub.duration_seconds ?? 0));
        setRewrittenMap((sub.rewritten_sentences_json ?? {}) as Record<string, string>);

        if (sub.overall_band !== null && sub.overall_band !== undefined) {
          setSessionMode("practice");
          setRightTab(sub.discipline_completed ? "feedback" : "rewrite");
          setTimerRunning(false);
        } else {
          setSessionMode("select");
          setTimerRunning(false);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [submissionId]);

  // Bộ đếm thời gian mỗi giây
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  const taskType: WritingTaskType = submission?.task_type ?? "task2";
  const drillFocus: DrillFocus = submission?.drill_focus ?? "body_peel_1";
  const subType: WritingSubType = submission?.sub_type ?? "opinion";
  const subMeta = useMemo(() => getSubTypeMeta(subType, taskType), [subType, taskType]);
  const blueprint = useMemo(
    () => getBlueprintForSession(taskType, drillFocus, subType),
    [taskType, drillFocus, subType]
  );

  const wordCount = useMemo(() => countWords(content), [content]);
  const targetWordStrings = useMemo(() => {
    if (targetVocab.length > 0) return targetVocab.map((v) => v.lemma);
    return submission?.target_words ?? [];
  }, [targetVocab, submission]);

  const usedTargetWords = useMemo(
    () => detectUsedTargetWords(content, targetWordStrings),
    [content, targetWordStrings]
  );

  const usedTargetSet = useMemo(
    () => new Set(usedTargetWords.map((w) => w.toLowerCase())),
    [usedTargetWords]
  );

  const chartImageUrl = submission?.image_snapshot || prompt?.image_data_url || null;
  const feedback = submission?.feedback_json ?? null;

  // Danh sách các câu có lỗi cần gõ lại ở Bước 3
  const errorSentenceEntries = useMemo(() => {
    const list: { index: number; item: SentenceCorrectionItem }[] = [];
    const corrections = feedback?.sentence_corrections ?? [];
    corrections.forEach((item, index) => {
      if (item?.has_error && item.band65_fix) {
        list.push({ index, item });
      }
    });
    return list;
  }, [feedback]);

  const completedRewritesCount = useMemo(() => {
    return errorSentenceEntries.filter(({ index, item }) =>
      isRewriteMatched(rewrittenMap[String(index)] ?? "", item.band65_fix)
    ).length;
  }, [errorSentenceEntries, rewrittenMap]);

  const allRewritesDone =
    Boolean(feedback) &&
    (errorSentenceEntries.length === 0 ||
      completedRewritesCount === errorSentenceEntries.length);

  // Tự động đánh dấu hoàn thành kỷ luật khi người học gõ xong 100% câu sai
  useEffect(() => {
    if (
      !submission ||
      submission.discipline_completed ||
      !allRewritesDone ||
      autoCompletedRef.current
    ) {
      return;
    }
    autoCompletedRef.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/writing/${submission.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rewritten_sentences_json: rewrittenMap,
            discipline_completed: true,
          }),
        });
        const j = await res.json();
        if (res.ok && j.submission) {
          setSubmission(j.submission);
          showToast("🎉 Chúc mừng! Bạn đã hoàn thành Kỷ luật Writing 3 bước hôm nay (+1 Streak 🔥)");
        }
      } catch {
        autoCompletedRef.current = false;
      }
    })();
  }, [allRewritesDone, rewrittenMap, submission]);

  // Đồng bộ 2 chiều giữa chế độ từng bước (Guided) và viết liền mạch (Exam)
  function handleStepChange(stepKey: string, val: string) {
    const nextDrafts = { ...stepDrafts, [stepKey]: val };
    setStepDrafts(nextDrafts);
    const joined = blueprint.steps
      .map((s) => (nextDrafts[s.key] ?? "").trim())
      .filter(Boolean)
      .join("\n\n");
    setContent(joined);
  }

  function handleSwitchEditorMode(nextMode: "guided" | "exam") {
    if (nextMode === editorMode) return;
    if (nextMode === "guided" && content.trim()) {
      const joinedCurrent = blueprint.steps
        .map((s) => (stepDrafts[s.key] ?? "").trim())
        .filter(Boolean)
        .join("\n\n");
      if (joinedCurrent.trim() !== content.trim()) {
        const paras = content.trim().split(/\n\s*\n/);
        const nextDrafts: Record<string, string> = {};
        blueprint.steps.forEach((step, idx) => {
          if (idx < blueprint.steps.length - 1) {
            nextDrafts[step.key] = paras[idx] ?? "";
          } else {
            nextDrafts[step.key] = paras.slice(idx).join("\n\n");
          }
        });
        setStepDrafts(nextDrafts);
      }
    } else if (nextMode === "exam") {
      const joined = blueprint.steps
        .map((s) => (stepDrafts[s.key] ?? "").trim())
        .filter(Boolean)
        .join("\n\n");
      if (joined && !content.trim()) {
        setContent(joined);
      }
    }
    setEditorMode(nextMode);
  }

  function toggleStepOpen(stepKey: string) {
    setOpenStepKeys((prev) => {
      const next = new Set(prev);
      if (next.has(stepKey)) next.delete(stepKey);
      else next.add(stepKey);
      return next;
    });
  }

  function toggleStepHint(stepKey: string) {
    setOpenHintStepKeys((prev) => {
      const next = new Set(prev);
      if (next.has(stepKey)) next.delete(stepKey);
      else next.add(stepKey);
      return next;
    });
  }

  function completeStepAndUnlockNext(currentIdx: number) {
    const currentStep = blueprint.steps[currentIdx];
    const nextStep = blueprint.steps[currentIdx + 1];
    if (!currentStep) return;

    if (nextStep) {
      setUnlockedStepCount((prev) => Math.max(prev, currentIdx + 2));
      setOpenStepKeys((prev) => {
        const next = new Set(prev);
        next.delete(currentStep.key);
        next.add(nextStep.key);
        return next;
      });
    } else {
      setOpenStepKeys((prev) => {
        const next = new Set(prev);
        next.delete(currentStep.key);
        return next;
      });
    }
  }

  function insertSnippetIntoStep(stepKey: string, snippet: string) {
    if (editorMode === "guided") {
      // Nếu có bước đang mở thì ưu tiên chèn vào bước đó
      const activeOpenKey =
        blueprint.steps.find((s) => openStepKeys.has(s.key))?.key ?? stepKey;
      const cur = stepDrafts[activeOpenKey] ?? "";
      const sep = cur && !cur.endsWith(" ") ? " " : "";
      handleStepChange(activeOpenKey, `${cur}${sep}${snippet} `);
    } else {
      const sep = content && !content.endsWith(" ") ? " " : "";
      setContent(`${content}${sep}${snippet} `);
    }
    showToast("Đã chèn mẫu câu vào bài viết!");
  }

  async function handleSaveDraft() {
    if (!submission) return;
    setSavingDraft(true);
    setError("");
    try {
      const res = await fetch(`/api/writing/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          step_drafts_json: stepDrafts,
          duration_seconds: elapsedSeconds,
          used_target_words: usedTargetWords,
          rewritten_sentences_json: rewrittenMap,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Không lưu được bản nháp");
      setSubmission(j.submission);
      showToast("✓ Đã lưu bản nháp bài viết");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleRequestAiOutline(forceAi = false) {
    if (!submission) return;
    setLoadingGuide(true);
    setError("");
    setDrawerTab("guide");
    setLeftTab("ai_coach");
    try {
      const res = await fetch("/api/writing/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "outline_guide",
          submissionId: submission.id,
          promptId: submission.prompt_id,
          forceAi,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Không tạo được dàn ý AI");
      setAiGuide(j.guide);
      setGuideCached(Boolean(j.cached));
      showToast(
        j.cached
          ? "⚡ Đã tải dàn ý từ bộ nhớ đệm (0 token)"
          : "✓ AI Gia sư đã phân tích đề & lập dàn ý chi tiết!"
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingGuide(false);
    }
  }

  async function handleSubmitForGrading(isAutoExamSubmit = false) {
    if (!submission) return;
    if (wordCount < 15) {
      setError(
        isAutoExamSubmit
          ? "Hết giờ làm bài! Bài viết chưa đủ 15 từ để gửi chấm AI."
          : "Hãy viết ít nhất 15 từ trước khi gửi chấm chữa AI."
      );
      return;
    }
    setGrading(true);
    setTimerRunning(false);
    setDrawerTab(null);
    setError("");
    try {
      const res = await fetch("/api/writing/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "grade",
          submissionId: submission.id,
          content,
          stepDrafts,
          durationSeconds: elapsedSeconds,
          usedTargetWords,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Lỗi khi chấm bài với AI");
      setSubmission(j.submission);
      setRightTab("feedback");
      showToast("✓ Đã chấm chữa chi tiết 4 tiêu chí IELTS!");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGrading(false);
    }
  }

  function startPracticeMode() {
    setSessionMode("practice");
    setEditorMode("exam");
    setExamLocked(false);
    setTimerRunning(true);
  }

  function startExamMode() {
    setSessionMode("exam");
    setEditorMode("exam");
    setDrawerTab(null);
    setElapsedSeconds(0);
    setExamLocked(false);
    autoSubmittedExamRef.current = false;
    setTimerRunning(true);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      showToast("Trình duyệt không hỗ trợ toàn màn hình ở chế độ này.");
    }
  }

  async function handleDictSearch(rawQuery: string) {
    const q = rawQuery.trim().toLowerCase();
    if (!q) {
      setDictResults([]);
      return;
    }
    setDictLoading(true);
    try {
      const res = await fetch(`/api/words?page=1&pageSize=20&q=${encodeURIComponent(q)}`);
      const j = await res.json().catch(() => ({}));
      const personal: DictWord[] = Array.isArray(j.words) ? j.words : [];

      let bookMatches: DictWord[] = [];
      if (personal.length < 10) {
        if (!dictBookCacheRef.current) {
          const bRes = await fetch("/api/words?scope=books");
          const bJson = await bRes.json().catch(() => ({}));
          dictBookCacheRef.current = Array.isArray(bJson.words) ? bJson.words : [];
        }
        bookMatches = dictBookCacheRef.current
          .filter((w) => (w.word + " " + w.vi + " " + w.en).toLowerCase().includes(q))
          .slice(0, 20);
      }

      const seen = new Set<string>();
      const merged: DictWord[] = [];
      for (const item of [...personal, ...bookMatches]) {
        const k = item.word.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          merged.push(item);
        }
        if (merged.length >= 25) break;
      }
      setDictResults(merged);
    } catch {
      setDictResults([]);
    } finally {
      setDictLoading(false);
    }
  }

  // Tự động khóa và nộp bài khi hết giờ trong chế độ Phòng thi
  const examTargetSeconds = blueprint.recommendedMinutes * 60;
  useEffect(() => {
    if (
      sessionMode !== "exam" ||
      !timerRunning ||
      Boolean(feedback) ||
      autoSubmittedExamRef.current
    ) {
      return;
    }
    if (elapsedSeconds >= examTargetSeconds) {
      autoSubmittedExamRef.current = true;
      setTimerRunning(false);
      setExamLocked(true);
      showToast("⏰ Hết giờ làm bài! Hệ thống đang tự động khóa và nộp bài...");
      void handleSubmitForGrading(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionMode, timerRunning, elapsedSeconds, examTargetSeconds, feedback]);

  async function handleSaveRewriteProgress(markCompleted = false) {
    if (!submission) return;
    setSavingRewrite(true);
    setError("");
    try {
      const res = await fetch(`/api/writing/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rewritten_sentences_json: rewrittenMap,
          discipline_completed: markCompleted || allRewritesDone,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Không lưu được tiến độ gõ câu sai");
      setSubmission(j.submission);
      if (j.submission?.discipline_completed) {
        showToast("🎉 Hoàn thành Kỷ luật Writing 3 bước hôm nay (+1 Streak 🔥)!");
      } else {
        showToast("✓ Đã lưu tiến độ gõ lại câu sai");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingRewrite(false);
    }
  }

  async function handleSaveVocabToSrs(items: Partial<RecommendedVocabItem>[], keyLabel: string) {
    setSavingVocabKey(keyLabel);
    setError("");
    try {
      const res = await fetch("/api/writing/coach", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "writing-coach",
          items,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Không lưu được từ vựng vào kho");

      const wordIds: number[] = Array.isArray(j.wordIds) ? j.wordIds : [];
      if (wordIds.length > 0) {
        await enrollWordsInSrs(wordIds);
        notifyDueUpdated();
      }

      setSavedVocabKeys((prev) => {
        const next = new Set(prev);
        next.add(keyLabel);
        for (const it of items) {
          if (it.lemma) next.add(it.lemma.toLowerCase());
        }
        return next;
      });
      showToast(`✓ Đã lưu ${items.length} từ/cụm từ vào Kho từ vựng & Lịch ôn tập SRS!`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingVocabKey(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-card p-10 text-center text-sm text-muted">
        Đang mở phòng luyện viết & hướng dẫn khoa học...
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="space-y-4 rounded-2xl border border-line bg-card p-8 text-center">
        <p className="font-bold text-ink">{error || "Không tìm thấy phiên luyện viết"}</p>
        <Link
          href="/writing"
          className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-xs font-bold text-white"
        >
          <ArrowLeft size={14} /> Quay lại Trung tâm Writing
        </Link>
      </div>
    );
  }

  const targetSeconds = blueprint.recommendedMinutes * 60;
  const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);
  const step1Done = wordCount >= blueprint.minWords;
  const visibleSteps = blueprint.steps.slice(0, unlockedStepCount);

  if (sessionMode === "select" && !feedback) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 py-4">
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-card px-4 py-3 text-xs font-bold text-emerald-700 shadow-xl dark:text-emerald-300">
            <CheckCircle2 size={16} />
            <span>{toast}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/writing"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 py-2 text-xs font-bold text-muted transition hover:text-ink"
          >
            <ArrowLeft size={14} /> Quay lại Trung tâm Writing
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                taskType === "task1"
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              }`}
            >
              {taskType === "task1" ? "Task 1" : "Task 2"} · {subMeta.shortLabel}
            </span>
            {prompt?.source_name && (
              <span className="rounded-lg bg-card px-2.5 py-1 text-xs font-semibold text-ink border border-line">
                {prompt.source_name}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-card p-5 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-muted">
            Đề bài ({submission.topic})
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
            {submission.prompt_snapshot}
          </p>
          {chartImageUrl && (
            <div className="pt-2">
              <img
                src={chartImageUrl}
                alt="Task 1 Chart Preview"
                className="max-h-44 rounded-xl border border-line bg-white p-2 object-contain"
              />
            </div>
          )}
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-xl font-extrabold text-ink">
            Chọn chế độ làm bài phù hợp với bạn
          </h1>
          <p className="text-xs text-muted">
            Bạn có thể luyện viết có trợ lý AI & từ vựng SRS, hoặc mô phỏng phòng thi thật bấm giờ nghiêm ngặt.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <button
            type="button"
            onClick={startPracticeMode}
            className="group flex flex-col justify-between rounded-2xl border-2 border-line bg-card p-6 text-left transition hover:border-brand hover:shadow-lg"
          >
            <div className="space-y-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <Compass size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold text-ink">Chế độ Luyện tập</h2>
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    Khuyên dùng
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Tập trung viết tự do hoặc bật từng bước PEEL. Có ngăn kéo trượt chứa Gợi ý AI, Khung công thức, Từ vựng SRS & Tra từ nhanh.
                </p>
              </div>
              <ul className="space-y-1.5 text-xs text-ink">
                <li>✓ Không giới hạn thời gian (đồng hồ đếm xuôi)</li>
                <li>✓ Chuyển linh hoạt Viết tự do ↔ Theo từng bước</li>
                <li>✓ Tra từ nhanh & lưu thẳng vào SRS</li>
                <li>✓ Lưu nháp bài viết bất cứ lúc nào</li>
              </ul>
            </div>
            <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-brand-hover group-hover:underline">
              Bắt đầu Luyện tập →
            </div>
          </button>

          <button
            type="button"
            onClick={startExamMode}
            className="group flex flex-col justify-between rounded-2xl border-2 border-line bg-card p-6 text-left transition hover:border-rose-500 hover:shadow-lg"
          >
            <div className="space-y-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-300">
                <GraduationCap size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold text-ink">Chế độ Phòng thi</h2>
                  <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                    {blueprint.recommendedMinutes}:00
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Mô phỏng thi IELTS trên máy tính: ẩn toàn bộ gợi ý, từ vựng và từ điển để rèn phản xạ thật dưới áp lực thời gian.
                </p>
              </div>
              <ul className="space-y-1.5 text-xs text-ink">
                <li>⏳ Đếm ngược {blueprint.recommendedMinutes} phút chuẩn phòng thi</li>
                <li>🔒 Tự động khóa bài & nộp chấm AI khi hết giờ</li>
                <li>🚫 Ẩn toàn bộ gợi ý AI, SRS & tra từ</li>
                <li>✏️ Giữ lại giấy nháp Ghi chú để lập dàn ý nhanh</li>
              </ul>
            </div>
            <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-rose-600 dark:text-rose-300 group-hover:underline">
              Vào Phòng thi ngay →
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Thanh thông báo nhanh (Toast) */}
      {toast && (
        <div className="fixed bottom-20 right-6 z-50 flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-card px-4 py-3 text-xs font-bold text-emerald-700 shadow-xl dark:text-emerald-300">
          <CheckCircle2 size={16} />
          <span>{toast}</span>
        </div>
      )}

      {/* THANH TRÊN TỐI GIẢN */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/writing"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-bg px-3 py-1.5 text-xs font-bold text-muted transition hover:text-ink"
          >
            <ArrowLeft size={14} /> Thoát
          </Link>
          <span
            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
              taskType === "task1"
                ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {taskType === "task1" ? "Task 1" : "Task 2"} · {subMeta.shortLabel}
          </span>
          {prompt?.source_name && (
            <span className="hidden sm:inline rounded-lg bg-bg px-2.5 py-1 text-xs font-semibold text-ink">
              {prompt.source_name}
            </span>
          )}
          <span
            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
              sessionMode === "exam"
                ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                : "bg-brand/15 text-brand-hover"
            }`}
          >
            {sessionMode === "exam" ? "🎓 Phòng thi" : "🧭 Luyện tập"}
          </span>
          {!feedback && (
            <button
              type="button"
              onClick={() => {
                setTimerRunning(false);
                setDrawerTab(null);
                setSessionMode("select");
              }}
              className="rounded-lg border border-line bg-bg px-2 py-1 text-[11px] font-semibold text-muted hover:text-ink"
            >
              Đổi chế độ
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Chuyển Viết tự do <-> Theo từng bước (Chỉ ở chế độ Luyện tập) */}
          {sessionMode === "practice" && rightTab === "write" && (
            <div className="inline-flex rounded-xl border border-line bg-bg p-0.5">
              <button
                type="button"
                onClick={() => handleSwitchEditorMode("exam")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  editorMode === "exam"
                    ? "bg-brand text-white"
                    : "text-muted hover:text-ink"
                }`}
              >
                <PenLine size={12} /> Viết tự do
              </button>
              <button
                type="button"
                onClick={() => handleSwitchEditorMode("guided")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  editorMode === "guided"
                    ? "bg-brand text-white"
                    : "text-muted hover:text-ink"
                }`}
              >
                <Layers size={12} /> Theo từng bước
              </button>
            </div>
          )}

          {/* Bộ đếm từ nhanh */}
          <div
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold ${
              step1Done
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
            }`}
          >
            <Target size={13} />
            <span>
              {wordCount} / {blueprint.minWords} từ
            </span>
          </div>

          {/* Nút Toàn màn hình */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-bg px-3 py-1.5 text-xs font-bold text-muted transition hover:text-ink"
            title={isFullscreen ? "Thoát toàn màn hình" : "Chế độ toàn màn hình"}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span className="hidden sm:inline">
              {isFullscreen ? "Thu nhỏ" : "Toàn màn hình"}
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="p-1">
            <X size={16} />
          </button>
        </div>
      )}

      {/* BỐ CỤC 2 CỘT CÓ THANH KÉO GIÃN */}
      <div
        ref={splitContainerRef}
        className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-0"
      >
        {/* CỘT TRÁI: ĐỀ BÀI & ẢNH BIỂU ĐỒ CỐ ĐỊNH, THOÁNG MẮT */}
        <div
          style={{ ["--left-pane" as string]: `${leftPanePct}%` }}
          className="w-full space-y-3.5 lg:w-[var(--left-pane)] lg:shrink-0 lg:sticky lg:top-4"
        >
          <div className="rounded-2xl border border-line bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                Đề bài ({submission.topic})
              </span>
              {chartImageUrl && (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand/15 px-2.5 py-1 text-xs font-bold text-brand-hover"
                >
                  <Eye size={13} /> Phóng to biểu đồ
                </button>
              )}
            </div>
            <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed font-medium text-ink">
              {submission.prompt_snapshot}
            </p>
            {prompt?.chart_notes && (
              <p className="mt-3 rounded-xl bg-bg p-2.5 text-xs text-muted">
                <b>Ghi chú biểu đồ:</b> {prompt.chart_notes}
              </p>
            )}
            {chartImageUrl && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="group relative w-full overflow-hidden rounded-xl border border-line bg-white p-2"
                >
                  <img
                    src={chartImageUrl}
                    alt="Task 1 Chart"
                    className="mx-auto max-h-72 object-contain"
                  />
                  <span className="mt-1 block text-center text-[11px] font-semibold text-brand-hover group-hover:underline">
                    🔍 Bấm vào ảnh để phóng to xem rõ số liệu
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* THANH KÉO GIÃN 2 CỘT (DESKTOP) */}
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={() => {
            isDraggingSplitRef.current = true;
            document.body.style.userSelect = "none";
          }}
          title="Kéo trái/phải để thay đổi độ rộng 2 cột"
          className="hidden lg:flex w-4 shrink-0 cursor-col-resize items-center justify-center self-stretch py-8 text-muted/60 hover:text-brand-hover transition"
        >
          <div className="flex h-12 w-1.5 items-center justify-center rounded-full bg-line/80 hover:bg-brand">
            <GripVertical size={12} />
          </div>
        </div>

        {/* CỘT PHẢI: SOẠN THẢO -> CHẤM 4 TIÊU CHÍ -> TRẠM GÕ LẠI CÂU SAI -> BÀI MẪU & LƯU TỪ */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* Thanh chuyển đổi chế độ xem ở cột phải khi đã có kết quả chấm */}
          {feedback && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-2">
              <button
                type="button"
                onClick={() => setRightTab("write")}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  rightTab === "write"
                    ? "bg-brand text-white"
                    : "text-muted hover:text-ink"
                }`}
              >
                <PenLine size={14} /> Bài làm của bạn
              </button>
              <button
                type="button"
                onClick={() => setRightTab("feedback")}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  rightTab === "feedback"
                    ? "bg-brand text-white"
                    : "text-muted hover:text-ink"
                }`}
              >
                <Award size={14} /> Chấm 4 tiêu chí & Sửa từng câu (Band{" "}
                {feedback.overall_band.toFixed(1)})
              </button>
              <button
                type="button"
                onClick={() => setRightTab("rewrite")}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  rightTab === "rewrite"
                    ? "bg-brand text-white"
                    : !submission.discipline_completed
                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                    : "text-muted hover:text-ink"
                }`}
              >
                <Flame size={14} /> Bước 3: Gõ lại câu sai ({completedRewritesCount}/
                {errorSentenceEntries.length})
              </button>
              <button
                type="button"
                onClick={() => setRightTab("model")}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  rightTab === "model"
                    ? "bg-brand text-white"
                    : "text-muted hover:text-ink"
                }`}
              >
                <BookOpen size={14} /> Bài mẫu & Lưu từ SRS (
                {feedback.recommended_vocab?.length ?? 0})
              </button>
            </div>
          )}

          {/* VIEW 1: SOẠN THẢO BÀI VIẾT (GUIDED HOẶC EXAM FREEFLOW) */}
          {rightTab === "write" && (
            <div className="space-y-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
              {editorMode === "guided" ? (
                <div className="space-y-3">
                  {/* Thanh trạng thái gọn của chế độ từng bước */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-muted">
                      Tiến độ các bước: Đã mở {unlockedStepCount}/{blueprint.steps.length} bước
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      {unlockedStepCount < blueprint.steps.length && (
                        <button
                          type="button"
                          onClick={() => {
                            setUnlockedStepCount(blueprint.steps.length);
                            setOpenStepKeys(new Set(blueprint.steps.map((s) => s.key)));
                          }}
                          className="font-semibold text-brand-hover hover:underline"
                        >
                          Hiện tất cả các bước
                        </button>
                      )}
                    </div>
                  </div>

                  {visibleSteps.map((st, idx) => {
                    const stepText = stepDrafts[st.key] ?? "";
                    const stepWords = countWords(stepText);
                    const isOpen = openStepKeys.has(st.key);
                    const showHint = openHintStepKeys.has(st.key);
                    const hasNextStep = idx < blueprint.steps.length - 1;
                    const isDone = stepWords > 0 && !isOpen;

                    return (
                      <div
                        key={st.key}
                        className={`rounded-2xl border transition ${
                          isOpen
                            ? "border-brand/50 bg-bg"
                            : "border-line bg-bg/60 hover:border-line"
                        }`}
                      >
                        {/* Thanh tiêu đề của bước (Bấm để đóng/mở) */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleStepOpen(st.key)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleStepOpen(st.key);
                            }
                          }}
                          className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                stepWords > 0
                                  ? "bg-emerald-500 text-white"
                                  : "border border-line bg-card text-muted"
                              }`}
                            >
                              {stepWords > 0 ? <Check size={12} /> : idx + 1}
                            </span>
                            <span className="text-sm font-bold text-ink">
                              {idx + 1}. {st.label}
                            </span>
                            {isDone && (
                              <span className="hidden truncate text-xs text-muted sm:inline">
                                — {stepText.trim().slice(0, 55)}
                                {stepText.trim().length > 55 ? "..." : ""}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-muted">
                              {stepWords} từ
                            </span>
                            {isOpen && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleStepHint(st.key);
                                }}
                                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                                  showHint
                                    ? "border-brand bg-brand/15 text-brand-hover"
                                    : "border-line bg-card text-muted hover:text-ink"
                                }`}
                              >
                                <Lightbulb size={13} />
                                {showHint ? "Ẩn gợi ý" : "Gợi ý"}
                              </button>
                            )}
                            <span className="text-muted">
                              {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </span>
                          </div>
                        </div>

                        {/* Nội dung chi tiết của bước khi đang mở */}
                        {isOpen && (
                          <div className="space-y-3 border-t border-line px-4 pb-4 pt-3">
                            {/* Khung gợi ý câu nối & hướng dẫn (chỉ hiện khi bấm nút Gợi ý) */}
                            {showHint && (
                              <div className="space-y-2 rounded-xl border border-brand/30 bg-card p-3">
                                <p className="text-xs text-muted">{st.sentenceRole}</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {st.connectors.map((conn) => (
                                    <button
                                      key={conn}
                                      type="button"
                                      onClick={() => insertSnippetIntoStep(st.key, conn)}
                                      className="rounded-lg border border-line bg-bg px-2.5 py-1 text-xs font-semibold text-brand-hover hover:border-brand-hover"
                                    >
                                      + {conn}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Ô nhập chữ mở rộng thoáng đãng */}
                            <textarea
                              rows={8}
                              value={stepText}
                              onChange={(e) => handleStepChange(st.key, e.target.value)}
                              placeholder={st.placeholder}
                              className="min-h-[190px] w-full rounded-xl border border-line bg-card p-3.5 text-[15px] leading-relaxed text-ink focus:border-brand focus:outline-none"
                            />

                            {/* Nút chuyển sang bước tiếp theo (tự động thu gọn bước này) */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] text-muted">
                                {st.minWordsHint ? `Gợi ý độ dài bước này: ~${st.minWordsHint} từ` : ""}
                              </span>
                              {hasNextStep ? (
                                <button
                                  type="button"
                                  onClick={() => completeStepAndUnlockNext(idx)}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg"
                                >
                                  Xong bước này → Bước {idx + 2} <ChevronRight size={14} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => toggleStepOpen(st.key)}
                                  className="inline-flex items-center gap-1 rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-bold text-muted hover:text-ink"
                                >
                                  Thu gọn bước này <ChevronUp size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {content.trim() && (
                    <details className="rounded-xl border border-line bg-bg p-3 text-xs">
                      <summary className="cursor-pointer font-bold text-muted">
                        Xem trước toàn bài đã ghép ({wordCount} từ)
                      </summary>
                      <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">
                        {content}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {sessionMode === "practice" && (
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-800 dark:text-emerald-200">
                      <b>Gợi ý cấu trúc ({subMeta.shortLabel}):</b> {subMeta.keyTip}
                    </div>
                  )}
                  {examLocked && (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-200">
                      🔒 Đã hết thời gian làm bài! Khung viết đã được khóa.
                    </div>
                  )}
                  <textarea
                    rows={18}
                    value={content}
                    disabled={examLocked || grading}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Nhập bài viết hoàn chỉnh của bạn tại đây (chia đoạn bằng 1 dòng trống)..."
                    className="min-h-[450px] lg:min-h-[calc(100vh-280px)] w-full rounded-2xl border border-line bg-bg p-4 text-[15px] leading-relaxed text-ink focus:border-brand focus:outline-none disabled:opacity-70"
                  />
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: BẢNG ĐIỂM 4 TIÊU CHÍ & SỬA TỪNG CÂU 2 CẤP ĐỘ */}
          {rightTab === "feedback" && feedback && (
            <div className="space-y-5">
              {/* Banner nhắc sang Bước 3 nếu chưa hoàn thành kỷ luật */}
              {!submission.discipline_completed ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                  <div className="text-xs text-amber-900 dark:text-amber-200">
                    <div className="font-bold">
                      🔥 Còn 1 bước cuối để hoàn thành Kỷ luật Hôm nay (+1 Streak):
                    </div>
                    <p className="mt-0.5">
                      Hãy chuyển sang <b>Trạm Bước 3: Gõ lại câu sai</b> ({errorSentenceEntries.length}{" "}
                      câu cần sửa theo chuẩn Band 6.5+) để khắc sâu ngữ pháp vào trí nhớ cơ bắp!
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRightTab("rewrite")}
                    className="rounded-full bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
                  >
                    Sang Bước 3: Gõ lại câu sai →
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-4 text-xs font-bold text-emerald-800 dark:text-emerald-200">
                  <span className="inline-flex items-center gap-2">
                    <Flame size={18} /> Tuyệt vời! Bạn đã hoàn tất trọn vẹn 3 bước kỷ luật của bài viết này (+1 Streak 🔥).
                  </span>
                </div>
              )}

              {/* Thẻ điểm Overall + 4 tiêu chí */}
              <div className="rounded-2xl border border-line bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-muted">
                      Kết quả chấm chuẩn IELTS Academic
                    </div>
                    <div className="mt-1 text-3xl font-extrabold text-brand-hover">
                      Overall Band {feedback.overall_band.toFixed(1)}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-xl border border-line bg-bg px-3 py-2">
                      <div className="text-[11px] font-bold text-muted">
                        {taskType === "task1" ? "TA" : "TR"}
                      </div>
                      <div className="text-lg font-extrabold text-ink">
                        {feedback.tr_band.toFixed(1)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-line bg-bg px-3 py-2">
                      <div className="text-[11px] font-bold text-muted">CC</div>
                      <div className="text-lg font-extrabold text-ink">
                        {feedback.cc_band.toFixed(1)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-line bg-bg px-3 py-2">
                      <div className="text-[11px] font-bold text-muted">LR</div>
                      <div className="text-lg font-extrabold text-ink">
                        {feedback.lr_band.toFixed(1)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-line bg-bg px-3 py-2">
                      <div className="text-[11px] font-bold text-muted">GRA</div>
                      <div className="text-lg font-extrabold text-ink">
                        {feedback.gra_band.toFixed(1)}
                      </div>
                    </div>
                  </div>
                </div>

                {feedback.summary_vi && (
                  <p className="mt-3 text-sm leading-relaxed text-ink">
                    {feedback.summary_vi}
                  </p>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      [
                        "tr_vi",
                        taskType === "task1"
                          ? "Task Achievement (TA)"
                          : "Task Response (TR)",
                        feedback.tr_band,
                      ],
                      ["cc_vi", "Coherence & Cohesion (CC)", feedback.cc_band],
                      ["lr_vi", "Lexical Resource (LR)", feedback.lr_band],
                      ["gra_vi", "Grammatical Range & Accuracy (GRA)", feedback.gra_band],
                    ] as const
                  ).map(([key, label, score]) => {
                    const detail = feedback.criteria_feedback?.[key];
                    return (
                      <div
                        key={key}
                        className="space-y-1.5 rounded-xl border border-line bg-bg p-3.5 text-xs"
                      >
                        <div className="flex items-center justify-between font-bold text-ink">
                          <span>{label}</span>
                          <span className="rounded bg-brand/15 px-2 py-0.5 text-brand-hover">
                            {score.toFixed(1)}
                          </span>
                        </div>
                        {detail?.strengths && (
                          <p className="text-emerald-700 dark:text-emerald-300">
                            <b>+ Điểm mạnh:</b> {detail.strengths}
                          </p>
                        )}
                        {detail?.improvements && (
                          <p className="text-amber-800 dark:text-amber-300">
                            <b>→ Cần cải thiện:</b> {detail.improvements}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Đối chiếu sửa từng câu 2 cấp độ */}
              <div className="space-y-3 rounded-2xl border border-line bg-card p-5">
                <h3 className="text-base font-bold text-ink">
                  Chấm chữa chi tiết từng câu (2 cấp độ: Band 6.5 sát ý & Band 7.5+ nâng cấp)
                </h3>
                <div className="space-y-3">
                  {(feedback.sentence_corrections ?? []).map((s, idx) => {
                    const badge = ERROR_BADGE_MAP[s.error_type] ?? ERROR_BADGE_MAP.grammar;
                    return (
                      <div
                        key={idx}
                        className="space-y-2.5 rounded-xl border border-line bg-bg p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-muted">Câu #{idx + 1}</span>
                          <span
                            className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-bold ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        </div>

                        <div className="text-sm text-ink">
                          <span className="font-bold text-muted">Câu gốc: </span>
                          <span className={s.has_error ? "underline decoration-rose-500/60" : ""}>
                            {s.original}
                          </span>
                        </div>

                        {s.explanation_vi && (
                          <p className="text-xs text-muted">
                            <b>Nhận xét:</b> {s.explanation_vi}
                          </p>
                        )}

                        <div className="grid gap-2.5 md:grid-cols-2">
                          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                            <div className="font-bold text-emerald-700 dark:text-emerald-300">
                              ✓ Bản sửa sát ý chuẩn Band 6.5+:
                            </div>
                            <p className="mt-1 font-semibold text-ink">{s.band65_fix}</p>
                          </div>
                          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs">
                            <div className="font-bold text-sky-700 dark:text-sky-300">
                              ★ Bản nâng cấp từ vựng/cấu trúc Band 7.5+:
                            </div>
                            <p className="mt-1 font-semibold text-ink">{s.band75_upgrade}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 3: TRẠM KỶ LUẬT BƯỚC 3 – GÕ LẠI CÂU SAI (ACTIVE REWRITE) */}
          {rightTab === "rewrite" && feedback && (
            <div className="space-y-5 rounded-2xl border border-line bg-card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-0.5 text-xs font-bold text-brand-hover">
                    <Flame size={13} /> Trạm Kỷ Luật Bước 3 · Active Sentence Rewrite
                  </div>
                  <h2 className="mt-1.5 text-lg font-bold text-ink">
                    Gõ sửa lại các câu mắc lỗi theo chuẩn Band 6.5+
                  </h2>
                  <p className="text-xs text-muted">
                    Nghiên cứu chỉ ra rằng việc chỉ đọc lời phê của AI sẽ quên sau 10 phút. Tự tay gõ lại câu đúng giúp não bộ ghi nhớ cấu trúc chuẩn gấp 5 lần!
                  </p>
                </div>
                <div className="rounded-xl bg-bg px-3.5 py-2 text-right">
                  <div className="text-[11px] font-semibold text-muted">Tiến độ gõ sửa</div>
                  <div className="text-lg font-extrabold text-brand-hover">
                    {completedRewritesCount} / {errorSentenceEntries.length} câu
                  </div>
                </div>
              </div>

              {errorSentenceEntries.length === 0 ? (
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-6 text-center">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-600" />
                  <div className="mt-2 font-bold text-ink">
                    Bài viết của bạn không có câu lỗi nặng nào cần gõ lại!
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Hệ thống đã tự động ghi nhận hoàn thành Kỷ luật 3 bước hôm nay (+1 Streak 🔥).
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {errorSentenceEntries.map(({ index, item }, orderIdx) => {
                    const typed = rewrittenMap[String(index)] ?? "";
                    const matched = isRewriteMatched(typed, item.band65_fix);
                    return (
                      <div
                        key={index}
                        className={`space-y-3 rounded-2xl border p-4 transition ${
                          matched
                            ? "border-emerald-500/50 bg-emerald-500/10"
                            : "border-line bg-bg"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-ink">
                            Câu cần sửa #{orderIdx + 1}
                          </span>
                          {matched ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-bold text-white">
                              <Check size={12} /> Đã gõ chính xác
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setRewrittenMap((prev) => ({
                                  ...prev,
                                  [String(index)]: item.band65_fix,
                                }))
                              }
                              className="text-[11px] font-semibold text-muted underline hover:text-ink"
                            >
                              Điền nhanh nếu kẹt
                            </button>
                          )}
                        </div>

                        <div className="rounded-xl bg-rose-500/10 p-3 text-xs">
                          <div className="font-bold text-rose-700 dark:text-rose-300">
                            ✗ Câu gốc có lỗi:
                          </div>
                          <div className="mt-0.5 text-ink">{item.original}</div>
                          {item.explanation_vi && (
                            <div className="mt-1 text-muted">
                              <b>Lý do:</b> {item.explanation_vi}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl bg-card p-3 text-xs">
                          <div className="font-bold text-emerald-700 dark:text-emerald-300">
                            ✓ Hãy gõ lại câu chuẩn Band 6.5+ dưới đây vào ô bên dưới:
                          </div>
                          <div className="mt-1 text-sm font-bold text-ink">
                            {item.band65_fix}
                          </div>
                        </div>

                        <textarea
                          rows={2}
                          value={typed}
                          onChange={(e) =>
                            setRewrittenMap((prev) => ({
                              ...prev,
                              [String(index)]: e.target.value,
                            }))
                          }
                          placeholder="Gõ lại đầy đủ câu Band 6.5+ ở trên tại đây..."
                          className="w-full rounded-xl border border-line bg-card p-3 text-sm text-ink focus:border-brand focus:outline-none"
                        />
                      </div>
                    );
                  })}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <span className="text-xs text-muted">
                      {allRewritesDone
                        ? "🎉 Bạn đã gõ đúng tất cả các câu cần sửa!"
                        : `Còn ${
                            errorSentenceEntries.length - completedRewritesCount
                          } câu cần hoàn tất để mở khoá Streak hôm nay.`}
                    </span>
                    <button
                      type="button"
                      disabled={savingRewrite}
                      onClick={() => handleSaveRewriteProgress(allRewritesDone)}
                      className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg disabled:opacity-50"
                    >
                      <Flame size={14} />
                      {savingRewrite
                        ? "Đang lưu..."
                        : allRewritesDone
                        ? "Xác nhận Hoàn thành Kỷ luật Ngày (+1 Streak 🔥)"
                        : "Lưu tiến độ gõ câu sai"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 4: BÀI MẪU HOÀN CHỈNH & 1-CLICK LƯU TỪ VỰNG VÀO SRS */}
          {rightTab === "model" && feedback && (
            <div className="space-y-5">
              {/* Bài mẫu hoàn chỉnh */}
              <div className="space-y-3 rounded-2xl border border-line bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-ink">
                      Bài viết mẫu Band 7.0+ (Viết lại dựa trên chính dàn ý của bạn)
                    </h3>
                    <p className="text-xs text-muted">
                      Độ dài: {countWords(feedback.model_version)} từ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(feedback.model_version || "");
                      showToast("✓ Đã copy bài mẫu!");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-bg px-3 py-1.5 text-xs font-bold text-ink hover:border-brand-hover"
                  >
                    <Copy size={13} /> Copy bài mẫu
                  </button>
                </div>
                <div className="whitespace-pre-line rounded-xl border border-line bg-bg p-4 text-sm leading-relaxed text-ink">
                  {feedback.model_version}
                </div>
              </div>

              {/* Từ vựng & Collocations gợi ý lưu thẳng vào Kho từ & SRS */}
              <div className="space-y-4 rounded-2xl border border-line bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-ink">
                      Từ vựng & Collocations đắt giá rút ra từ bài chấm
                    </h3>
                    <p className="text-xs text-muted">
                      Bấm 1 nút để lưu thẳng vào Kho từ vựng cá nhân và tự động lên lịch ôn tập ngắt quãng Leitner SRS.
                    </p>
                  </div>
                  {feedback.recommended_vocab?.length > 0 && (
                    <button
                      type="button"
                      disabled={
                        savingVocabKey === "all" || savedVocabKeys.has("all")
                      }
                      onClick={() =>
                        handleSaveVocabToSrs(feedback.recommended_vocab, "all")
                      }
                      className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg disabled:opacity-50"
                    >
                      <Plus size={14} />
                      {savedVocabKeys.has("all")
                        ? "✓ Đã lưu toàn bộ vào Kho & SRS"
                        : "Lưu tất cả vào Kho từ & SRS"}
                    </button>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {(feedback.recommended_vocab ?? []).map((v, idx) => {
                    const key = v.lemma.toLowerCase();
                    const isSaved = savedVocabKeys.has(key) || savedVocabKeys.has("all");
                    return (
                      <div
                        key={idx}
                        className="flex flex-col justify-between rounded-xl border border-line bg-bg p-4"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-ink">{v.lemma}</span>
                              {v.ipa && <span className="text-xs text-muted">{v.ipa}</span>}
                              {v.pos && (
                                <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                                  {v.pos}
                                </span>
                              )}
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  levelColor[v.cefr_level] ?? levelColor.B2
                                }`}
                              >
                                {v.cefr_level}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => speakEnglish(v.lemma)}
                              className="rounded-lg p-1 text-muted hover:text-ink"
                            >
                              <Volume2 size={14} />
                            </button>
                          </div>

                          <div className="mt-1.5 text-xs font-semibold text-ink">
                            {v.meaning_vi}
                          </div>
                          {v.definition_en && (
                            <div className="mt-0.5 text-[11px] text-muted">
                              {v.definition_en}
                            </div>
                          )}
                          {v.example && (
                            <div className="mt-1.5 rounded-lg bg-card p-2 text-xs italic text-ink">
                              &ldquo;{v.example}&rdquo;
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-end border-t border-line pt-2.5">
                          <button
                            type="button"
                            disabled={isSaved || savingVocabKey === key}
                            onClick={() => handleSaveVocabToSrs([v], key)}
                            className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                              isSaved
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : "bg-brand text-white hover:bg-brand-hover hover:text-bg"
                            }`}
                          >
                            {isSaved ? (
                              <>
                                <Check size={13} /> Đã lưu vào Kho & SRS
                              </>
                            ) : savingVocabKey === key ? (
                              "Đang lưu..."
                            ) : (
                              <>
                                <Plus size={13} /> Lưu vào Kho từ & SRS
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NÚT NỔI GÓC DƯỚI PHẢI (CHỈ Ở CHẾ ĐỘ LUYỆN TẬP) */}
      {sessionMode === "practice" && rightTab === "write" && drawerTab === null && (
        <div className="fixed bottom-20 right-5 z-30 flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setDrawerTab("guide")}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-xs font-bold text-ink shadow-lg transition hover:border-brand hover:text-brand-hover"
          >
            <Lightbulb size={15} className="text-amber-500" />
            <span>Gợi ý & Từ vựng SRS</span>
            {targetVocab.length > 0 && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                {usedTargetWords.length}/{targetVocab.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setDrawerTab("dict")}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-xs font-bold text-ink shadow-lg transition hover:border-brand hover:text-brand-hover"
          >
            <Search size={15} className="text-brand-hover" />
            <span>Tra từ nhanh</span>
          </button>
        </div>
      )}

      {/* NGĂN KÉO TRƯỢT (SLIDE-OVER DRAWER - CHỈ Ở CHẾ ĐỘ LUYỆN TẬP) */}
      {sessionMode === "practice" && drawerTab !== null && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-[1px]"
          onClick={() => setDrawerTab(null)}
        >
          <div
            className="flex h-full w-full max-w-md flex-col border-l border-line bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Drawer */}
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-1 rounded-xl bg-bg p-1">
                <button
                  type="button"
                  onClick={() => setDrawerTab("guide")}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    drawerTab === "guide"
                      ? "bg-card text-brand-hover shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  💡 Gợi ý & Dàn ý
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab("vocab")}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    drawerTab === "vocab"
                      ? "bg-card text-brand-hover shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  🎯 SRS ({usedTargetWords.length}/{targetVocab.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab("dict")}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    drawerTab === "dict"
                      ? "bg-card text-brand-hover shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  🔍 Tra từ
                </button>
              </div>
              <button
                type="button"
                onClick={() => setDrawerTab(null)}
                className="rounded-lg p-1.5 text-muted hover:bg-bg hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body Drawer */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {drawerTab === "guide" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-bg p-1">
                    <button
                      type="button"
                      onClick={() => setLeftTab("blueprint")}
                      className={`rounded-lg py-2 text-xs font-bold transition ${
                        leftTab === "blueprint"
                          ? "bg-card text-ink shadow-xs"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      Khung công thức (0 token)
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeftTab("ai_coach")}
                      className={`rounded-lg py-2 text-xs font-bold transition ${
                        leftTab === "ai_coach"
                          ? "bg-card text-brand-hover shadow-xs"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      AI Phân tích & Dàn ý {aiGuide ? "⚡" : "(1 req)"}
                    </button>
                  </div>

                  {leftTab === "blueprint" ? (
                    <div className="space-y-2.5">
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-200">
                        <b>Mẹo dạng {subMeta.shortLabel}:</b> {subMeta.keyTip}
                      </div>
                      {blueprint.steps.map((st, idx) => (
                        <details
                          key={st.key}
                          className="group rounded-xl border border-line bg-bg p-3"
                        >
                          <summary className="cursor-pointer text-xs font-bold text-ink">
                            Bước {idx + 1}: {st.label}
                          </summary>
                          <div className="mt-2 space-y-2">
                            <p className="text-xs text-muted">{st.guideVi}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {st.connectors.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => insertSnippetIntoStep(st.key, c)}
                                  className="rounded-lg border border-line bg-card px-2 py-1 text-[11px] font-semibold text-brand-hover hover:border-brand-hover"
                                  title="Bấm để chèn vào bài viết"
                                >
                                  + {c}
                                </button>
                              ))}
                            </div>
                            {st.templates.length > 0 && (
                              <div className="space-y-1 border-t border-line pt-2 text-[11px] text-muted">
                                <div className="font-semibold text-ink">
                                  Khung câu mẫu Band 6.5+:
                                </div>
                                {st.templates.map((tpl, i) => (
                                  <div key={i} className="italic">
                                    &ldquo;{tpl}&rdquo;
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {!aiGuide ? (
                        <div className="space-y-3 rounded-xl border border-line bg-bg p-4 text-center">
                          <Sparkles size={24} className="mx-auto text-brand-hover" />
                          <div className="text-sm font-bold text-ink">
                            Nhờ AI Gia sư Phân tích đề & Lập dàn ý
                          </div>
                          <p className="text-xs text-muted">
                            AI sẽ đọc đề bài {chartImageUrl ? "(và số liệu ảnh biểu đồ)" : ""}, cảnh báo bẫy lạc đề, gợi ý luận điểm PEEL và collocations.
                          </p>
                          <button
                            type="button"
                            disabled={loadingGuide}
                            onClick={() => handleRequestAiOutline(false)}
                            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg disabled:opacity-50"
                          >
                            <Sparkles size={14} />
                            {loadingGuide
                              ? "AI đang phân tích..."
                              : "Phân tích đề & Gợi ý dàn ý (1 req)"}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2.5 text-xs">
                          <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-800 dark:text-emerald-200">
                            <span className="font-bold">
                              {guideCached
                                ? "⚡ Đã tải từ Cache (0 token)"
                                : "✓ Dàn ý AI đã lưu"}
                            </span>
                            <button
                              type="button"
                              disabled={loadingGuide}
                              onClick={() => handleRequestAiOutline(true)}
                              className="inline-flex items-center gap-1 font-semibold underline"
                            >
                              <RefreshCw size={11} /> Tạo lại
                            </button>
                          </div>

                          <details open className="rounded-xl border border-line bg-bg p-3">
                            <summary className="cursor-pointer font-bold text-ink">
                              1. Phân tích yêu cầu & Bẫy lạc đề
                            </summary>
                            <div className="mt-2 space-y-2">
                              <p className="text-ink">{aiGuide.task_analysis?.main_topic_vi}</p>
                              {aiGuide.task_analysis?.required_parts_vi?.length > 0 && (
                                <div>
                                  <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                                    Các vế bắt buộc phải trả lời:
                                  </div>
                                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
                                    {aiGuide.task_analysis.required_parts_vi.map((item, i) => (
                                      <li key={i}>{item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {aiGuide.task_analysis?.common_pitfalls_vi?.length > 0 && (
                                <div>
                                  <div className="font-semibold text-rose-600 dark:text-rose-300">
                                    Bẫy dễ mất điểm cần tránh:
                                  </div>
                                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
                                    {aiGuide.task_analysis.common_pitfalls_vi.map((item, i) => (
                                      <li key={i}>{item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {aiGuide.task_analysis?.suggested_stance_vi && (
                                <div className="rounded-lg bg-card p-2 text-ink">
                                  <b>Hướng đi gợi ý:</b>{" "}
                                  {aiGuide.task_analysis.suggested_stance_vi}
                                </div>
                              )}
                            </div>
                          </details>

                          <details open className="rounded-xl border border-line bg-bg p-3">
                            <summary className="cursor-pointer font-bold text-ink">
                              2. Dàn ý gợi ý từng bước
                            </summary>
                            <div className="mt-2 space-y-2">
                              <div className="rounded-lg bg-card p-2">
                                <b className="text-brand-hover">Mở bài (Paraphrase):</b>{" "}
                                {aiGuide.step_guides?.intro_paraphrase_hint}
                              </div>
                              <div className="rounded-lg bg-card p-2">
                                <b className="text-brand-hover">
                                  {taskType === "task1" ? "Overview:" : "Thesis Statement:"}
                                </b>{" "}
                                {aiGuide.step_guides?.thesis_or_overview_hint}
                              </div>
                              <div className="rounded-lg bg-card p-2">
                                <b className="text-brand-hover">Body 1:</b>{" "}
                                {aiGuide.step_guides?.body1_peel_hint}
                              </div>
                              <div className="rounded-lg bg-card p-2">
                                <b className="text-brand-hover">Body 2:</b>{" "}
                                {aiGuide.step_guides?.body2_peel_hint}
                              </div>
                              {aiGuide.step_guides?.conclusion_hint && (
                                <div className="rounded-lg bg-card p-2">
                                  <b className="text-brand-hover">Kết bài:</b>{" "}
                                  {aiGuide.step_guides.conclusion_hint}
                                </div>
                              )}
                            </div>
                          </details>

                          {aiGuide.topic_collocations?.length > 0 && (
                            <details className="rounded-xl border border-line bg-bg p-3">
                              <summary className="cursor-pointer font-bold text-ink">
                                3. Cụm từ học thuật sát đề ({aiGuide.topic_collocations.length})
                              </summary>
                              <div className="mt-2 space-y-2">
                                {aiGuide.topic_collocations.map((col, idx) => {
                                  const key = `guide-col-${idx}`;
                                  const isSaved =
                                    savedVocabKeys.has(key) ||
                                    savedVocabKeys.has(col.phrase.toLowerCase());
                                  return (
                                    <div key={idx} className="rounded-lg bg-card p-2.5">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-brand-hover">
                                          {col.phrase} ({col.cefr_level})
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              insertSnippetIntoStep(
                                                blueprint.steps[0]?.key ?? "intro",
                                                col.phrase
                                              )
                                            }
                                            className="rounded bg-bg px-2 py-0.5 text-[10px] font-bold text-ink hover:text-brand-hover"
                                          >
                                            + Chèn
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isSaved || savingVocabKey === key}
                                            onClick={() =>
                                              handleSaveVocabToSrs(
                                                [
                                                  {
                                                    lemma: col.phrase,
                                                    pos: "phr",
                                                    meaning_vi: col.meaning_vi,
                                                    example: col.example_sentence,
                                                    cefr_level: col.cefr_level,
                                                    topic: submission.topic,
                                                  },
                                                ],
                                                key
                                              )
                                            }
                                            className="rounded bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand-hover disabled:opacity-50"
                                          >
                                            {isSaved ? "✓ Đã lưu SRS" : "+ Lưu SRS"}
                                          </button>
                                        </div>
                                      </div>
                                      <div className="mt-0.5 text-ink">{col.meaning_vi}</div>
                                      <div className="mt-0.5 italic text-muted">
                                        VD: {col.example_sentence}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          )}

                          {aiGuide.grammar_structures?.length > 0 && (
                            <details className="rounded-xl border border-line bg-bg p-3">
                              <summary className="cursor-pointer font-bold text-ink">
                                4. Cấu trúc câu Band 6.5+ áp dụng trực tiếp
                              </summary>
                              <div className="mt-2 space-y-2">
                                {aiGuide.grammar_structures.map((g, idx) => (
                                  <div key={idx} className="rounded-lg bg-card p-2.5">
                                    <div className="font-bold text-ink">{g.pattern_name}</div>
                                    <div className="text-[11px] font-mono text-brand-hover">
                                      Công thức: {g.formula}
                                    </div>
                                    <div className="mt-1 italic text-ink">
                                      &ldquo;{g.applied_example}&rdquo;
                                    </div>
                                    <div className="mt-0.5 text-muted">{g.explanation_vi}</div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {drawerTab === "vocab" && (
                <div className="space-y-2.5">
                  {targetVocab.length === 0 ? (
                    <div className="rounded-xl border border-line bg-bg p-5 text-center text-xs text-muted">
                      Chưa có từ vựng SRS mục tiêu nào được gắn cho phiên viết này.
                    </div>
                  ) : (
                    targetVocab.map((v) => {
                      const isUsed =
                        usedTargetSet.has(v.lemma.toLowerCase()) ||
                        usedTargetSet.has(v.word.toLowerCase());
                      return (
                        <div
                          key={v.lemma}
                          className={`rounded-xl border p-3 transition ${
                            isUsed
                              ? "border-emerald-500/50 bg-emerald-500/15"
                              : "border-line bg-bg"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-ink">{v.lemma}</span>
                              {v.ipa && <span className="text-xs text-muted">{v.ipa}</span>}
                              {v.pos && (
                                <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                                  {v.pos}
                                </span>
                              )}
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  levelColor[v.cefr_level] ?? levelColor.B2
                                }`}
                              >
                                {v.cefr_level}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {isUsed ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
                                  <Check size={11} /> Đã dùng
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    insertSnippetIntoStep(
                                      blueprint.steps[0]?.key ?? "intro",
                                      v.lemma
                                    )
                                  }
                                  className="rounded-lg bg-card px-2 py-0.5 text-[10px] font-bold text-brand-hover hover:underline"
                                >
                                  + Chèn
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => speakEnglish(v.lemma)}
                                className="rounded-lg p-1 text-muted hover:text-ink"
                                title="Nghe phát âm"
                              >
                                <Volume2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-ink">{v.meaning_vi}</div>
                          {v.collocations?.length > 0 && (
                            <div className="mt-1 text-[11px] text-muted">
                              Cụm đi kèm: <i>{v.collocations.slice(0, 3).join(" · ")}</i>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {drawerTab === "dict" && (
                <div className="space-y-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleDictSearch(dictQuery);
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={dictQuery}
                      onChange={(e) => {
                        setDictQuery(e.target.value);
                        if (!e.target.value.trim()) setDictResults([]);
                      }}
                      placeholder="Nhập từ tiếng Anh hoặc nghĩa tiếng Việt..."
                      className="flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={dictLoading}
                      className="rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-white hover:bg-brand-hover disabled:opacity-50"
                    >
                      {dictLoading ? "..." : "Tìm"}
                    </button>
                  </form>

                  {dictResults.length === 0 && !dictLoading && (
                    <div className="rounded-xl border border-line bg-bg p-4 text-center text-xs text-muted">
                      {dictQuery.trim()
                        ? "Bấm Tìm để tra từ trong Kho từ vựng cá nhân & Bộ sách IELTS."
                        : "Nhập từ cần tra (Anh–Việt hoặc Việt–Anh) để chèn nhanh hoặc lưu vào SRS."}
                    </div>
                  )}

                  <div className="space-y-2">
                    {dictResults.map((w) => {
                      const key = `dict-${w.word.toLowerCase()}`;
                      const isSaved =
                        savedVocabKeys.has(key) ||
                        savedVocabKeys.has(w.word.toLowerCase());
                      return (
                        <div
                          key={w.id || w.word}
                          className="rounded-xl border border-line bg-bg p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-ink">{w.word}</span>
                              {w.ipa && <span className="text-xs text-muted">{w.ipa}</span>}
                              {w.pos && (
                                <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                                  {w.pos}
                                </span>
                              )}
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  levelColor[w.level] ?? levelColor.B2
                                }`}
                              >
                                {w.level || "B2"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => speakEnglish(w.word)}
                              className="rounded-lg p-1 text-muted hover:text-ink"
                              title="Nghe phát âm"
                            >
                              <Volume2 size={14} />
                            </button>
                          </div>
                          {w.vi && <div className="text-xs font-medium text-ink">{w.vi}</div>}
                          {w.en && <div className="text-[11px] text-muted">{w.en}</div>}
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                insertSnippetIntoStep(
                                  blueprint.steps[0]?.key ?? "intro",
                                  w.word
                                )
                              }
                              className="rounded-lg bg-card px-2.5 py-1 text-[10px] font-bold text-brand-hover hover:underline"
                            >
                              + Chèn vào bài
                            </button>
                            <button
                              type="button"
                              disabled={isSaved || savingVocabKey === key}
                              onClick={() =>
                                handleSaveVocabToSrs(
                                  [
                                    {
                                      lemma: w.word,
                                      pos: w.pos || "n",
                                      meaning_vi: w.vi,
                                      definition_en: w.en,
                                      example: w.example,
                                      cefr_level: (w.level as "B1" | "B2" | "C1" | "C2") || "B2",
                                      topic: w.topic || submission.topic,
                                    },
                                  ],
                                  key
                                )
                              }
                              className="rounded-lg bg-brand/15 px-2.5 py-1 text-[10px] font-bold text-brand-hover disabled:opacity-50"
                            >
                              {isSaved ? "✓ Đã lưu SRS" : "+ Lưu SRS"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KHUNG GHI CHÚ NHÁP (SCRATCHPAD - DÙNG ĐƯỢC Ở CẢ 2 CHẾ ĐỘ) */}
      {scratchpadOpen && (
        <div className="fixed bottom-20 right-4 z-40 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-line bg-card p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-2 pb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink">
              <StickyNote size={14} className="text-amber-500" />
              Giấy nháp / Dàn ý nhanh
            </span>
            <button
              type="button"
              onClick={() => setScratchpadOpen(false)}
              className="rounded-lg p-1 text-muted hover:text-ink"
            >
              <X size={15} />
            </button>
          </div>
          <textarea
            rows={7}
            value={scratchpadText}
            onChange={(e) => setScratchpadText(e.target.value)}
            placeholder="Ghi chú nhanh ý tưởng, số liệu nổi bật hoặc dàn ý (tự lưu trên trình duyệt)..."
            className="w-full rounded-xl border border-line bg-bg p-3 text-xs leading-relaxed text-ink focus:border-brand focus:outline-none"
          />
        </div>
      )}

      {/* THANH ĐÁY CỐ ĐỊNH (BOTTOM BAR) */}
      {(rightTab === "write" || !feedback) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur px-4 py-2.5 shadow-lg">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            {/* Trái: Đếm từ */}
            <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-muted">
              <Target size={14} className="text-brand-hover" />
              <span>
                {wordCount} / {blueprint.minWords} từ
              </span>
            </div>

            {/* Giữa: Đồng hồ */}
            <div
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-1.5 font-mono text-sm font-extrabold ${
                sessionMode === "exam" && remainingSeconds <= 120
                  ? "border-rose-500/50 bg-rose-500/15 text-rose-600 dark:text-rose-300 animate-pulse"
                  : "border-line bg-bg text-ink"
              }`}
            >
              {sessionMode === "exam" ? (
                <>
                  <Timer size={15} className="text-rose-500" />
                  <span>
                    {formatTimer(remainingSeconds)} / {blueprint.recommendedMinutes}:00
                  </span>
                </>
              ) : (
                <>
                  <Clock size={15} className="text-brand-hover" />
                  <span>{formatTimer(elapsedSeconds)}</span>
                  <button
                    type="button"
                    onClick={() => setTimerRunning((r) => !r)}
                    className="ml-1 rounded-lg bg-card p-1 text-muted hover:text-ink"
                    title={timerRunning ? "Tạm dừng" : "Tiếp tục bấm giờ"}
                  >
                    {timerRunning ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                </>
              )}
            </div>

            {/* Phải: Ghi chú + Lưu nháp + Nộp bài */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setScratchpadOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition ${
                  scratchpadOpen
                    ? "border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-300"
                    : "border-line bg-bg text-ink hover:border-brand-hover"
                }`}
              >
                <StickyNote size={14} />
                <span>Ghi chú</span>
              </button>

              {sessionMode === "practice" && (
                <button
                  type="button"
                  disabled={savingDraft}
                  onClick={handleSaveDraft}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-3.5 py-2 text-xs font-bold text-ink transition hover:border-brand-hover disabled:opacity-50"
                >
                  <Save size={14} />
                  <span>{savingDraft ? "Đang lưu..." : "Lưu nháp"}</span>
                </button>
              )}

              <button
                type="button"
                disabled={grading || wordCount < 15}
                onClick={() => handleSubmitForGrading(false)}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-xs sm:text-sm font-bold text-white transition hover:bg-brand-hover hover:text-bg disabled:opacity-50"
              >
                <Sparkles size={15} />
                <span>
                  {grading
                    ? "Đang chấm AI..."
                    : feedback
                    ? "Chấm lại AI"
                    : "Nộp bài & Chấm AI →"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX PHÓNG TO BIỂU ĐỒ TASK 1 */}
      {lightboxOpen && chartImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative max-h-[92vh] max-w-5xl overflow-auto rounded-2xl bg-white p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute right-3 top-3 rounded-full bg-black/75 p-2 text-white hover:bg-black"
            >
              <X size={18} />
            </button>
            <img
              src={chartImageUrl}
              alt="Task 1 Chart Fullscreen"
              className="max-h-[85vh] w-auto object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function WritingStudioPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-line bg-card p-10 flex justify-center">
          <CharacterLoader mode="writing" indicator="dots" size="md" />
        </div>
      }
    >
      <WritingStudioInner />
    </Suspense>
  );
}
