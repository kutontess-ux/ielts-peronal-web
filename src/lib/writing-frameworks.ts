import { cleanTerm, normKey, possibleLemmas } from "@/lib/normalize";

export type WritingTaskType = "task1" | "task2";
export type TaskType = WritingTaskType;

export type Task1SubType =
  | "line_graph"
  | "bar_chart"
  | "pie_chart"
  | "table"
  | "process"
  | "map"
  | "mixed";

export type Task2SubType =
  | "opinion"
  | "discussion"
  | "problem_solution"
  | "two_part";

export type WritingSubType = Task1SubType | Task2SubType;
export type SubType = WritingSubType;

export type WritingMode = "daily_drill" | "full_essay";

export type DrillFocus =
  | "intro_thesis"
  | "body_peel_1"
  | "body_peel_2"
  | "task1_overview"
  | "task1_body"
  | "full";

export type SubTypeMeta = {
  id: WritingSubType;
  taskType: WritingTaskType;
  label: string;
  shortLabel: string;
  desc: string;
  minWords: number;
  recommendedMinutes: number;
  keyTip: string;
};

export type DailyDisciplineScheduleItem = {
  dayOfWeek: number; // 1 = Thứ 2 ... 6 = Thứ 7, 0 = Chủ nhật
  dayLabel: string;
  shortDay: string;
  mode: WritingMode;
  drillFocus: DrillFocus;
  taskType: WritingTaskType;
  defaultSubType: WritingSubType;
  title: string;
  subtitle: string;
  minWords: number;
  recommendedMinutes: number;
  badgeText: string;
};

export type BlueprintStep = {
  key: string;
  label: string;
  sentenceRole: string;
  placeholder: string;
  guideVi: string;
  connectors: string[];
  templates: string[];
  minWordsHint?: number;
};

export type StepBlueprint = {
  drillFocus: DrillFocus;
  taskType: WritingTaskType;
  title: string;
  purposeVi: string;
  minWords: number;
  recommendedMinutes: number;
  steps: BlueprintStep[];
  subTypeNotes?: Partial<Record<WritingSubType, string>>;
};

export type WritingStreakDay = {
  date: string; // YYYY-MM-DD (VN timezone)
  label: string; // DD/MM
  completed: boolean;
  submissionsCount: number;
  count: number;
};

export type WritingStreakSummary = {
  currentStreak: number;
  longestStreak: number;
  completedToday: boolean;
  hasWrittenToday: boolean;
  hasGradedToday: boolean;
  totalCompletedDays: number;
  last14Days: WritingStreakDay[];
};

export type OutlineGuideResult = {
  task_analysis: {
    main_topic_vi: string;
    required_parts_vi: string[];
    common_pitfalls_vi: string[];
    suggested_stance_vi: string;
  };
  step_guides: {
    intro_paraphrase_hint: string;
    thesis_or_overview_hint: string;
    body1_peel_hint: string;
    body2_peel_hint: string;
    conclusion_hint?: string;
  };
  topic_collocations: {
    phrase: string;
    meaning_vi: string;
    example_sentence: string;
    cefr_level: "B2" | "C1";
  }[];
  grammar_structures: {
    pattern_name: string;
    formula: string;
    applied_example: string;
    explanation_vi: string;
  }[];
};

export type SentenceCorrectionItem = {
  original: string;
  has_error: boolean;
  error_type: "grammar" | "lexical" | "coherence" | "task_response" | "none";
  explanation_vi: string;
  band65_fix: string;
  band75_upgrade: string;
};

export type RecommendedVocabItem = {
  lemma: string;
  norm_key?: string;
  ipa: string;
  pos: string;
  meaning_vi: string;
  definition_en: string;
  example: string;
  cefr_level: "B1" | "B2" | "C1" | "C2";
  topic: string;
  is_awl: boolean;
  collocations: string[];
  synonyms: string[];
  existsInBank?: boolean;
};

export type WritingGradeResult = {
  overall_band: number;
  tr_band: number;
  cc_band: number;
  lr_band: number;
  gra_band: number;
  summary_vi: string;
  criteria_feedback: {
    tr_vi: { strengths: string; improvements: string };
    cc_vi: { strengths: string; improvements: string };
    lr_vi: { strengths: string; improvements: string };
    gra_vi: { strengths: string; improvements: string };
  };
  sentence_corrections: SentenceCorrectionItem[];
  model_version: string;
  recommended_vocab: RecommendedVocabItem[];
};

export const TASK1_SUBTYPES: SubTypeMeta[] = [
  {
    id: "line_graph",
    taskType: "task1",
    label: "Biểu đồ đường (Line Graph)",
    shortLabel: "Line Graph",
    desc: "Mô tả xu hướng tăng/giảm, dao động và điểm giao nhau theo thời gian.",
    minWords: 150,
    recommendedMinutes: 20,
    keyTip: "Overview cần nêu rõ xu hướng chung của các đường và đường nào luôn cao nhất/tăng mạnh nhất (không đưa số liệu cụ thể vào Overview).",
  },
  {
    id: "bar_chart",
    taskType: "task1",
    label: "Biểu đồ cột (Bar Chart)",
    shortLabel: "Bar Chart",
    desc: "So sánh độ lớn giữa các nhóm đối tượng hoặc sự thay đổi qua các năm.",
    minWords: 150,
    recommendedMinutes: 20,
    keyTip: "Gom các cột có cùng đặc điểm (cao nhất vs thấp nhất, hoặc nhóm tăng vs nhóm giảm) thành 2 đoạn Body rõ ràng.",
  },
  {
    id: "pie_chart",
    taskType: "task1",
    label: "Biểu đồ tròn (Pie Chart)",
    shortLabel: "Pie Chart",
    desc: "Mô tả tỷ trọng phần trăm và sự dịch chuyển cơ cấu giữa các thành phần.",
    minWords: 150,
    recommendedMinutes: 20,
    keyTip: "Dùng đa dạng cụm từ chỉ tỷ lệ: account for, constitute, make up, represent, a quarter/a third/the vast majority.",
  },
  {
    id: "table",
    taskType: "task1",
    label: "Bảng số liệu (Table)",
    shortLabel: "Table",
    desc: "Chọn lọc và so sánh các con số nổi bật nhất từ bảng nhiều hàng/cột.",
    minWords: 150,
    recommendedMinutes: 20,
    keyTip: "Tuyệt đối không liệt kê mọi con số! Hãy chọn giá trị lớn nhất, nhỏ nhất, chênh lệch lớn nhất và ngoại lệ.",
  },
  {
    id: "process",
    taskType: "task1",
    label: "Quy trình (Process Diagram)",
    shortLabel: "Process",
    desc: "Mô tả tuần tự các bước sản xuất hoặc vòng đời tự nhiên.",
    minWords: 150,
    recommendedMinutes: 20,
    keyTip: "Overview bắt buộc nêu tổng số bước + điểm bắt đầu & kết thúc. Dùng thì hiện tại đơn bị động (is extracted, is heated) và từ nối thứ tự.",
  },
  {
    id: "map",
    taskType: "task1",
    label: "Bản đồ (Map Comparison)",
    shortLabel: "Map",
    desc: "So sánh sự thay đổi không gian, quy hoạch đô thị giữa 2 thời điểm.",
    minWords: 150,
    recommendedMinutes: 20,
    keyTip: "Dùng từ vựng phương hướng (to the north of, in the southwestern corner) và động từ biến đổi (was demolished, gave way to, was expanded).",
  },
  {
    id: "mixed",
    taskType: "task1",
    label: "Biểu đồ kết hợp (Mixed Charts)",
    shortLabel: "Mixed Charts",
    desc: "Kết hợp 2 loại biểu đồ (VD: Line + Bar hoặc Pie + Table).",
    minWords: 150,
    recommendedMinutes: 20,
    keyTip: "Overview gồm 2 câu: Câu 1 tóm tắt biểu đồ 1, Câu 2 tóm tắt biểu đồ 2. Body 1 phân tích biểu đồ 1, Body 2 phân tích biểu đồ 2.",
  },
];

