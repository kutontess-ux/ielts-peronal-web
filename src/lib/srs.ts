export type ReviewGrade = "again" | "hard" | "good" | "easy";

export type ReviewState = {
  reps: number;
  interval_days: number;
  ease: number;
};

export type ComputedReview = {
  interval_days: number;
  ease: number;
  reps: number;
  lapsesDelta: number;
  delayMs: number;
  label: string;
};

const MINUTE_MS = 60 * 1000;
const DAY_MS = 86400 * 1000;

export function computeNextReview(prev: ReviewState, grade: ReviewGrade): ComputedReview {
  const interval = Number(prev.interval_days ?? 0);
  const ease = Number(prev.ease ?? 2.5);
  const reps = Number(prev.reps ?? 0);

  if (grade === "again") {
    return {
      interval_days: 0,
      ease: Math.max(1.3, ease - 0.2),
      reps: 0,
      lapsesDelta: 1,
      delayMs: 5 * MINUTE_MS,
      label: "5 phút",
    };
  }

  if (grade === "hard") {
    return {
      interval_days: 0,
      ease: Math.max(1.3, ease - 0.15),
      reps,
      lapsesDelta: 0,
      delayMs: 10 * MINUTE_MS,
      label: "10 phút",
    };
  }

  if (grade === "good") {
    let nextInterval = 1;
    if (reps >= 2 && interval >= 1) {
      nextInterval = Math.max(3, Math.round(interval * 1.5));
    } else if (reps === 1 && interval >= 1) {
      nextInterval = Math.max(2, Math.round(interval * 1.5));
    }
    return {
      interval_days: nextInterval,
      ease,
      reps: reps + 1,
      lapsesDelta: 0,
      delayMs: nextInterval * DAY_MS,
      label: `${nextInterval} ngày`,
    };
  }

  // grade === "easy": từ mới = 2 ngày, học nhiều = 4 ngày -> 7 ngày -> tăng theo ease
  let nextInterval = 2;
  if (reps === 0 && interval < 2) {
    nextInterval = 2;
  } else if (reps === 1 || interval < 4) {
    nextInterval = 4;
  } else if (reps === 2 || interval < 7) {
    nextInterval = 7;
  } else {
    nextInterval = Math.max(8, Math.round(interval * ease * 1.2));
  }

  return {
    interval_days: nextInterval,
    ease: Math.min(3.0, ease + 0.15),
    reps: reps + 1,
    lapsesDelta: 0,
    delayMs: nextInterval * DAY_MS,
    label: `${nextInterval} ngày`,
  };
}

export async function enrollWordsInSrs(wordIds: number[]): Promise<{ enrolled: number }> {
  const uniqueIds = Array.from(new Set(wordIds)).filter((id) => Number.isFinite(id) && id > 0);
  if (uniqueIds.length === 0) return { enrolled: 0 };

  const res = await fetch("/api/reviews", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wordIds: uniqueIds }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Không chuyển được từ vào ôn tập");
  return { enrolled: Number(json.enrolled ?? 0) };
}

export async function clearAllReviews(): Promise<void> {
  const res = await fetch("/api/reviews", { method: "DELETE" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Không xoá được danh sách ôn tập");
}
