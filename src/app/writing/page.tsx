/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Clock,
  Copy,
  Eye,
  FileText,
  Flame,
  Image as ImageIcon,
  Layers,
  Play,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  DRILL_FOCUS_OPTIONS,
  getDrillFocusMeta,
  getSubTypeMeta,
  getTodaySchedule,
  TASK1_SUBTYPES,
  TASK2_SUBTYPES,
  WEEKLY_DISCIPLINE_SCHEDULE,
  WRITING_MIGRATION_SQL,
  type DailyDisciplineScheduleItem,
  type DrillFocus,
  type WritingMode,
  type WritingSubType,
  type WritingTaskType,
} from "@/lib/writing-frameworks";

const TOPICS = [
  "Environment",
  "Education",
  "Economy",
  "Government",
  "Health",
  "Technology",
  "Crime",
  "Society",
  "Science",
  "Media",
  "Work",
  "Culture",
  "Travel",
  "Other",
];

type WritingPromptItem = {
  id: number;
  task_type: WritingTaskType;
  sub_type: WritingSubType;
  title: string;
  source_name: string | null;
  topic: string;
  prompt_text: string;
  image_data_url: string | null;
  chart_notes: string | null;
  has_ai_guide?: boolean;
  status: "queued" | "practiced" | "mastered";
  times_practiced: number;
  last_practiced_at: string | null;
  created_at: string;
};

type WritingSubmissionItem = {
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
  word_count: number;
  duration_seconds: number;
  overall_band: number | null;
  tr_band: number | null;
  cc_band: number | null;
  lr_band: number | null;
  gra_band: number | null;
  discipline_completed: boolean;
  studied_at: string;
  created_at: string;
};

type MistakeItem = {
  id: string;
  submissionId: number;
  studiedAt: string;
  topic: string;
  taskType: WritingTaskType;
  original: string;
  error_type: "grammar" | "lexical" | "coherence" | "task_response";
  explanation_vi: string;
  band65_fix: string;
  band75_upgrade?: string;
  rewritten: boolean;
};

type ErrorStats = {
  grammar: number;
  lexical: number;
  coherence: number;
  task_response: number;
  total: number;
};

function formatDate(d?: string | null) {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

async function compressChartImage(
  file: File | Blob,
  maxWidth = 1000,
  quality = 0.82
): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Không đọc được file ảnh"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Hình ảnh không hợp lệ"));
    el.src = rawDataUrl;
  });

  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return rawDataUrl;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", quality);
}

const ERROR_LABELS: Record<
  "grammar" | "lexical" | "coherence" | "task_response",
  { label: string; short: string; color: string }
