import { cleanTerm, normKey } from "@/lib/normalize";

export type LeitnerLevel = 1 | 2 | 3 | 4 | 5;

export type LeitnerState = {
  level: number;
  level5_streak?: number;
  recovery_level?: number | null;
};

export type ComputedLeitnerReview = {
  level: LeitnerLevel;
  level5_streak: number;
  recovery_level: LeitnerLevel | null;
  recovered: boolean;
  lapsesDelta: number;
  delayMs: number;
  intervalDays: number;
  label: string;
};

export type UserSettings = {
  daily_review_limit: number;
  daily_new_limit: number;
  session_size: number;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  daily_review_limit: 50,
  daily_new_limit: 15,
  session_size: 15,
};

export type NotificationSettings = {
  notify_daily_vocab: boolean;
  notify_review_due: boolean;
  notify_writing_streak: boolean;
  notify_morning: boolean;
  notify_evening: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notify_daily_vocab: true,
  notify_review_due: true,
  notify_writing_streak: true,
  notify_morning: true,
  notify_evening: true,
};

export type FullUserSettings = UserSettings & NotificationSettings;

export const DEFAULT_FULL_USER_SETTINGS: FullUserSettings = {
  ...DEFAULT_USER_SETTINGS,
  ...DEFAULT_NOTIFICATION_SETTINGS,
};

export const LEITNER_INTERVAL_DAYS: Record<LeitnerLevel, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

const MINUTE_MS = 60 * 1000;
const DAY_MS = 86400 * 1000;

export function clampLevel(level: number): LeitnerLevel {
  const n = Math.round(Number(level) || 1);
  if (n <= 1) return 1;
  if (n >= 5) return 5;
  return n as LeitnerLevel;
}

/**
 * Tính toán trạng thái Leitner 5 cấp độ tiếp theo:
 * - Gõ SAI: tụt tạm về Level 1, hẹn 10 phút sau. Nếu đang ở Level >= 2 (và chưa trong trạng thái chờ phục hồi), lưu recovery_level = level - 1. Nếu sai tiếp khi đang chờ phục hồi thì mất quyền phục hồi (recovery_level = null).
 * - Gõ ĐÚNG khi có recovery_level: phục hồi về recovery_level với chu kỳ chuẩn tương ứng và xóa recovery_level.
 * - Gõ ĐÚNG lại ở cuối phiên (không có recovery_level): giữ Level 1, hẹn 1 ngày sau.
 * - Gõ ĐÚNG bình thường: level = min(level + 1, 5); ở Level 5 tiếp tục giãn 30 -> 60 -> 90 ngày.
 */
export function computeLeitnerReview(
  prev: LeitnerState,
  isCorrect: boolean,
  isRetryInSession = false
): ComputedLeitnerReview {
  const currentLevel = clampLevel(prev.level);
  const currentStreak = Math.max(0, Number(prev.level5_streak ?? 0));
  const currentRecovery =
    prev.recovery_level != null && Number.isFinite(Number(prev.recovery_level))
      ? clampLevel(Number(prev.recovery_level))
      : null;

  if (!isCorrect) {
    const nextRecovery =
      currentRecovery !== null
        ? null
        : currentLevel >= 2
          ? clampLevel(currentLevel - 1)
          : null;
    return {
      level: 1,
      level5_streak: 0,
      recovery_level: nextRecovery,
      recovered: false,
      lapsesDelta: 1,
      delayMs: 10 * MINUTE_MS,
      intervalDays: 0,
      label: "10 phút",
    };
  }

  if (currentRecovery !== null) {
    const days = LEITNER_INTERVAL_DAYS[currentRecovery];
    return {
      level: currentRecovery,
      level5_streak: 0,
      recovery_level: null,
      recovered: true,
      lapsesDelta: 0,
      delayMs: days * DAY_MS,
      intervalDays: days,
      label: `${days} ngày`,
    };
  }

  if (isRetryInSession) {
    return {
      level: 1,
      level5_streak: 0,
      recovery_level: null,
      recovered: false,
      lapsesDelta: 0,
      delayMs: 1 * DAY_MS,
      intervalDays: 1,
      label: "1 ngày",
    };
  }

  if (currentLevel < 5) {
    const nextLevel = (currentLevel + 1) as LeitnerLevel;
    const days = LEITNER_INTERVAL_DAYS[nextLevel];
    return {
      level: nextLevel,
      level5_streak: 0,
      recovery_level: null,
      recovered: false,
      lapsesDelta: 0,
      delayMs: days * DAY_MS,
      intervalDays: days,
      label: `${days} ngày`,
    };
  }

  // Đang ở Level 5 và trả lời ĐÚNG tiếp -> giãn chu kỳ 60 -> 90 ngày
  const nextStreak = currentStreak + 1;
  const days = nextStreak === 1 ? 60 : 90;
  return {
    level: 5,
    level5_streak: nextStreak,
    recovery_level: null,
    recovered: false,
    lapsesDelta: 0,
    delayMs: days * DAY_MS,
    intervalDays: days,
    label: `${days} ngày`,
  };
}