export const TASK2_SUBTYPES: SubTypeMeta[] = [
  {
    id: "opinion",
    taskType: "task2",
    label: "Quan điểm (Agree / Disagree)",
    shortLabel: "Agree/Disagree",
    desc: "Đề hỏi To what extent do you agree or disagree? Cần giữ lập trường xuyên suốt.",
    minWords: 250,
    recommendedMinutes: 40,
    keyTip: "Nêu rõ lập trường ngay ở Thesis Statement (hoàn toàn đồng ý/phản đối hoặc đồng ý một phần nhưng nghiêng về 1 phía rõ rệt).",
  },
  {
    id: "discussion",
    taskType: "task2",
    label: "Thảo luận 2 chiều (Discuss Both Views)",
    shortLabel: "Discuss Both Views",
    desc: "Đề yêu cầu Discuss both views and give your own opinion.",
    minWords: 250,
    recommendedMinutes: 40,
    keyTip: "Body 1 phân tích khách quan quan điểm mình ít nghiêng hơn; Body 2 phân tích quan điểm mình ủng hộ và lồng ghép ý kiến cá nhân.",
  },
  {
    id: "problem_solution",
    taskType: "task2",
    label: "Vấn đề & Giải pháp (Causes / Solutions)",
    shortLabel: "Problem & Solution",
    desc: "Phân tích nguyên nhân/hệ quả của một hiện tượng và đề xuất giải pháp.",
    minWords: 250,
    recommendedMinutes: 40,
    keyTip: "Giải pháp ở Body 2 phải giải quyết trực tiếp nguyên nhân đã nêu ở Body 1, nêu rõ chủ thể thực hiện (chính phủ, nhà trường, cá nhân).",
  },
  {
    id: "two_part",
    taskType: "task2",
    label: "Câu hỏi 2 vế (Two-part Question)",
    shortLabel: "Two-part Question",
    desc: "Đề nêu 1 nhận định kèm 2 câu hỏi độc lập cần trả lời đầy đủ.",
    minWords: 250,
    recommendedMinutes: 40,
    keyTip: "Thesis Statement trả lời ngắn gọn cả 2 câu hỏi; Body 1 giải quyết trọn vẹn câu hỏi 1; Body 2 giải quyết trọn vẹn câu hỏi 2.",
  },
];

export const ALL_SUBTYPES: SubTypeMeta[] = [...TASK2_SUBTYPES, ...TASK1_SUBTYPES];

export function getSubTypeMeta(subType?: string | null, fallbackTaskType: WritingTaskType = "task2"): SubTypeMeta {
  const found = ALL_SUBTYPES.find((s) => s.id === subType);
  if (found) return found;
  return fallbackTaskType === "task1" ? TASK1_SUBTYPES[0] : TASK2_SUBTYPES[0];
}

export const getSubtypeMeta = getSubTypeMeta;

