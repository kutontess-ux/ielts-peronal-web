import { cleanTerm, normKey } from "@/lib/normalize";

export type LeitnerLevel = 1 | 2 | 3 | 4 | 5;

export type LeitnerState = {
  level: number;
  level5_streak?: number;
};

export type ComputedLeitnerReview = {
  level: LeitnerLevel;
  level5_streak: number;
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
 * - Gõ SAI: tụt ngay về Level 1, hẹn 10 phút sau.
 * - Gõ ĐÚNG lại ở cuối phiên (sau khi đã sai trong phiên): giữ Level 1, hẹn 1 ngày sau.
 * - Gõ ĐÚNG bình thường: level = min(level + 1, 5); ở Level 5 tiếp tục giãn 30 -> 60 -> 90 ngày.
 */
export function computeLeitnerReview(
  prev: LeitnerState,
  isCorrect: boolean,
  isRetryInSession = false
): ComputedLeitnerReview {
  const currentLevel = clampLevel(prev.level);
  const currentStreak = Math.max(0, Number(prev.level5_streak ?? 0));

  if (!isCorrect) {
    return {
      level: 1,
      level5_streak: 0,
      lapsesDelta: 1,
      delayMs: 10 * MINUTE_MS,
      intervalDays: 0,
      label: "10 phút",
    };
  }

  if (isRetryInSession) {
    return {
      level: 1,
      level5_streak: 0,
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