/**
 * Kiểm tra đáp án Active Recall:
 * Không phân biệt hoa/thường, bỏ khoảng trắng/dấu câu thừa, chấp nhận biến thể Anh/Mỹ (analyse/analyze, color/colour).
 */
export function checkRecallAnswer(userInput: string, targetWord: string): boolean {
  const a = cleanTerm(userInput);
  const b = cleanTerm(targetWord);
  if (!a || !b) return false;
  if (a === b) return true;
  return normKey(a) === normKey(b);
}

/**
 * Tạo gợi ý chữ cái đầu cho từng từ (ví dụ "analyse" -> "a _ _ _ _ _ _")
 */
export function getWordHint(word: string): string {
  return getProgressiveWordHint(word, 1);
}

/**
 * Tạo gợi ý 3 nấc cho từ tiếng Anh:
 * - level 1: chỉ chữ cái đầu mỗi từ
 * - level 2: chữ đầu + chữ cuối + ~40% chữ ở giữa
 * - level 3: ~70% chữ cái
 */
export function getProgressiveWordHint(word: string, level: 1 | 2 | 3): string {
  return word
    .trim()
    .split(/\s+/)
    .map((part) => {
      const chars = Array.from(part);
      if (chars.length <= 1) return part;
      return chars
        .map((ch, idx) => {
          if (!/[a-zA-Z]/.test(ch)) return ch;
          if (idx === 0) return ch;
          if (level === 1) return "_";
          if (level === 2) {
            if (idx === chars.length - 1 && chars.length >= 4) return ch;
            return idx % 3 === 0 ? ch : "_";
          }
          // level 3
          if (idx === chars.length - 1) return ch;
          return idx % 3 !== 2 ? ch : "_";
        })
        .join(" ");
    })
    .join("   ");
}

/**
 * Che từ mục tiêu trong câu ví dụ thành "_____" để làm ngữ cảnh gợi ý.
 */
export function maskWordInExample(example: string, targetWord: string): string {
  if (!example.trim() || !targetWord.trim()) return example;
  const escaped = targetWord.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}(?:s|es|ed|d|ing)?\\b`, "gi");
  const masked = example.replace(re, "_____");
  return masked;
}

function levenshtein(a: string, b: string): number {
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

export type RecallMatchKind = "exact" | "synonym" | "typo" | "wrong";

/**
 * Kiểm tra mềm đáp án Active Recall:
 * - "exact": khớp từ mục tiêu (hoặc biến thể Anh/Mỹ)
 * - "synonym": khớp một từ đồng nghĩa đã lưu trong kho
 * - "typo": gõ sai 1 ký tự với từ dài >= 5 chữ
 * - "wrong": sai hoàn toàn
 */
export function checkRecallSoftMatch(
  userInput: string,
  targetWord: string,
  synonyms: string[] = []
): RecallMatchKind {
  if (checkRecallAnswer(userInput, targetWord)) return "exact";
  const cleanedInput = cleanTerm(userInput);
  if (!cleanedInput) return "wrong";

  for (const syn of synonyms) {
    if (syn && checkRecallAnswer(cleanedInput, syn)) {
      return "synonym";
    }
  }

  const cleanedTarget = cleanTerm(targetWord);
  if (cleanedTarget.length >= 5 && levenshtein(cleanedInput, cleanedTarget) === 1) {
    return "typo";
  }

  return "wrong";
}

export type VietnameseMeaningMatchResult = {
  status: "exact" | "partial" | "wrong";
  isCorrect: boolean;
  matchedCount: number;
  totalTargetWords: number;
  matchPct: number;
  bestClause: string;
  userWordCount: number;
  clauseBreakdown: { word: string; matched: boolean }[];
  usedAccentInsensitive: boolean;
};

function stripViDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalizeViText(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[“”"'‘’`()\[\]{}<>.,;:!?/\\|—–\-_+*=~@#$%^&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeVi(s: string): string[] {
  const normalized = normalizeViText(s);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function splitVietnameseMeaningClauses(meaningVi: string, definitionEn = ""): string[] {
  const source = meaningVi.trim() || definitionEn.trim();
  if (!source) return [];

  const rawParts = source
    .split(/[,;\n/|]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (text: string) => {
    const tokens = tokenizeVi(text);
    if (tokens.length === 0) return;
    const key = tokens.join(" ");
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(text.trim());
    }
  };

  for (const part of rawParts) {
    pushUnique(part);
    const withoutParens = part.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    if (withoutParens && withoutParens !== part) {
      pushUnique(withoutParens);
    }
  }

  return candidates;
}