export const WEEKLY_DISCIPLINE_SCHEDULE: DailyDisciplineScheduleItem[] = [
  {
    dayOfWeek: 1,
    dayLabel: "Thứ Hai",
    shortDay: "T2",
    mode: "daily_drill",
    drillFocus: "intro_thesis",
    taskType: "task2",
    defaultSubType: "opinion",
    title: "Task 2 – Mở bài & Luận điểm chính (Intro + Thesis)",
    subtitle: "Viết 2–3 câu Mở bài chuẩn học thuật: Paraphrase đề + Nêu Thesis Statement rõ ràng.",
    minWords: 50,
    recommendedMinutes: 10,
    badgeText: "Micro-Writing · 10 phút",
  },
  {
    dayOfWeek: 2,
    dayLabel: "Thứ Ba",
    shortDay: "T3",
    mode: "daily_drill",
    drillFocus: "body_peel_1",
    taskType: "task2",
    defaultSubType: "opinion",
    title: "Task 2 – Thân bài lập luận 1 theo khung PEEL",
    subtitle: "Rèn tư duy triển khai đoạn văn chặt chẽ: Point → Explain → Example → Link.",
    minWords: 90,
    recommendedMinutes: 15,
    badgeText: "Micro-Writing · 15 phút",
  },
  {
    dayOfWeek: 3,
    dayLabel: "Thứ Tư",
    shortDay: "T4",
    mode: "daily_drill",
    drillFocus: "task1_overview",
    taskType: "task1",
    defaultSubType: "line_graph",
    title: "Task 1 – Mở bài & Đoạn Tổng quan (Intro + Overview)",
    subtitle: "Phần quyết định điểm Band 6.5+ Task Achievement: Paraphrase đề + Tóm tắt 2 đặc điểm nổi bật nhất.",
    minWords: 60,
    recommendedMinutes: 12,
    badgeText: "Micro-Writing · 12 phút",
  },
  {
    dayOfWeek: 4,
    dayLabel: "Thứ Năm",
    shortDay: "T5",
    mode: "daily_drill",
    drillFocus: "body_peel_2",
    taskType: "task2",
    defaultSubType: "discussion",
    title: "Task 2 – Thân bài lập luận 2 & Kết bài (PEEL 2 + Conclusion)",
    subtitle: "Phát triển góc nhìn phản biện / luận điểm thứ 2 và chốt lại toàn bài sắc bén.",
    minWords: 100,
    recommendedMinutes: 15,
    badgeText: "Micro-Writing · 15 phút",
  },
  {
    dayOfWeek: 5,
    dayLabel: "Thứ Sáu",
    shortDay: "T6",
    mode: "daily_drill",
    drillFocus: "task1_body",
    taskType: "task1",
    defaultSubType: "bar_chart",
    title: "Task 1 – Phân tích & So sánh số liệu/quy trình (Body Details)",
    subtitle: "Luyện cách trích dẫn số liệu, so sánh hơn/kém/gấp bội và dùng từ nối tương phản.",
    minWords: 90,
    recommendedMinutes: 15,
    badgeText: "Micro-Writing · 15 phút",
  },
  {
    dayOfWeek: 6,
    dayLabel: "Thứ Bảy",
    shortDay: "T7",
    mode: "full_essay",
    drillFocus: "full",
    taskType: "task2",
    defaultSubType: "opinion",
    title: "Full Task 2 – Viết trọn bài nghị luận hoàn chỉnh",
    subtitle: "Tổng hợp kỹ năng cả tuần vào bài viết 4 đoạn hoàn chỉnh (Mở bài, 2 Body PEEL, Kết bài) có bấm giờ.",
    minWords: 250,
    recommendedMinutes: 40,
    badgeText: "Full Practice · 40 phút",
  },
  {
    dayOfWeek: 0,
    dayLabel: "Chủ Nhật",
    shortDay: "CN",
    mode: "full_essay",
    drillFocus: "full",
    taskType: "task1",
    defaultSubType: "line_graph",
    title: "Full Task 1 – Viết trọn bài báo cáo biểu đồ/quy trình",
    subtitle: "Hoàn thành báo cáo Task 1 trọn vẹn 4 đoạn (Intro, Overview, Body 1, Body 2) trong 20 phút.",
    minWords: 150,
    recommendedMinutes: 20,
    badgeText: "Full Practice · 20 phút",
  },
];

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function toVnDateKey(nowMsOrIso: number | string = Date.now()): string {
  const ms = typeof nowMsOrIso === "number" ? nowMsOrIso : Date.parse(nowMsOrIso);
  const safeMs = Number.isFinite(ms) ? ms : Date.now();
  const vn = new Date(safeMs + VN_OFFSET_MS);
  const y = vn.getUTCFullYear();
  const m = String(vn.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vn.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getTodaySchedule(nowMs = Date.now()): DailyDisciplineScheduleItem {
  const vn = new Date(nowMs + VN_OFFSET_MS);
  const dow = vn.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  return (
    WEEKLY_DISCIPLINE_SCHEDULE.find((item) => item.dayOfWeek === dow) ??
    WEEKLY_DISCIPLINE_SCHEDULE[0]
  );
}

export const STEP_BLUEPRINTS: Record<string, StepBlueprint> = {
  intro_thesis: {
    drillFocus: "intro_thesis",
    taskType: "task2",
    title: "Khung Mở bài & Luận điểm chính (Task 2 Intro + Thesis)",
    purposeVi:
      "Mở bài hiệu quả chỉ cần 2 câu súc tích (45–60 từ): Câu 1 giới thiệu lại chủ đề bằng từ đồng nghĩa/cấu trúc khác; Câu 2 trả lời thẳng câu hỏi đề bài.",
    minWords: 50,
    recommendedMinutes: 10,
    steps: [
      {
        key: "paraphrase",
        label: "Câu 1: Paraphrase bối cảnh đề bài (Background)",
        sentenceRole: "Viết lại mệnh đề của đề bài bằng từ vựng/cấu trúc câu của bạn, không chép nguyên xi quá 3 từ liên tiếp.",
        placeholder: "While some people contend that ..., others firmly believe that ...",
        guideVi: "Xác định chủ đề chính trong đề, đổi động từ thành danh từ (hoặc ngược lại) và dùng cấu trúc đối lập/nhượng bộ.",
        connectors: [
          "It is widely debated whether",
          "In recent decades, there has been a growing trend towards",
          "While some people argue that",
          "In the contemporary era, the issue of",
        ],
        templates: [
          "While some people contend that [Quan điểm A], others firmly believe that [Quan điểm B].",
          "In recent years, the question of whether [Chủ đề đề bài] has sparked considerable public debate.",
        ],
        minWordsHint: 22,
      },
      {
        key: "thesis",
        label: "Câu 2: Nêu Thesis Statement & Định hướng bài viết",
        sentenceRole: "Khẳng định rõ quan điểm của bạn (hoặc trả lời trực tiếp câu hỏi đề bài) và hé lộ 2 lý do chính.",
        placeholder: "From my perspective, I wholeheartedly agree with ... because ...",
        guideVi: "Không viết chung chung kiểu 'This essay will discuss both sides'. Hãy nêu rõ bạn nghiêng về bên nào hoặc nêu tóm tắt 2 ý lớn.",
        connectors: [
          "From my perspective,",
          "In my view, I am convinced that",
          "While both arguments have merit, I believe that",
          "This essay will examine the primary causes of this issue before proposing viable solutions.",
        ],
        templates: [
          "From my perspective, I wholeheartedly agree with the latter view because [Lý do 1] and [Lý do 2].",
          "Although [Quan điểm phụ] is understandable, I maintain that [Quan điểm chính của bạn].",
        ],
        minWordsHint: 25,
      },
    ],
  },
  body_peel_1: {
    drillFocus: "body_peel_1",
    taskType: "task2",
    title: "Khung Thân bài 1 theo công thức PEEL (Task 2 Body 1)",
    purposeVi:
      "Mỗi đoạn Body chuẩn Band 6.5+ cần đi trọn vẹn 1 luận điểm sâu sắc theo 4 mắt xích: Point (Luận điểm) → Explain (Giải thích nhân quả) → Example (Ví dụ thực tế) → Link (Chốt ý).",
    minWords: 90,
    recommendedMinutes: 15,
    steps: [
      {
        key: "point",
        label: "Câu 1 (Point): Câu chủ đề nêu Luận điểm 1",
        sentenceRole: "Nêu trực tiếp lý do/luận điểm chính của cả đoạn văn ngay ở câu đầu tiên.",
        placeholder: "First and foremost, one compelling reason why ... is that ...",
        guideVi: "Giám khảo đọc câu đầu tiên phải biết ngay cả đoạn này chứng minh điều gì.",
        connectors: [
          "First and foremost, one compelling argument in favor of",
          "On the one hand, the primary reason why",
          "To begin with, a major driving force behind this trend is",
        ],
        templates: [
          "First and foremost, the primary reason why [Chủ đề] is that [Luận điểm chính 1].",
          "On the one hand, proponents of [Chủ đề] argue that it plays a pivotal role in [Lợi ích chính].",
        ],
        minWordsHint: 20,
      },
      {
        key: "explain",
        label: "Câu 2–3 (Explain): Giải thích cơ chế Nguyên nhân → Kết quả",
        sentenceRole: "Trả lời câu hỏi 'Tại sao luận điểm trên lại đúng?' và 'Nó dẫn đến hệ quả gì tiếp theo?'.",
        placeholder: "This can be primarily attributed to the fact that ... When ..., it enables ...",
        guideVi: "Đừng chuyển sang ý mới! Hãy đào sâu giải thích cơ chế tác động (A dẫn đến B, B dẫn đến C).",
        connectors: [
          "This can be primarily attributed to the fact that",
          "To be more specific, when",
          "As a result, individuals are more likely to",
          "Without this,",
        ],
        templates: [
          "This can be primarily attributed to the fact that [Giải thích nguyên nhân], which directly allows [Kết quả].",
          "To be more specific, when [Điều kiện/Hành động xảy ra], it inevitably leads to [Hệ quả tích cực/tiêu cực].",
        ],
        minWordsHint: 35,
      },
      {
        key: "example",
        label: "Câu 4 (Example): Dẫn chứng cụ thể hóa lập luận",
        sentenceRole: "Đưa ra một trường hợp thực tế, nhóm đối tượng cụ thể hoặc xu hướng xã hội để minh họa cho phần Explain.",
        placeholder: "For instance, in many metropolitan areas, ...",
        guideVi: "Không bịa số liệu giả kiểu 'Theo nghiên cứu Đại học Harvard 87.3%...'. Hãy lấy ví dụ thực tế phổ quát.",
        connectors: [
          "For instance,",
          "Take ... as a prime example, where",
          "A clear illustration of this can be seen in",
        ],
        templates: [
          "For instance, in many rapidly developing countries, [Đối tượng cụ thể] have adopted [Giải pháp/Xu hướng], resulting in [Kết quả rõ rệt].",
        ],
        minWordsHint: 20,
      },
      {
        key: "link",
        label: "Câu 5 (Link): Chốt lại tác động & Liên kết về đề bài",
        sentenceRole: "Khẳng định lại luận điểm vừa chứng minh có ý nghĩa như thế nào đối với câu hỏi của đề.",
        placeholder: "Therefore, it is undeniable that ...",
        guideVi: "1 câu ngắn gọn khép lại đoạn văn và khóa chặt mạch lập luận.",
        connectors: [
          "Therefore, it is undeniable that",
          "Consequently, this clearly demonstrates why",
          "Thus, the long-term benefits of ... are indisputable.",
        ],
        templates: [
          "Therefore, this clearly illustrates why [Luận điểm 1] is a crucial factor to consider.",
        ],
        minWordsHint: 15,
      },
    ],
  },
  body_peel_2: {
    drillFocus: "body_peel_2",
    taskType: "task2",
    title: "Khung Thân bài 2 & Kết bài (Task 2 PEEL 2 + Conclusion)",
    purposeVi:
      "Triển khai luận điểm thứ 2 (hoặc góc nhìn đối lập) theo khung PEEL và viết đoạn Kết bài tóm lược sắc gọn không lặp từ.",
    minWords: 100,
    recommendedMinutes: 15,
    steps: [
      {
        key: "point_2",
        label: "Câu 1 (Point 2): Câu chủ đề đoạn Thân bài 2",
        sentenceRole: "Mở ra luận điểm thứ 2 (bổ sung hoặc phản biện lại đoạn 1 tùy dạng bài).",
        placeholder: "On the other hand, I believe that ... / Furthermore, another significant factor is ...",
        guideVi: "Dùng từ nối chuyển đoạn mượt mà (On the other hand cho bài Thảo luận; Furthermore/Another key aspect cho bài Bổ sung).",
        connectors: [
          "On the other hand, there are compelling reasons why",
          "Furthermore, another significant factor to consider is that",
          "Turning to possible solutions, governments and individuals must",
        ],
        templates: [
          "On the other hand, I side with those who argue that [Luận điểm 2 / Quan điểm của bạn].",
          "Furthermore, another pivotal aspect is that [Luận điểm 2].",
        ],
        minWordsHint: 20,
      },
      {
        key: "explain_2",
        label: "Câu 2–3 (Explain 2): Phân tích sâu & Giải thích lý do",
        sentenceRole: "Giải thích tại sao luận điểm 2 lại quan trọng hoặc giải pháp này hoạt động thế nào.",
        placeholder: "This is largely because ... By doing so, ...",
        guideVi: "Sử dụng câu điều kiện (If..., it would...) hoặc mệnh đề quan hệ (..., which helps mitigate...) để ăn điểm GRA.",
        connectors: [
          "This is largely because",
          "By implementing such measures,",
          "If this issue is left unaddressed, it could",
        ],
        templates: [
          "This is largely because [Nguyên nhân/Cơ chế], which in turn fosters [Kết quả].",
        ],
        minWordsHint: 35,
      },
      {
        key: "example_2",
        label: "Câu 4 (Example 2): Ví dụ minh họa thực tiễn",
        sentenceRole: "Cụ thể hóa lập luận 2 bằng một tình huống đời thực.",
        placeholder: "For example, ...",
        guideVi: "Giữ ví dụ gắn chặt với câu Explain ngay phía trước.",
        connectors: [
          "For example,",
          "A notable example of this is",
          "Specifically, when",
        ],
        templates: [
          "For example, when [Chủ thể] invest heavily in [Hành động], they consistently achieve [Kết quả].",
        ],
        minWordsHint: 20,
      },
      {
        key: "conclusion",
        label: "Câu 5–6 (Conclusion): Đoạn Kết bài tóm lược toàn bài",
        sentenceRole: "Tóm tắt lại 2 luận điểm chính bằng cách diễn đạt mới và khẳng định lại Thesis.",
        placeholder: "In conclusion, although ..., I maintain that ...",
        guideVi: "Bắt đầu bằng In conclusion, và tuyệt đối không đưa thêm luận điểm mới chưa từng nhắc ở Body.",
        connectors: [
          "In conclusion, while",
          "In summary, although both views hold some validity,",
          "To conclude, it is evident that",
        ],
        templates: [
          "In conclusion, although [Ý nhượng bộ], I firmly believe that [Quan điểm chính] due to [Tóm tắt lý do 1 & 2].",
        ],
        minWordsHint: 25,
      },
    ],
  },
  task1_overview: {
    drillFocus: "task1_overview",
    taskType: "task1",
    title: "Khung Mở bài & Đoạn Tổng quan Task 1 (Intro + Overview)",
    purposeVi:
      "Trong IELTS Writing Task 1, không có Overview rõ ràng sẽ không thể vượt qua Band 5.0 ở tiêu chí Task Achievement. Hãy viết 1 câu Intro + 2 câu Overview thật chuẩn!",
    minWords: 60,
    recommendedMinutes: 12,
    steps: [
      {
        key: "t1_intro",
        label: "Câu 1 (Introduction): Paraphrase câu hỏi biểu đồ",
        sentenceRole: "Giới thiệu biểu đồ thể hiện cái gì (What), ở đâu (Where), và trong khoảng thời gian nào (When).",
        placeholder: "The given line graph illustrates changes in ... between ... and ...",
        guideVi: "Đổi 'shows' thành 'illustrates / compares / depicts'; đổi 'from X to Y' thành 'between X and Y' hoặc 'over a X-year period'.",
        connectors: [
          "The given chart illustrates",
          "The provided table compares the proportion of",
          "The diagram depicts the step-by-step process of",
          "The two maps illustrate the transformation of",
        ],
        templates: [
          "The given [loại biểu đồ] compares [đối tượng đo lường] across [các nhóm/quốc gia] between [Năm A] and [Năm B].",
        ],
        minWordsHint: 20,
      },
      {
        key: "t1_overview_trend",
        label: "Câu 2 (Overview – Ý 1): Xu hướng chung / Tổng số giai đoạn",
        sentenceRole: "Nêu bức tranh toàn cảnh đầu tiên khi nhìn vào biểu đồ (nhóm nào tăng, nhóm nào giảm; hoặc quy trình có mấy bước).",
        placeholder: "Overall, it is immediately apparent that while ... experienced an upward trend, ... declined steadily.",
        guideVi: "KHÔNG đưa số liệu cụ thể (%, con số lẻ) vào Overview. Hãy nhìn điểm đầu và điểm cuối để rút ra xu hướng.",
        connectors: [
          "Overall, it is immediately apparent that",
          "Overall, what stands out from the chart is that",
          "Overall, the process consists of ... main stages, beginning with",
        ],
        templates: [
          "Overall, it is immediately apparent that while [Nhóm A] experienced a significant upward trend, [Nhóm B] witnessed a steady decline over the period.",
        ],
        minWordsHint: 22,
      },
      {
        key: "t1_overview_high",
        label: "Câu 3 (Overview – Ý 2): Điểm cực trị / Đối tượng chiếm ưu thế nhất",
        sentenceRole: "Chỉ ra đường/cột nào luôn cao nhất, thấp nhất hoặc có sự thay đổi劇 liệt nhất.",
        placeholder: "Another salient feature is that ... accounted for the largest share throughout the period.",
        guideVi: "Kết hợp Xu hướng (Trend) + Độ lớn (Magnitude/Highest) sẽ tạo nên đoạn Overview hoàn hảo Band 7.0+.",
        connectors: [
          "Another salient feature is that",
          "Furthermore, it is notable that",
          "Additionally, the most dramatic change took place in",
        ],
        templates: [
          "Another salient feature is that [Đối tượng X] consistently recorded the highest figures throughout the surveyed period.",
        ],
        minWordsHint: 18,
      },
    ],
  },
  task1_body: {
    drillFocus: "task1_body",
    taskType: "task1",
    title: "Khung Phân tích & So sánh Chi tiết Task 1 (Body 1 & Body 2)",
    purposeVi:
      "Chia số liệu/quy trình thành 2 đoạn Body khoa học: trích dẫn con số chính xác kèm cấu trúc so sánh (hơn kém, gấp đôi, tương phản).",
    minWords: 90,
    recommendedMinutes: 15,
    steps: [
      {
        key: "t1_body_1",
        label: "Đoạn 1 (Body Paragraph 1): Nhóm số liệu nổi bật / Giai đoạn nửa đầu",
        sentenceRole: "Mô tả chi tiết nhóm có số liệu cao nhất hoặc có xu hướng tăng, trích dẫn điểm đầu – điểm đỉnh – điểm cuối.",
        placeholder: "Looking at the details, in the first year, ... stood at ..., after which it rose considerably to ...",
        guideVi: "Luôn đi kèm số liệu trong ngoặc hoặc sau giới từ (at 45%, to 120 million, by 15%).",
        connectors: [
          "Looking at the details, regarding",
          "In terms of the first category,",
          "At the beginning of the period, ... stood at",
          "In the initial stage of the process,",
        ],
        templates: [
          "Looking at the details, in [Năm đầu], [Đối tượng A] stood at [Số liệu], after which it surged dramatically to reach a peak of [Số liệu] in [Năm].",
        ],
        minWordsHint: 45,
      },
      {
        key: "t1_body_2",
        label: "Đoạn 2 (Body Paragraph 2): Nhóm tương phản / Giai đoạn nửa sau",
        sentenceRole: "So sánh với các nhóm còn lại (giảm, đi ngang, thấp nhất) hoặc các bước hoàn thiện cuối cùng.",
        placeholder: "By contrast, the figure for ... followed an opposite pattern, dropping from ... to ...",
        guideVi: "Sử dụng từ nối tương phản (By contrast, Conversely, Meanwhile, Whereas) để ăn điểm Coherence & Cohesion.",
        connectors: [
          "By contrast, the figure for",
          "Conversely, ... experienced a downward trend,",
          "Meanwhile, ... remained relatively stable at around",
          "Subsequently, in the final stages,",
        ],
        templates: [
          "By contrast, the figure for [Đối tượng B] followed an opposite pattern, dropping steadily from [Số liệu 1] to [Số liệu 2] by the end of the period.",
        ],
        minWordsHint: 45,
      },
    ],
  },
  full_task2: {
    drillFocus: "full",
    taskType: "task2",
    title: "Khung Bài viết Hoàn chỉnh IELTS Writing Task 2 (4 Đoạn chuẩn)",
    purposeVi:
      "Cấu trúc 4 đoạn tiêu chuẩn cho bài thi thật (≥ 250 từ trong 40 phút): Introduction (2 câu) → Body 1 PEEL (4–5 câu) → Body 2 PEEL (4–5 câu) → Conclusion (1–2 câu).",
    minWords: 250,
    recommendedMinutes: 40,
    steps: [
      {
        key: "intro",
        label: "Đoạn 1: Mở bài (Introduction – Paraphrase + Thesis Statement)",
        sentenceRole: "2 câu (40–55 từ): Câu 1 viết lại chủ đề đề bài; Câu 2 khẳng định quan điểm & định hướng 2 đoạn thân bài.",
        placeholder: "In recent years, ... From my perspective, ...",
        guideVi: "Dành tối đa 5 phút cho Mở bài. Đi thẳng vào trọng tâm câu hỏi.",
        connectors: [
          "It is often argued that",
          "While some people maintain that",
          "From my perspective, I firmly believe that",
        ],
        templates: [
          "While some people argue that [Quan điểm A], I firmly believe that [Quan điểm B] because [Lý do 1] and [Lý do 2].",
        ],
        minWordsHint: 45,
      },
      {
        key: "body1",
        label: "Đoạn 2: Thân bài 1 (Body Paragraph 1 – Khung PEEL)",
        sentenceRole: "4–5 câu (90–110 từ): Point 1 → Explain → Example → Link.",
        placeholder: "First and foremost, ... This is because ... For instance, ... Therefore, ...",
        guideVi: "Triển khai sâu 1 luận điểm chính kèm ví dụ cụ thể.",
        connectors: [
          "On the one hand,",
          "First and foremost,",
          "This can be attributed to the fact that",
          "For instance,",
          "Consequently,",
        ],
        templates: [
          "First and foremost, [Luận điểm 1]. This is primarily because [Giải thích]. For instance, [Ví dụ thực tế]. Consequently, [Chốt ý].",
        ],
        minWordsHint: 90,
      },
      {
        key: "body2",
        label: "Đoạn 3: Thân bài 2 (Body Paragraph 2 – Khung PEEL)",
        sentenceRole: "4–5 câu (90–110 từ): Point 2 → Explain → Example → Link.",
        placeholder: "On the other hand, / Furthermore, ... This is largely due to ... For example, ...",
        guideVi: "Phát triển luận điểm thứ 2 (hoặc phân tích chiều thứ 2 và khẳng định quan điểm cá nhân).",
        connectors: [
          "On the other hand,",
          "Furthermore, another key factor is that",
          "To illustrate,",
          "As a result,",
        ],
        templates: [
          "Furthermore, another significant aspect is that [Luận điểm 2]. Specifically, [Giải thích]. For example, [Dẫn chứng].",
        ],
        minWordsHint: 90,
      },
      {
        key: "conclusion",
        label: "Đoạn 4: Kết bài (Conclusion – Tóm lược & Khẳng định)",
        sentenceRole: "1–2 câu (30–45 từ): Tóm tắt lại 2 ý chính bằng từ vựng khác và chốt lại quan điểm.",
        placeholder: "In conclusion, although ..., I maintain that ...",
        guideVi: "Không bao giờ bỏ trống Kết bài! Dù còn 2 phút cuối cũng phải viết 1 câu In conclusion trọn vẹn.",
        connectors: [
          "In conclusion, while",
          "In summary, it is evident that",
          "To conclude, despite",
        ],
        templates: [
          "In conclusion, while [Nhượng bộ], I maintain that [Khẳng định lại quan điểm chính].",
        ],
        minWordsHint: 30,
      },
    ],
  },
  full_task1: {
    drillFocus: "full",
    taskType: "task1",
    title: "Khung Báo cáo Hoàn chỉnh IELTS Writing Task 1 (4 Đoạn chuẩn)",
    purposeVi:
      "Cấu trúc 4 đoạn chuẩn cho bài báo cáo Task 1 (≥ 150 từ trong 20 phút): Introduction → Overview (2 câu) → Body 1 → Body 2.",
    minWords: 150,
    recommendedMinutes: 20,
    steps: [
      {
        key: "intro",
        label: "Đoạn 1: Mở bài (Introduction – Paraphrase đề bài)",
        sentenceRole: "1 câu (20–30 từ): Viết lại câu giới thiệu biểu đồ bằng từ đồng nghĩa.",
        placeholder: "The given chart illustrates ...",
        guideVi: "Không sao chép nguyên câu đề bài.",
        connectors: [
          "The given chart illustrates",
          "The provided table compares",
          "The diagram depicts how",
        ],
        templates: [
          "The given [loại biểu đồ] illustrates changes in [đối tượng] across [nhóm] from [Năm] to [Năm].",
        ],
        minWordsHint: 25,
      },
      {
        key: "overview",
        label: "Đoạn 2: Tổng quan (Overview – Xu hướng chính & Điểm nổi bật)",
        sentenceRole: "2 câu (35–45 từ): Nêu xu hướng tổng thể và đối tượng cao nhất/thay đổi mạnh nhất (không nêu số liệu lẻ).",
        placeholder: "Overall, it is clear that ... Additionally, ...",
        guideVi: "Đoạn quan trọng nhất để đạt 6.5+ Task Achievement.",
        connectors: [
          "Overall, it is immediately apparent that",
          "Furthermore, a salient feature is that",
        ],
        templates: [
          "Overall, it is clear that while [Nhóm A] increased significantly, [Nhóm B] saw a downward trend. Additionally, [Đối tượng X] remained the highest throughout.",
        ],
        minWordsHint: 35,
      },
      {
        key: "body1",
        label: "Đoạn 3: Thân bài 1 (Body Detail 1 – Nhóm số liệu/giai đoạn 1)",
        sentenceRole: "3–4 câu (45–60 từ): Phân tích kèm số liệu cụ thể của nhóm 1.",
        placeholder: "Looking at the details, in ..., ... stood at ...",
        guideVi: "Nêu rõ số liệu năm đầu, năm giữa/đỉnh và năm cuối.",
        connectors: [
          "Looking at the details,",
          "Regarding the first group,",
          "Initially, ... stood at",
        ],
        templates: [
          "Looking at the details, [Đối tượng A] started at [Số liệu] in [Năm], before rising sharply to [Số liệu] at the end of the period.",
        ],
        minWordsHint: 45,
      },
      {
        key: "body2",
        label: "Đoạn 4: Thân bài 2 (Body Detail 2 – Nhóm số liệu/giai đoạn 2 & So sánh)",
        sentenceRole: "3–4 câu (45–60 từ): Phân tích nhóm còn lại và đặt trong sự tương quan so sánh.",
        placeholder: "By contrast, the figure for ...",
        guideVi: "Dùng các cấu trúc so sánh (twice as high as, overtaken by, in stark contrast to).",
        connectors: [
          "By contrast,",
          "Meanwhile, the figure for",
          "In the subsequent stages,",
        ],
        templates: [
          "By contrast, [Đối tượng B] experienced a steady decline from [Số liệu 1] to [Số liệu 2], whereas [Đối tượng C] fluctuated mildly around [Số liệu].",
        ],
        minWordsHint: 45,
      },
    ],
  },
};

export const DRILL_FOCUS_OPTIONS: {
  id: DrillFocus;
  taskType: WritingTaskType;
  mode: WritingMode;
  label: string;
  shortLabel: string;
  minWords: number;
  recommendedMinutes: number;
}[] = [
  {
    id: "intro_thesis",
    taskType: "task2",
    mode: "daily_drill",
    label: "Task 2: Mở bài & Thesis (10p · ≥50 từ)",
    shortLabel: "T2 Intro + Thesis",
    minWords: 50,
    recommendedMinutes: 10,
  },
  {
    id: "body_peel_1",
    taskType: "task2",
    mode: "daily_drill",
    label: "Task 2: Thân bài 1 khung PEEL (15p · ≥90 từ)",
    shortLabel: "T2 Body PEEL 1",
    minWords: 90,
    recommendedMinutes: 15,
  },
  {
    id: "body_peel_2",
    taskType: "task2",
    mode: "daily_drill",
    label: "Task 2: Thân bài 2 & Kết bài (15p · ≥100 từ)",
    shortLabel: "T2 PEEL 2 + Kết",
    minWords: 100,
    recommendedMinutes: 15,
  },
  {
    id: "task1_overview",
    taskType: "task1",
    mode: "daily_drill",
    label: "Task 1: Mở bài & Overview (12p · ≥60 từ)",
    shortLabel: "T1 Intro + Overview",
    minWords: 60,
    recommendedMinutes: 12,
  },
  {
    id: "task1_body",
    taskType: "task1",
    mode: "daily_drill",
    label: "Task 1: Phân tích số liệu Body (15p · ≥90 từ)",
    shortLabel: "T1 Body Details",
    minWords: 90,
    recommendedMinutes: 15,
  },
  {
    id: "full",
    taskType: "task2",
    mode: "full_essay",
    label: "Viết trọn bài Full Essay (20p Task 1 / 40p Task 2)",
    shortLabel: "Full Essay",
    minWords: 250,
    recommendedMinutes: 40,
  },
];

export function getBlueprintForSession(
  taskType: WritingTaskType,
  drillFocus: DrillFocus,
  subType?: WritingSubType | string | null
): StepBlueprint {
  const resolvedTask: WritingTaskType =
    subType && TASK1_SUBTYPES.some((s) => s.id === subType) ? "task1" : taskType;
  if (drillFocus === "full") {
    return resolvedTask === "task1" ? STEP_BLUEPRINTS.full_task1 : STEP_BLUEPRINTS.full_task2;
  }
  if (drillFocus === "task1_overview" || drillFocus === "task1_body") {
    return STEP_BLUEPRINTS[drillFocus];
  }
  return STEP_BLUEPRINTS[drillFocus] ?? STEP_BLUEPRINTS.body_peel_1;
}

export function getDrillFocusMeta(drillFocus: DrillFocus, taskType: WritingTaskType = "task2") {
  const bp = getBlueprintForSession(taskType, drillFocus);
  return {
    id: drillFocus,
    taskType: bp.taskType,
    title: bp.title,
    minWords: bp.minWords,
    recommendedMinutes: bp.recommendedMinutes,
  };
}

export function countWords(text?: string | null): number {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function detectUsedTargetWords(essayContent: string, targetWords: string[]): string[] {
  if (!essayContent || !essayContent.trim() || !targetWords?.length) return [];
  const cleanedEssay = cleanTerm(essayContent);
  const rawTokens = essayContent
    .toLowerCase()
    .split(/[^a-zA-Z0-9'-]+/)
    .filter(Boolean);

  const essayForms = new Set<string>();
  for (const token of rawTokens) {
    essayForms.add(normKey(token));
    for (const candidate of possibleLemmas(token)) {
      essayForms.add(candidate);
    }
  }

  const used: string[] = [];
  for (const word of targetWords) {
    const cleanTarget = cleanTerm(word);
    if (!cleanTarget) continue;
    const targetNorm = normKey(cleanTarget);

    if (cleanTarget.includes(" ")) {
      if (cleanedEssay.includes(cleanTarget) || cleanedEssay.includes(targetNorm)) {
        used.push(word);
      }
      continue;
    }

    if (essayForms.has(targetNorm)) {
      used.push(word);
      continue;
    }

    const targetLemmas = possibleLemmas(cleanTarget);
    if (targetLemmas.some((l) => essayForms.has(l))) {
      used.push(word);
    }
  }
  return used;
}

function simpleEditDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = tmp;
    }
  }
  return dp[n];
}

export function isRewriteMatched(userInput: string, targetSentence: string): boolean {
  const a = normKey(userInput);
  const b = normKey(targetSentence);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.length >= 25 && Math.abs(a.length - b.length) <= 3) {
    return simpleEditDistance(a, b) <= 2;
  }
  return false;
}

export function computeWritingStreak(
  submissions: {
    studied_at?: string | null;
    created_at?: string | null;
    discipline_completed?: boolean | null;
    word_count?: number | null;
    overall_band?: number | null;
  }[],
  nowMs = Date.now()
): WritingStreakSummary {
  const todayKey = toVnDateKey(nowMs);
  const yesterdayKey = toVnDateKey(nowMs - 86400 * 1000);

  const countByDate = new Map<string, number>();
  const completedDates = new Set<string>();
  let hasWrittenToday = false;
  let hasGradedToday = false;

  for (const sub of submissions ?? []) {
    const rawDate = (sub.studied_at ?? "").slice(0, 10);
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : sub.created_at
      ? toVnDateKey(sub.created_at)
      : "";
    if (!dateKey) continue;

    countByDate.set(dateKey, (countByDate.get(dateKey) ?? 0) + 1);
    if (dateKey === todayKey) {
      if ((sub.word_count ?? 0) >= 20) hasWrittenToday = true;
      if (sub.overall_band !== null && sub.overall_band !== undefined) hasGradedToday = true;
    }
    if (sub.discipline_completed) {
      completedDates.add(dateKey);
      if (dateKey === todayKey) {
        hasWrittenToday = true;
        hasGradedToday = true;
      }
    }
  }

  const completedToday = completedDates.has(todayKey);

  // Tính chuỗi ngày liên tiếp hiện tại
  let currentStreak = 0;
  let cursorMs = completedToday ? nowMs : completedDates.has(yesterdayKey) ? nowMs - 86400 * 1000 : -1;
  if (cursorMs > 0) {
    while (true) {
      const k = toVnDateKey(cursorMs);
      if (completedDates.has(k)) {
        currentStreak++;
        cursorMs -= 86400 * 1000;
      } else {
        break;
      }
    }
  }

  // Tính kỷ lục chuỗi ngày dài nhất
  const sortedDates = Array.from(completedDates).sort();
  let longestStreak = 0;
  let running = 0;
  let prevMs: number | null = null;
  for (const dStr of sortedDates) {
    const curMs = Date.parse(`${dStr}T00:00:00Z`);
    if (prevMs !== null && Math.round((curMs - prevMs) / (86400 * 1000)) === 1) {
      running += 1;
    } else {
      running = 1;
    }
    if (running > longestStreak) longestStreak = running;
    prevMs = curMs;
  }

  // Lịch sử 14 ngày gần nhất (từ cũ -> mới)
  const last14Days: WritingStreakDay[] = [];
  for (let i = 13; i >= 0; i--) {
    const dayMs = nowMs - i * 86400 * 1000;
    const dKey = toVnDateKey(dayMs);
    const [, m, d] = dKey.split("-");
    const c = countByDate.get(dKey) ?? 0;
    last14Days.push({
      date: dKey,
      label: `${d}/${m}`,
      completed: completedDates.has(dKey),
      submissionsCount: c,
      count: c,
    });
  }

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    completedToday,
    hasWrittenToday,
    hasGradedToday,
    totalCompletedDays: completedDates.size,
    last14Days,
  };
}