> = {
  grammar: {
    label: "Ngữ pháp & Cấu trúc (GRA)",
    short: "Ngữ pháp (GRA)",
    color: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
  lexical: {
    label: "Từ vựng & Collocations (LR)",
    short: "Từ vựng (LR)",
    color: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  },
  coherence: {
    label: "Mạch lạc & Từ nối (CC)",
    short: "Liên kết (CC)",
    color: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
  task_response: {
    label: "Lập luận & Trả lời đề (TR/TA)",
    short: "Trả lời đề (TR/TA)",
    color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
};

export default function WritingHubPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [error, setError] = useState("");

  const [prompts, setPrompts] = useState<WritingPromptItem[]>([]);
  const [submissions, setSubmissions] = useState<WritingSubmissionItem[]>([]);
  const [todaySchedule, setTodaySchedule] = useState<DailyDisciplineScheduleItem>(
    WEEKLY_DISCIPLINE_SCHEDULE[0]
  );
  const [errorStats, setErrorStats] = useState<ErrorStats>({
    grammar: 0,
    lexical: 0,
    coherence: 0,
    task_response: 0,
    total: 0,
  });
  const [recentMistakes, setRecentMistakes] = useState<MistakeItem[]>([]);

  // Tab Hôm nay / Tuần và lựa chọn nhiệm vụ
  const [missionViewTab, setMissionViewTab] = useState<"today" | "week">("today");
  const [selectedDrillFocus, setSelectedDrillFocus] = useState<DrillFocus>(
    WEEKLY_DISCIPLINE_SCHEDULE[0].drillFocus
  );
  const [selectedWeekTaskType, setSelectedWeekTaskType] = useState<WritingTaskType | null>(null);
  const [selectedMissionPromptId, setSelectedMissionPromptId] = useState<number | null>(null);
  const [startingSessionId, setStartingSessionId] = useState<number | null>(null);

  // 3 Tabs chính
  const [activeTab, setActiveTab] = useState<"queue" | "submissions" | "errors">("queue");

  // Bộ lọc Kho đề
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTask, setFilterTask] = useState<"all" | "task1" | "task2">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "queued" | "practiced" | "mastered">(
    "all"
  );
  const [filterTopic, setFilterTopic] = useState<string>("all");

  // Bộ lọc Sổ tay lỗi sai
  const [filterErrorType, setFilterErrorType] = useState<
    "all" | "grammar" | "lexical" | "coherence" | "task_response"
  >("all");

  // Lightbox xem ảnh biểu đồ & trạng thái đóng/mở nội dung đề
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showMissionPromptText, setShowMissionPromptText] = useState(false);
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<number>>(() => new Set());

  function togglePromptExpand(id: number) {
    setExpandedPromptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Modal thêm đề / bắt đầu viết ngay
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStartNow, setModalStartNow] = useState(false);
  const [formTaskType, setFormTaskType] = useState<WritingTaskType>("task2");
  const [formSubType, setFormSubType] = useState<WritingSubType>("opinion");
  const [formDrillFocus, setFormDrillFocus] = useState<DrillFocus>("body_peel_1");
  const [formTitle, setFormTitle] = useState("");
  const [formSourceName, setFormSourceName] = useState("Cam 18 Test 1");
  const [formTopic, setFormTopic] = useState("Education");
  const [formPromptText, setFormPromptText] = useState("");
  const [formImageDataUrl, setFormImageDataUrl] = useState("");
  const [formChartNotes, setFormChartNotes] = useState("");
  const [compressingImg, setCompressingImg] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const fallbackSched = getTodaySchedule();
      try {
        const res = await fetch("/api/writing", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setTodaySchedule(fallbackSched);
          setSelectedDrillFocus(fallbackSched.drillFocus);
          setError(j.error || "Không tải được dữ liệu Writing");
          return;
        }
        setNeedsMigration(Boolean(j.needsMigration));
        setPrompts(j.prompts ?? []);
        setSubmissions(j.submissions ?? []);
        const sched = j.todaySchedule ?? fallbackSched;
        setTodaySchedule(sched);
        setSelectedDrillFocus(sched.drillFocus);
        if (j.recommendedPrompt?.id) {
          setSelectedMissionPromptId(j.recommendedPrompt.id);
        }
        if (j.errorStats) setErrorStats(j.errorStats);
        if (j.recentMistakes) setRecentMistakes(j.recentMistakes);
      } catch (e) {
        if (active) {
          setTodaySchedule(fallbackSched);
          setSelectedDrillFocus(fallbackSched.drillFocus);
          setError((e as Error).message);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const effectiveDrillFocus: DrillFocus =
    missionViewTab === "today" ? todaySchedule.drillFocus : selectedDrillFocus;

  // Nhiệm vụ đang chọn thuộc Task 1 hay Task 2
  const missionTaskType: WritingTaskType = useMemo(() => {
    if (effectiveDrillFocus === "task1_overview" || effectiveDrillFocus === "task1_body") {
      return "task1";
    }
    if (effectiveDrillFocus === "full") {
      return missionViewTab === "week" && selectedWeekTaskType
        ? selectedWeekTaskType
        : todaySchedule.taskType;
    }
    return "task2";
  }, [effectiveDrillFocus, missionViewTab, selectedWeekTaskType, todaySchedule.taskType]);

  const missionMeta = useMemo(
    () => getDrillFocusMeta(effectiveDrillFocus, missionTaskType),
    [effectiveDrillFocus, missionTaskType]
  );

  // Đề bài phù hợp cho thẻ Nhiệm vụ hôm nay
  const matchingMissionPrompts = useMemo(() => {
    const byTask = prompts.filter((p) => p.task_type === missionTaskType);
    return byTask.length > 0 ? byTask : prompts;
  }, [prompts, missionTaskType]);

  const activeMissionPrompt = useMemo(() => {
    if (selectedMissionPromptId) {
      const found = matchingMissionPrompts.find((p) => p.id === selectedMissionPromptId);
      if (found) return found;
    }
    const firstQueued = matchingMissionPrompts.find((p) => p.status === "queued");
    return firstQueued ?? matchingMissionPrompts[0] ?? null;
  }, [matchingMissionPrompts, selectedMissionPromptId]);

  // Lọc danh sách đề trong Kho
  const filteredPrompts = useMemo(() => {
    return prompts.filter((p) => {
      if (filterTask !== "all" && p.task_type !== filterTask) return false;
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterTopic !== "all" && p.topic !== filterTopic) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hitTitle = p.title.toLowerCase().includes(q);
        const hitText = p.prompt_text.toLowerCase().includes(q);
        const hitSource = (p.source_name ?? "").toLowerCase().includes(q);
        if (!hitTitle && !hitText && !hitSource) return false;
      }
      return true;
    });
  }, [prompts, filterTask, filterStatus, filterTopic, searchQuery]);

  // Lọc sổ tay lỗi sai
  const filteredMistakes = useMemo(() => {
    if (filterErrorType === "all") return recentMistakes;
    return recentMistakes.filter((m) => m.error_type === filterErrorType);
  }, [recentMistakes, filterErrorType]);

  function openAddPromptModal(startNow: boolean, defaultTask?: WritingTaskType, defaultFocus?: DrillFocus) {
    const tType = defaultTask ?? (startNow ? missionTaskType : "task2");
    setModalStartNow(startNow);
    setFormTaskType(tType);
    setFormSubType(tType === "task1" ? "line_graph" : "opinion");
    setFormDrillFocus(
      defaultFocus ??
        (startNow
          ? selectedDrillFocus
          : tType === "task1"
          ? "task1_overview"
          : "body_peel_1")
    );
    setFormTitle("");
    setFormSourceName("Cam 18 Test 2");
    setFormTopic("Education");
    setFormPromptText("");
    setFormImageDataUrl("");
    setFormChartNotes("");
    setError("");
    setModalOpen(true);
  }

  async function handlePasteImage(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) return;
        setCompressingImg(true);
        try {
          const compressed = await compressChartImage(blob);
          setFormImageDataUrl(compressed);
          setFormTaskType("task1");
          if (
            !TASK1_SUBTYPES.some((s) => s.id === formSubType)
          ) {
            setFormSubType("line_graph");
          }
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setCompressingImg(false);
        }
        return;
      }
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressingImg(true);
    try {
      const compressed = await compressChartImage(file);
      setFormImageDataUrl(compressed);
      setFormTaskType("task1");
      if (!TASK1_SUBTYPES.some((s) => s.id === formSubType)) {
        setFormSubType("line_graph");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCompressingImg(false);
      e.target.value = "";
    }
  }

  async function handleSubmitPromptModal(e: React.FormEvent) {
    e.preventDefault();
    if (!formPromptText.trim() || formPromptText.trim().length < 15) {
      setError("Vui lòng nhập nội dung đề bài thật (tối thiểu 15 ký tự).");
      return;
    }
    setSavingPrompt(true);
    setError("");
    try {
      const mode: WritingMode = formDrillFocus === "full" ? "full_essay" : "daily_drill";
      const res = await fetch("/api/writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: modalStartNow ? "start_session" : "create_prompt",
          startImmediately: modalStartNow,
          task_type: formTaskType,
          sub_type: formSubType,
          drill_focus: formDrillFocus,
          mode,
          title: formTitle.trim() || undefined,
          source_name: formSourceName.trim() || undefined,
          topic: formTopic,
          prompt_text: formPromptText.trim(),
          image_data_url: formImageDataUrl.trim() || null,
          chart_notes: formChartNotes.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Không lưu được đề bài");

      if (modalStartNow) {
        const targetId = j.submissionId ?? j.submission?.id ?? j.id;
        router.push(`/writing/${targetId}`);
        return;
      }

      if (j.prompt) {
        setPrompts((prev) => [j.prompt, ...prev]);
        setSelectedMissionPromptId(j.prompt.id);
      }
      setModalOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingPrompt(false);
    }
  }

  async function startSessionWithPrompt(
    prompt: WritingPromptItem,
    drillFocus: DrillFocus,
    mode?: WritingMode
  ) {
    setStartingSessionId(prompt.id);
    setError("");
    try {
      const resolvedMode: WritingMode =
        mode ?? (drillFocus === "full" ? "full_essay" : "daily_drill");
      const res = await fetch("/api/writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_session",
          prompt_id: prompt.id,
          drill_focus: drillFocus,
          mode: resolvedMode,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Không tạo được phiên luyện viết");
      const targetId = j.submissionId ?? j.submission?.id ?? j.id;
      router.push(`/writing/${targetId}`);
    } catch (err) {
      setError((err as Error).message);
      setStartingSessionId(null);
    }
  }

  async function handleDeletePrompt(id: number) {
    if (!confirm("Xoá đề bài này khỏi Kho đề chờ luyện?")) return;
    try {
      const res = await fetch(`/api/writing?kind=prompt&id=${id}&promptId=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPrompts((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteSubmission(id: number) {
    if (!confirm("Xoá bài luyện viết này khỏi lịch sử?")) return;
    try {
      const res = await fetch(`/api/writing?kind=submission&id=${id}&submissionId=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const nextSubs = submissions.filter((s) => s.id !== id);
        setSubmissions(nextSubs);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleCopyMigrationSql() {
    navigator.clipboard.writeText(WRITING_MIGRATION_SQL);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 2500);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">IELTS Writing</h1>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/writing/stats"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-sm font-bold text-ink transition hover:border-brand-hover"
          >
            <BarChart3 size={16} /> Thống kê
          </Link>
          <button
            type="button"
            onClick={() => openAddPromptModal(false)}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-sm font-bold text-ink transition hover:border-brand-hover"
          >
            <Plus size={16} /> Lưu đề vào Kho chờ
          </button>
          <button
            type="button"
            onClick={() => openAddPromptModal(true)}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover hover:text-bg"
          >
            <Play size={16} /> Dán đề mới làm ngay
          </button>
        </div>
      </div>

      {/* Banner nhắc chạy Migration SQL nếu chưa có bảng */}
      {needsMigration && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-800 dark:text-amber-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold">
                Cần khởi tạo bảng IELTS Writing trong Supabase (chỉ làm 1 lần duy nhất):
              </p>
              <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
                Bấm nút bên cạnh để copy đoạn SQL tạo bảng <code>writing_prompts</code> và{" "}
                <code>writing_submissions</code> (hoặc lấy từ file{" "}
                <code>supabase/migrations/20261119_writing_module.sql</code>), dán vào{" "}
                <b>Supabase → SQL Editor → Run</b> rồi tải lại trang.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyMigrationSql}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-700"
            >
              {sqlCopied ? <Check size={14} /> : <Copy size={14} />}
              {sqlCopied ? "Đã copy SQL!" : "Copy đoạn SQL Migration"}
            </button>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold underline">
              Xem trước đoạn mã SQL
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-bg p-3 text-[11px] text-ink">
              {WRITING_MIGRATION_SQL}
            </pre>
          </details>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="p-1">
            <X size={16} />
          </button>
        </div>
      )}

      {/* SECTION 1: NHIỆM VỤ (HÔM NAY | TUẦN) */}
      <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand px-3 py-0.5 text-xs font-bold text-white">
                {missionViewTab === "today"
                  ? todaySchedule.dayLabel
                  : WEEKLY_DISCIPLINE_SCHEDULE.find(
                      (item) =>
                        item.drillFocus === effectiveDrillFocus &&
                        item.taskType === missionTaskType
                    )?.dayLabel ?? todaySchedule.dayLabel}
              </span>
              <span className="rounded-full bg-bg px-3 py-0.5 text-xs font-semibold text-muted">
                {missionMeta.recommendedMinutes} phút
              </span>
            </div>
            <h2 className="mt-2 text-lg font-bold sm:text-xl">{missionMeta.title}</h2>
            <p className="mt-0.5 text-xs text-muted">
              {missionViewTab === "today"
                ? todaySchedule.subtitle
                : missionMeta.purposeVi}
            </p>
          </div>

          {/* 2 Tab: Hôm nay | Tuần */}
          <div className="inline-flex rounded-xl border border-line bg-bg p-1">
            <button
              type="button"
              onClick={() => {
                setMissionViewTab("today");
                setSelectedWeekTaskType(null);
              }}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                missionViewTab === "today"
                  ? "bg-brand text-white"
                  : "text-muted hover:text-ink"
              }`}
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={() => setMissionViewTab("week")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                missionViewTab === "week"
                  ? "bg-brand text-white"
                  : "text-muted hover:text-ink"
              }`}
            >
              Tuần
            </button>
          </div>
        </div>

        {/* Chi tiết Lịch Tuần & Chế độ luyện tập (chỉ hiện khi bấm tab Tuần) */}
        {missionViewTab === "week" && (
          <div className="mt-4 space-y-4 border-b border-line pb-4">
            <div>
              <div className="mb-2 text-xs font-semibold text-muted">
                Lộ trình theo từng ngày trong tuần:
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {WEEKLY_DISCIPLINE_SCHEDULE.map((item) => {
                  const isToday = item.dayOfWeek === todaySchedule.dayOfWeek;
                  const isSelected =
                    item.drillFocus === selectedDrillFocus && item.taskType === missionTaskType;
                  return (
                    <button
                      key={item.dayOfWeek}
                      type="button"
                      onClick={() => {
                        setSelectedDrillFocus(item.drillFocus);
                        setSelectedWeekTaskType(item.taskType);
                      }}
                      className={`rounded-xl border p-3 text-left transition ${
                        isSelected
                          ? "border-brand bg-brand/15 text-ink"
                          : isToday
                          ? "border-brand/40 bg-bg text-ink hover:border-brand-hover"
                          : "border-line bg-bg text-muted hover:border-brand-hover/50 hover:text-ink"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-brand-hover">
                          {item.dayLabel} {isToday ? "(Hôm nay)" : ""}
                        </span>
                        <span className="text-[11px] text-muted">{item.badgeText}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs font-semibold text-ink">
                        {item.title}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-muted">
                Hoặc đổi sang dạng bài khác:
              </div>
              <div className="flex flex-wrap gap-2">
                {DRILL_FOCUS_OPTIONS.map((opt) => {
                  const active = selectedDrillFocus === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSelectedDrillFocus(opt.id);
                        setSelectedWeekTaskType(null);
                      }}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "border-brand bg-brand/15 text-brand-hover"
                          : "border-line bg-bg text-muted hover:text-ink"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Đề bài được bốc từ Kho đề chờ luyện */}
        <div className="mt-5 rounded-2xl border border-line bg-bg p-4 sm:p-5">
          {activeMissionPrompt ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowMissionPromptText((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setShowMissionPromptText((v) => !v);
                    }
                  }}
                  className="flex flex-1 cursor-pointer flex-wrap items-center gap-2"
                >
                  <span
                    className={`rounded-lg px-2.5 py-0.5 text-xs font-bold ${
                      activeMissionPrompt.task_type === "task1"
                        ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    }`}
                  >
                    {activeMissionPrompt.task_type === "task1" ? "Task 1" : "Task 2"} ·{" "}
                    {getSubTypeMeta(activeMissionPrompt.sub_type, activeMissionPrompt.task_type).shortLabel}
                  </span>
                  {activeMissionPrompt.source_name && (
                    <span className="rounded-lg bg-card px-2.5 py-0.5 text-xs font-semibold text-ink">
                      {activeMissionPrompt.source_name}
                    </span>
                  )}
                  <span className="rounded-lg bg-card px-2.5 py-0.5 text-xs text-muted">
                    {activeMissionPrompt.topic}
                  </span>
                  {activeMissionPrompt.has_ai_guide && (
                    <span className="rounded-lg bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      ⚡ Đã có dàn ý AI
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-0.5 text-xs font-semibold text-brand-hover hover:border-brand-hover">
                    {showMissionPromptText ? (
                      <>
                        Ẩn đề <ChevronUp size={13} />
                      </>
                    ) : (
                      <>
                        Xem đề <ChevronDown size={13} />
                      </>
                    )}
                  </span>
                </div>

                {matchingMissionPrompts.length > 1 && (
                  <select
                    value={activeMissionPrompt.id}
                    onChange={(e) => setSelectedMissionPromptId(Number(e.target.value))}
                    className="rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink"
                  >
                    {matchingMissionPrompts.map((p) => (
                      <option key={p.id} value={p.id}>
                        Đổi đề: {p.source_name ? `[${p.source_name}] ` : ""}
                        {p.task_type === "task1" ? "Task 1" : "Task 2"} ·{" "}
                        {getSubTypeMeta(p.sub_type, p.task_type).shortLabel} ({p.topic})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {showMissionPromptText && (
                <div className="flex flex-col gap-4 rounded-xl border border-line bg-card p-3.5 md:flex-row">
                  <div className="flex-1">
                    <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
                      {activeMissionPrompt.prompt_text}
                    </p>
                    {activeMissionPrompt.chart_notes && (
                      <p className="mt-2 text-xs text-muted">
                        Ghi chú số liệu: {activeMissionPrompt.chart_notes}
                      </p>
                    )}
                  </div>
                  {activeMissionPrompt.image_data_url && (
                    <div className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(activeMissionPrompt.image_data_url)}
                        className="group relative overflow-hidden rounded-xl border border-line bg-white p-1"
                      >
                        <img
                          src={activeMissionPrompt.image_data_url}
                          alt="Task 1 Chart"
                          className="h-28 w-44 object-contain"
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-black/65 py-1 text-center text-[10px] font-semibold text-white opacity-90 group-hover:opacity-100">
                          Bấm phóng to biểu đồ
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Target size={14} className="text-brand-hover" /> Mục tiêu: ≥{" "}
                    <b>{missionMeta.minWords} từ</b>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={14} className="text-brand-hover" /> Thời gian gợi ý:{" "}
                    <b>{missionMeta.recommendedMinutes} phút</b>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      openAddPromptModal(true, missionTaskType, effectiveDrillFocus)
                    }
                    className="rounded-full border border-line bg-card px-4 py-2 text-xs font-bold text-ink transition hover:border-brand-hover"
                  >
                    Dán đề mới làm ngay
                  </button>
                  <button
                    type="button"
                    disabled={startingSessionId === activeMissionPrompt.id}
                    onClick={() =>
                      startSessionWithPrompt(activeMissionPrompt, effectiveDrillFocus)
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg disabled:opacity-50"
                  >
                    <Play size={14} />
                    {startingSessionId === activeMissionPrompt.id
                      ? "Đang mở phòng viết..."
                      : "Bắt đầu nhiệm vụ với đề này"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-between gap-4 py-4 text-center sm:flex-row sm:text-left">
              <div>
                <div className="font-bold text-ink">
                  Kho đề chờ luyện của bạn đang trống
                </div>
                <p className="mt-1 text-xs text-muted">
                  Hãy lưu trước vài đề từ bộ Cambridge IELTS / Actual Tests (có thể dán trực tiếp ảnh biểu đồ Task 1 bằng Ctrl+V) để hệ thống gợi ý cho bạn luyện tập mỗi ngày.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openAddPromptModal(false, missionTaskType)}
                  className="rounded-full border border-line bg-card px-4 py-2 text-xs font-bold text-ink hover:border-brand-hover"
                >
                  + Thêm vào Kho đề
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openAddPromptModal(true, missionTaskType, effectiveDrillFocus)
                  }
                  className="rounded-full bg-brand px-5 py-2 text-xs font-bold text-white hover:bg-brand-hover hover:text-bg"
                >
                  Dán đề làm ngay
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 3: 3 TAB QUẢN LÝ KHOA HỌC */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("queue")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              activeTab === "queue"
                ? "bg-brand text-white"
                : "bg-card text-muted hover:text-ink"
            }`}
          >
            <Layers size={16} /> Kho đề chờ luyện ({prompts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("submissions")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              activeTab === "submissions"
                ? "bg-brand text-white"
                : "bg-card text-muted hover:text-ink"
            }`}
          >
            <FileText size={16} /> Lịch sử bài viết & Chấm chữa ({submissions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("errors")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              activeTab === "errors"
                ? "bg-brand text-white"
                : "bg-card text-muted hover:text-ink"
            }`}
          >
            <AlertTriangle size={16} /> Sổ tay lỗi sai ({errorStats.total})
          </button>
        </div>

        {/* TAB 1: KHO ĐỀ CHỜ LUYỆN */}
        {activeTab === "queue" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-60 flex-1">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo từ khoá đề bài, nguồn Cam 18, Actual Test..."
                  className="w-full rounded-xl border border-line bg-card py-2 pl-9 pr-3 text-sm"
                />
              </div>
              <select
                value={filterTask}
                onChange={(e) => setFilterTask(e.target.value as typeof filterTask)}
                className="rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold"
              >
                <option value="all">Tất cả Task (1 & 2)</option>
                <option value="task1">Task 1 (Biểu đồ / Bản đồ / Quy trình)</option>
                <option value="task2">Task 2 (Nghị luận xã hội)</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                className="rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold"
              >
                <option value="all">Mọi trạng thái</option>
                <option value="queued">Đang chờ luyện</option>
                <option value="practiced">Đã luyện</option>
                <option value="mastered">Đã thuần thục (6.5+)</option>
              </select>
              <select
                value={filterTopic}
                onChange={(e) => setFilterTopic(e.target.value)}
                className="rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold"
              >
                <option value="all">Mọi chủ đề</option>
                {TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-line bg-card p-10 text-center text-sm text-muted">
                Đang tải Kho đề chờ luyện...
              </div>
            ) : filteredPrompts.length === 0 ? (
              <div className="rounded-2xl border border-line bg-card p-10 text-center">
                <p className="font-bold text-ink">Chưa có đề bài nào khớp bộ lọc</p>
                <p className="mt-1 text-xs text-muted">
                  Bấm &ldquo;+ Lưu đề vào Kho chờ&rdquo; để lưu sẵn các đề Cambridge / Actual Test kèm ảnh biểu đồ Task 1.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredPrompts.map((p) => {
                  const subMeta = getSubTypeMeta(p.sub_type, p.task_type);
                  const defaultMicroFocus: DrillFocus =
                    p.task_type === "task1" ? "task1_overview" : "body_peel_1";
                  const isExpanded = expandedPromptIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className="flex flex-col justify-between rounded-2xl border border-line bg-card p-4 transition hover:border-brand-hover/60"
                    >
                      <div>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => togglePromptExpand(p.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              togglePromptExpand(p.id);
                            }
                          }}
                          className="flex cursor-pointer flex-wrap items-center justify-between gap-2"
                          title="Bấm để xem hoặc ẩn nội dung đề bài"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                                p.task_type === "task1"
                                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              }`}
                            >
                              {p.task_type === "task1" ? "Task 1" : "Task 2"} · {subMeta.shortLabel}
                            </span>
                            {p.source_name && (
                              <span className="rounded-lg bg-bg px-2.5 py-1 text-xs font-semibold text-ink">
                                {p.source_name}
                              </span>
                            )}
                            <span className="rounded-lg bg-bg px-2.5 py-1 text-xs text-muted">
                              {p.topic}
                            </span>
                            {p.image_data_url && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-bg px-2 py-1 text-[11px] font-semibold text-brand-hover">
                                <ImageIcon size={12} /> Có biểu đồ
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                p.status === "mastered"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : p.status === "practiced"
                                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                  : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                              }`}
                            >
                              {p.status === "mastered"
                                ? "Thuần thục"
                                : p.status === "practiced"
                                ? `Đã luyện (${p.times_practiced})`
                                : "Chờ luyện"}
                            </span>
                            <span className="inline-flex items-center gap-0.5 rounded-lg bg-bg px-2 py-1 text-[11px] font-semibold text-muted hover:text-ink">
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePrompt(p.id);
                              }}
                              className="rounded-lg p-1 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                              title="Xoá đề"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 rounded-xl border border-line bg-bg p-3.5">
                            <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
                              {p.prompt_text}
                            </p>
                            {p.image_data_url && (
                              <div className="mt-3">
                                <button
                                  type="button"
                                  onClick={() => setPreviewImageUrl(p.image_data_url)}
                                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-card p-1.5 text-xs font-semibold text-brand-hover hover:border-brand-hover"
                                >
                                  <img
                                    src={p.image_data_url}
                                    alt="Biểu đồ Task 1"
                                    className="h-12 w-20 rounded-lg bg-white object-contain"
                                  />
                                  <span className="inline-flex items-center gap-1 pr-2">
                                    <Eye size={13} /> Phóng to ảnh biểu đồ
                                  </span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                        <button
                          type="button"
                          onClick={() => togglePromptExpand(p.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-brand-hover"
                        >
                          {isExpanded ? (
                            <>
                              Ẩn nội dung đề <ChevronUp size={13} />
                            </>
                          ) : (
                            <>
                              Xem nội dung đề <ChevronDown size={13} />
                            </>
                          )}
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={startingSessionId === p.id}
                            onClick={() =>
                              startSessionWithPrompt(p, defaultMicroFocus, "daily_drill")
                            }
                            className="rounded-xl border border-line bg-bg px-3 py-1.5 text-xs font-bold text-ink transition hover:border-brand-hover"
                          >
                            Luyện đoạn ngắn (15p)
                          </button>
                          <button
                            type="button"
                            disabled={startingSessionId === p.id}
                            onClick={() => startSessionWithPrompt(p, "full", "full_essay")}
                            className="rounded-xl bg-brand px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg"
                          >
                            Viết trọn bài ({p.task_type === "task1" ? "20p" : "40p"})
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LỊCH SỬ BÀI VIẾT & CHẤM CHỮA */}
        {activeTab === "submissions" && (
          <div className="space-y-3">
            {submissions.length === 0 ? (
              <div className="rounded-2xl border border-line bg-card p-10 text-center">
                <p className="font-bold text-ink">Chưa có bài luyện viết nào</p>
                <p className="mt-1 text-xs text-muted">
                  Hãy bắt đầu nhiệm vụ viết đoạn ngắn 10–15 phút hôm nay để nhận chấm chữa chi tiết 4 tiêu chí!
                </p>
              </div>
            ) : (
              submissions.map((s) => {
                const subMeta = getSubTypeMeta(s.sub_type, s.task_type);
                const focusMeta = getDrillFocusMeta(s.drill_focus, s.task_type);
                const isGraded = s.overall_band !== null && s.overall_band !== undefined;
                return (
                  <div
                    key={s.id}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-card p-5 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                            s.task_type === "task1"
                              ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {s.task_type === "task1" ? "Task 1" : "Task 2"} · {subMeta.shortLabel}
                        </span>
                        <span className="rounded-lg bg-bg px-2.5 py-0.5 text-[11px] font-semibold text-ink">
                          {focusMeta.title}
                        </span>
                        <span className="text-xs text-muted">
                          {formatDate(s.studied_at)} · {s.word_count} từ ·{" "}
                          {Math.max(1, Math.round((s.duration_seconds || 60) / 60))} phút
                        </span>
                        {s.discipline_completed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                            <Flame size={12} /> Hoàn thành kỷ luật 3 bước
                          </span>
                        ) : isGraded ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                            ⏳ Chờ gõ lại câu sai (Bước 3)
                          </span>
                        ) : (
                          <span className="rounded-full bg-bg px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                            📝 Bản nháp chưa chấm
                          </span>
                        )}
                      </div>

                      <p className="line-clamp-2 text-sm text-ink">{s.prompt_snapshot}</p>

                      {isGraded && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                          <span className="rounded-lg bg-brand/15 px-2.5 py-1 font-extrabold text-brand-hover">
                            Overall: {Number(s.overall_band).toFixed(1)}
                          </span>
                          <span className="rounded-lg bg-bg px-2 py-1 text-muted">
                            TR/TA: <b className="text-ink">{Number(s.tr_band ?? 0).toFixed(1)}</b>
                          </span>
                          <span className="rounded-lg bg-bg px-2 py-1 text-muted">
                            CC: <b className="text-ink">{Number(s.cc_band ?? 0).toFixed(1)}</b>
                          </span>
                          <span className="rounded-lg bg-bg px-2 py-1 text-muted">
                            LR: <b className="text-ink">{Number(s.lr_band ?? 0).toFixed(1)}</b>
                          </span>
                          <span className="rounded-lg bg-bg px-2 py-1 text-muted">
                            GRA: <b className="text-ink">{Number(s.gra_band ?? 0).toFixed(1)}</b>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={`/writing/${s.id}`}
                        className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg"
                      >
                        {!isGraded
                          ? "Tiếp tục viết"
                          : !s.discipline_completed
                          ? "Gõ lại câu sai (Bước 3)"
                          : "Xem chấm chữa"}
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubmission(s.id)}
                        className="rounded-xl border border-line bg-bg p-2 text-muted hover:border-rose-500/40 hover:text-rose-500"
                        title="Xoá bài làm"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 3: SỔ TAY LỖI SAI (ERROR NOTEBOOK) */}
        {activeTab === "errors" && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-brand/30 bg-brand/10 p-4 text-xs text-ink">
              <span className="font-bold text-brand-hover">
                💡 Mẹo khoa học trước khi viết bài mới:
              </span>{" "}
              Dành 2 phút đọc lướt lại các câu bạn từng viết sai dưới đây và bản sửa chuẩn Band 6.5+ sẽ giúp não bộ chủ động tránh lặp lại đúng các lỗi đó trong bài viết hôm nay.
            </div>

            {/* Thống kê 4 nhóm lỗi */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                ["grammar", "lexical", "coherence", "task_response"] as const
              ).map((k) => {
                const count = errorStats[k];
                const pct =
                  errorStats.total > 0 ? Math.round((count / errorStats.total) * 100) : 0;
                const info = ERROR_LABELS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setFilterErrorType(filterErrorType === k ? "all" : k)
                    }
                    className={`rounded-2xl border p-4 text-left transition ${
                      filterErrorType === k
                        ? "border-brand bg-card ring-2 ring-brand/30"
                        : "border-line bg-card hover:border-brand-hover/50"
                    }`}
                  >
                    <div className="text-xs font-bold text-muted">{info.label}</div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-2xl font-extrabold text-ink">{count} lỗi</span>
                      <span className="text-xs font-bold text-brand-hover">{pct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Danh sách câu sai & bản sửa */}
            {filteredMistakes.length === 0 ? (
              <div className="rounded-2xl border border-line bg-card p-10 text-center text-sm text-muted">
                Chưa có lỗi sai nào được ghi nhận ở mục này. Khi bạn chấm bài với AI, mọi câu có lỗi sẽ tự động được trích xuất vào đây!
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMistakes.map((m) => {
                  const badge = ERROR_LABELS[m.error_type] ?? ERROR_LABELS.grammar;
                  return (
                    <div
                      key={m.id}
                      className="space-y-3 rounded-2xl border border-line bg-card p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-lg border px-2.5 py-0.5 text-xs font-bold ${badge.color}`}
                          >
                            {badge.short}
                          </span>
                          <span className="rounded-lg bg-bg px-2.5 py-0.5 text-xs font-semibold text-muted">
                            {m.taskType === "task1" ? "Task 1" : "Task 2"} · {m.topic}
                          </span>
                          <span className="text-xs text-muted">
                            Ngày {formatDate(m.studiedAt)}
                          </span>
                          {m.rewritten && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 size={12} /> Đã luyện gõ lại
                            </span>
                          )}
                        </div>
                        <Link
                          href={`/writing/${m.submissionId}`}
                          className="text-xs font-bold text-brand-hover hover:underline"
                        >
                          Mở bài viết gốc →
                        </Link>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5">
                          <div className="text-[11px] font-bold uppercase text-rose-700 dark:text-rose-300">
                            ✗ Câu gốc bạn đã viết:
                          </div>
                          <p className="mt-1 text-sm text-ink">{m.original}</p>
                          {m.explanation_vi && (
                            <p className="mt-2 text-xs text-rose-800/90 dark:text-rose-200/90">
                              <b>Lý do sai:</b> {m.explanation_vi}
                            </p>
                          )}
                        </div>

                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                          <div className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                            ✓ Bản sửa chuẩn Band 6.5+ (Sát ý gốc):
                          </div>
                          <p className="mt-1 text-sm font-semibold text-ink">{m.band65_fix}</p>
                          {m.band75_upgrade && (
                            <div className="mt-2 border-t border-emerald-500/20 pt-2 text-xs text-muted">
                              <b className="text-ink">Nâng cấp Band 7.5+:</b> {m.band75_upgrade}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* MODAL THÊM ĐỀ VÀO KHO HOẶC LÀM NGAY */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onPaste={handlePasteImage}
        >
          <form
            onSubmit={handleSubmitPromptModal}
            className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-line bg-card p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink">
                  {modalStartNow
                    ? "Dán đề thi thật & Bắt đầu viết ngay"
                    : "Lưu đề thi thật vào Kho đề chờ luyện"}
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  Nhập đề từ sách Cambridge IELTS / Actual Tests. Với Task 1, bạn có thể bấm{" "}
                  <b>Ctrl+V</b> để dán thẳng ảnh chụp màn hình biểu đồ vào cửa sổ này!
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-bg hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            {/* Chọn Task 1 / Task 2 */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setFormTaskType("task2");
                  setFormSubType("opinion");
                  if (formDrillFocus === "task1_overview" || formDrillFocus === "task1_body") {
                    setFormDrillFocus("body_peel_1");
                  }
                }}
                className={`rounded-xl border p-3 text-left transition ${
                  formTaskType === "task2"
                    ? "border-brand bg-brand/15 text-ink"
                    : "border-line bg-bg text-muted"
                }`}
              >
                <div className="text-sm font-bold">Writing Task 2</div>
                <div className="text-xs text-muted">Bài nghị luận xã hội (≥ 250 từ · 40p)</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormTaskType("task1");
                  setFormSubType("line_graph");
                  if (
                    formDrillFocus === "intro_thesis" ||
                    formDrillFocus === "body_peel_1" ||
                    formDrillFocus === "body_peel_2"
                  ) {
                    setFormDrillFocus("task1_overview");
                  }
                }}
                className={`rounded-xl border p-3 text-left transition ${
                  formTaskType === "task1"
                    ? "border-brand bg-brand/15 text-ink"
                    : "border-line bg-bg text-muted"
                }`}
              >
                <div className="text-sm font-bold">Writing Task 1</div>
                <div className="text-xs text-muted">
                  Biểu đồ / Bảng / Quy trình / Bản đồ (≥ 150 từ · 20p)
                </div>
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Dạng bài chi tiết
                </label>
                <select
                  value={formSubType}
                  onChange={(e) => setFormSubType(e.target.value as WritingSubType)}
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs font-semibold"
                >
                  {(formTaskType === "task1" ? TASK1_SUBTYPES : TASK2_SUBTYPES).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Nguồn đề (Cam / Actual)
                </label>
                <input
                  type="text"
                  value={formSourceName}
                  onChange={(e) => setFormSourceName(e.target.value)}
                  placeholder="VD: Cam 18 Test 2, Actual Q1..."
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Chủ đề</label>
                <select
                  value={formTopic}
                  onChange={(e) => setFormTopic(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs font-semibold"
                >
                  {TOPICS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {modalStartNow && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Chọn phạm vi muốn luyện ngay trong phiên này:
                </label>
                <select
                  value={formDrillFocus}
                  onChange={(e) => setFormDrillFocus(e.target.value as DrillFocus)}
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs font-bold text-brand-hover"
                >
                  {DRILL_FOCUS_OPTIONS.filter(
                    (o) => o.id === "full" || o.taskType === formTaskType
                  ).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">
                Nội dung đề bài IELTS thật (Bắt buộc) *
              </label>
              <textarea
                rows={4}
                required
                value={formPromptText}
                onChange={(e) => setFormPromptText(e.target.value)}
                placeholder={
                  formTaskType === "task1"
                    ? "The graph below gives information about... Summarise the information by selecting and reporting the main features..."
                    : "Some people believe that... To what extent do you agree or disagree?"
                }
                className="w-full rounded-xl border border-line bg-bg p-3 text-sm leading-relaxed"
              />
            </div>

            {/* Khu vực đính kèm ảnh biểu đồ Task 1 */}
            <div className="rounded-2xl border border-dashed border-line bg-bg/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-ink">
                  <ImageIcon size={16} className="text-brand-hover" />
                  Ảnh biểu đồ / bản đồ / quy trình Task 1 (Hỗ trợ Gemini Vision đọc số liệu)
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-bold text-ink hover:border-brand-hover">
                    <Upload size={13} /> Chọn file ảnh
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  {formImageDataUrl && (
                    <button
                      type="button"
                      onClick={() => setFormImageDataUrl("")}
                      className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-bold text-rose-600"
                    >
                      Xoá ảnh
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                <ClipboardPaste size={13} />
                <span>
                  Mẹo nhanh: Chụp màn hình biểu đồ (`Win+Shift+S` hoặc `Cmd+Shift+4`) rồi bấm{" "}
                  <b>Ctrl+V</b> ngay tại đây, hệ thống sẽ tự động nén nhẹ chuẩn WebP!
                </span>
              </div>

              <div className="mt-2">
                <input
                  type="text"
                  value={formImageDataUrl.startsWith("data:") ? "" : formImageDataUrl}
                  onChange={(e) => setFormImageDataUrl(e.target.value)}
                  placeholder="Hoặc dán trực tiếp đường dẫn URL hình ảnh biểu đồ (https://...)"
                  className="w-full rounded-xl border border-line bg-card px-3 py-1.5 text-xs"
                />
              </div>

              {compressingImg && (
                <p className="mt-2 text-xs font-semibold text-brand-hover">
                  Đang tối ưu và nén hình ảnh biểu đồ...
                </p>
              )}

              {formImageDataUrl && (
                <div className="mt-3 flex items-center gap-3">
                  <img
                    src={formImageDataUrl}
                    alt="Preview biểu đồ"
                    className="max-h-40 rounded-xl border border-line bg-white p-1 object-contain"
                  />
                  <div className="text-xs text-emerald-700 dark:text-emerald-300">
                    ✓ Đã đính kèm ảnh biểu đồ. Khi phân tích dàn ý hoặc chấm bài, AI Vision sẽ đọc trực tiếp số liệu từ ảnh này!
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-full border border-line bg-bg px-4 py-2 text-xs font-bold text-muted hover:text-ink"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={savingPrompt || compressingImg}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg disabled:opacity-50"
              >
                <Sparkles size={14} />
                {savingPrompt
                  ? "Đang xử lý..."
                  : modalStartNow
                  ? "Lưu đề & Mở phòng luyện viết ngay"
                  : "Lưu vào Kho đề chờ luyện"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* LIGHTBOX PHÓNG TO ẢNH BIỂU ĐỒ TASK 1 */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            className="relative max-h-[92vh] max-w-5xl overflow-auto rounded-2xl bg-white p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute right-3 top-3 rounded-full bg-black/75 p-2 text-white hover:bg-black"
            >
              <X size={18} />
            </button>
            <img
              src={previewImageUrl}
              alt="Biểu đồ Task 1 phóng to"
              className="max-h-[85vh] w-auto object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