/**
 * Đối chiếu câu trả lời nghĩa tiếng Việt của người dùng với nghĩa trong từ điển:
 * - Tách nhiều vế nghĩa (ngăn cách bởi dấu phẩy, chấm phẩy, gạch chéo)
 * - Hỗ trợ cả gõ có dấu đầy đủ lẫn không dấu
 * - Trả về số từ trùng, % khớp theo vế gần nhất và danh sách từ khớp/thiếu
 */
export function checkVietnameseMeaningMatch(
  userInput: string,
  meaningVi: string,
  definitionEn = ""
): VietnameseMeaningMatchResult {
  const clauses = splitVietnameseMeaningClauses(meaningVi, definitionEn);
  const fallbackClause = clauses[0] ?? (meaningVi.trim() || definitionEn.trim());
  const userTokens = tokenizeVi(userInput);

  if (clauses.length === 0 || userTokens.length === 0) {
    const fallbackTokens = tokenizeVi(fallbackClause);
    return {
      status: "wrong",
      isCorrect: false,
      matchedCount: 0,
      totalTargetWords: fallbackTokens.length,
      matchPct: 0,
      bestClause: fallbackClause,
      userWordCount: userTokens.length,
      clauseBreakdown: fallbackTokens.map((word) => ({ word, matched: false })),
      usedAccentInsensitive: false,
    };
  }

  const userExactSet = new Set(userTokens);
  const userNoAccentSet = new Set(userTokens.map(stripViDiacritics));

  type CandidateScore = {
    clause: string;
    totalTargetWords: number;
    matchedCount: number;
    exactAccentCount: number;
    matchPct: number;
    isCorrect: boolean;
    clauseBreakdown: { word: string; matched: boolean }[];
  };

  let best: CandidateScore | null = null;

  for (const clause of clauses) {
    const clauseTokens = tokenizeVi(clause);
    if (clauseTokens.length === 0) continue;

    let matchedCount = 0;
    let exactAccentCount = 0;
    const clauseBreakdown = clauseTokens.map((word) => {
      const exactHit = userExactSet.has(word);
      const noAccentHit = exactHit || userNoAccentSet.has(stripViDiacritics(word));
      if (noAccentHit) matchedCount += 1;
      if (exactHit) exactAccentCount += 1;
      return { word, matched: noAccentHit };
    });

    const totalTargetWords = clauseTokens.length;
    const matchPct = Math.round((matchedCount / totalTargetWords) * 100);
    const isFullMatch = matchedCount === totalTargetWords;
    const isThresholdMatch =
      totalTargetWords >= 3 && matchedCount >= 2 && matchPct >= 65;
    const antiSpamOk =
      userTokens.length <= Math.max(6, totalTargetWords * 2) ||
      matchedCount / userTokens.length >= 0.35;
    const isCorrect = (isFullMatch || isThresholdMatch) && antiSpamOk;

    const current: CandidateScore = {
      clause,
      totalTargetWords,
      matchedCount,
      exactAccentCount,
      matchPct,
      isCorrect,
      clauseBreakdown,
    };

    if (!best) {
      best = current;
      continue;
    }

    if (current.isCorrect !== best.isCorrect) {
      if (current.isCorrect) best = current;
      continue;
    }
    if (current.matchPct !== best.matchPct) {
      if (current.matchPct > best.matchPct) best = current;
      continue;
    }
    if (current.matchedCount !== best.matchedCount) {
      if (current.matchedCount > best.matchedCount) best = current;
      continue;
    }
    if (current.exactAccentCount > best.exactAccentCount) {
      best = current;
    }
  }

  if (!best) {
    return {
      status: "wrong",
      isCorrect: false,
      matchedCount: 0,
      totalTargetWords: 0,
      matchPct: 0,
      bestClause: fallbackClause,
      userWordCount: userTokens.length,
      clauseBreakdown: [],
      usedAccentInsensitive: false,
    };
  }

  const status: VietnameseMeaningMatchResult["status"] = best.isCorrect
    ? "exact"
    : best.matchedCount > 0
      ? "partial"
      : "wrong";

  return {
    status,
    isCorrect: best.isCorrect,
    matchedCount: best.matchedCount,
    totalTargetWords: best.totalTargetWords,
    matchPct: best.matchPct,
    bestClause: best.clause,
    userWordCount: userTokens.length,
    clauseBreakdown: best.clauseBreakdown,
    usedAccentInsensitive:
      best.matchedCount > 0 && best.exactAccentCount < best.matchedCount,
  };
}