export const WRITING_MIGRATION_SQL = `-- Chạy đoạn SQL này 1 lần trong Supabase > SQL Editor:
create table if not exists public.writing_prompts (
  id                bigint generated always as identity primary key,
  user_id           uuid references auth.users(id) on delete cascade,
  task_type         text not null check (task_type in ('task1', 'task2')),
  sub_type          text not null default 'opinion' check (
    sub_type in (
      'opinion', 'discussion', 'problem_solution', 'two_part',
      'line_graph', 'bar_chart', 'pie_chart', 'table', 'process', 'map', 'mixed'
    )
  ),
  title             text not null,
  source_name       text,
  topic             text default 'Other',
  prompt_text       text not null,
  image_data_url    text,
  chart_notes       text,
  ai_guide_json     jsonb,
  status            text not null default 'queued' check (status in ('queued', 'practiced', 'mastered')),
  times_practiced   int not null default 0,
  last_practiced_at timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists writing_prompts_user_status_idx
  on public.writing_prompts (user_id, status, created_at desc);

create table if not exists public.writing_submissions (
  id                       bigint generated always as identity primary key,
  user_id                  uuid references auth.users(id) on delete cascade,
  prompt_id                bigint references public.writing_prompts(id) on delete set null,
  mode                     text not null default 'daily_drill' check (mode in ('daily_drill', 'full_essay')),
  drill_focus              text not null default 'full' check (
    drill_focus in ('intro_thesis', 'body_peel_1', 'body_peel_2', 'task1_overview', 'task1_body', 'full')
  ),
  task_type                text not null check (task_type in ('task1', 'task2')),
  sub_type                 text not null default 'opinion',
  topic                    text default 'Other',
  prompt_snapshot          text not null,
  image_snapshot           text,
  target_words             text[] not null default '{}',
  used_target_words        text[] not null default '{}',
  step_drafts_json         jsonb not null default '{}'::jsonb,
  content                  text not null default '',
  word_count               int not null default 0,
  duration_seconds         int not null default 0,
  overall_band             numeric(3,1),
  tr_band                  numeric(3,1),
  cc_band                  numeric(3,1),
  lr_band                  numeric(3,1),
  gra_band                 numeric(3,1),
  feedback_json            jsonb,
  rewritten_sentences_json jsonb not null default '{}'::jsonb,
  discipline_completed     boolean not null default false,
  studied_at               date not null default current_date,
  created_at               timestamptz not null default now()
);
create index if not exists writing_submissions_user_studied_idx
  on public.writing_submissions (user_id, studied_at desc, created_at desc);
create index if not exists writing_submissions_prompt_idx
  on public.writing_submissions (prompt_id);

alter table public.writing_prompts     enable row level security;
alter table public.writing_submissions enable row level security;

drop policy if exists "writing_prompts_own_all" on public.writing_prompts;
create policy "writing_prompts_own_all"
  on public.writing_prompts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "writing_submissions_own_all" on public.writing_submissions;
create policy "writing_submissions_own_all"
  on public.writing_submissions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';`;
