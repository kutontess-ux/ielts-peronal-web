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
  return word
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (part.length <= 1) return part;
      return `${part[0]} ${Array(part.length - 1).fill("_").join(" ")}`;
    })
    .join("   ");
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