function maskViWordFirstChar(word: string): string {
  const chars = Array.from(word);
  if (chars.length <= 1) return word;
  return `${chars[0]}${"_".repeat(chars.length - 1)}`;
}

function maskViWordFirstAndLast(word: string): string {
  const chars = Array.from(word);
  if (chars.length <= 2) return maskViWordFirstChar(word);
  return `${chars[0]}${"_".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

/**
 * Tạo gợi ý 3 nấc theo từng từ cho nghĩa tiếng Việt:
 * - Nấc 1: chỉ hiện chữ cái đầu của mỗi tiếng (ví dụ "s___  l___ (2 từ)")
 * - Nấc 2: mở khoảng 50% số từ đầu (ví dụ "sinh  l___ (2 từ)")
 * - Nấc 3: mở gần hết các từ, giữ từ cuối (ví dụ "sinh  l_i (2 từ)" hoặc "mang lại lợi  n____ (4 từ)")
 */
export function getVietnameseMeaningHint(
  meaningVi: string,
  level: 1 | 2 | 3,
  definitionEn = ""
): string {
  const clauses = splitVietnameseMeaningClauses(meaningVi, definitionEn);
  const firstClause = clauses[0] ?? (meaningVi.trim() || definitionEn.trim());
  const tokens = tokenizeVi(firstClause);
  if (tokens.length === 0) return "";

  const total = tokens.length;
  const masked = tokens
    .map((part, idx) => {
      if (level === 1) {
        return maskViWordFirstChar(part);
      }
      if (level === 2) {
        if (total === 1) return maskViWordFirstAndLast(part);
        const revealCount = Math.max(1, Math.floor(total / 2));
        return idx < revealCount ? part : maskViWordFirstChar(part);
      }
      // level === 3
      if (total === 1) return maskViWordFirstAndLast(part);
      if (idx < total - 1) return part;
      return total === 2 ? maskViWordFirstAndLast(part) : maskViWordFirstChar(part);
    })
    .join("  ");

  return `${masked} (${total} từ)`;
}

export type EnrollResult = {
  enrolled: number;
  deferred: number;
  totalRequested: number;
  scheduledFromDay?: string;
};

export async function enrollWordsInSrs(wordIds: number[]): Promise<EnrollResult> {
  const uniqueIds = Array.from(new Set(wordIds)).filter((id) => Number.isFinite(id) && id > 0);
  if (uniqueIds.length === 0) return { enrolled: 0, deferred: 0, totalRequested: 0 };

  const res = await fetch("/api/reviews", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wordIds: uniqueIds }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Không chuyển được từ vào ôn tập");
  return {
    enrolled: Number(json.enrolled ?? 0),
    deferred: Number(json.deferred ?? 0),
    totalRequested: Number(json.totalRequested ?? uniqueIds.length),
    scheduledFromDay: json.scheduledFromDay,
  };
}

export async function clearAllReviews(): Promise<void> {
  const res = await fetch("/api/reviews", { method: "DELETE" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Không xoá được danh sách ôn tập");
}
