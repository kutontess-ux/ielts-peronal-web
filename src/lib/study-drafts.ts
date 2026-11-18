"use client";

import type { StudySet } from "@/lib/study-sets";

export type StudyDraftMode = "flashcards" | "learn" | "test";

export type InProgressStudyDraft = {
  setId: string;
  title: string;
  mode: StudyDraftMode;
  modeLabel: string;
  progressPct: number;
  progressText: string;
  updatedAt: number;
  href: string;
};

export function loadStudyDraft<T>(key: string | null): T | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveStudyDraft<T>(key: string | null, data: T): void {
  if (!key || typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // bỏ qua nếu trình duyệt chặn hoặc đầy localStorage
  }
}

export function clearStudyDraft(key: string | null): void {
  if (!key || typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // bỏ qua
  }
}

export function clearStudyDraftByMode(setId: string, mode: StudyDraftMode): void {
  clearStudyDraft(`ielts_draft_${mode}_v1_${setId}`);
}

type StoredFlashcardsDraft = {
  deckIds?: number[];
  idx?: number;
  updatedAt?: number;
};

type StoredLearnDraft = {
  learnMode?: "mixed" | "choice" | "type";
  sessionWordIds?: number[];
  queue?: unknown[];
  phase1PassedIds?: number[];
  masteredIds?: number[];
  missedIds?: number[];
  updatedAt?: number;
};

type StoredTestDraft = {
  sections?: Array<
    | { id: string; kind: "trueFalse" | "multipleChoice" | "written" }
    | { id: string; kind: "matching"; pairs: { pairId: string }[] }
  >;
  totalQuestions?: number;
  tfAnswers?: Record<string, boolean | null>;
  mcAnswers?: Record<string, string>;
  writtenAnswers?: Record<string, string>;
  matchAnswers?: Record<string, Record<string, string>>;
  updatedAt?: number;
};

export function getInProgressStudyDrafts(sets: StudySet[]): InProgressStudyDraft[] {
  if (typeof window === "undefined" || sets.length === 0) return [];
  const drafts: InProgressStudyDraft[] = [];

  for (const set of sets) {
    if (!set.id || set.wordIds.length === 0) continue;

    // 1. Thẻ ghi nhớ (Flashcards)
    const fc = loadStudyDraft<StoredFlashcardsDraft>(
      `ielts_draft_flashcards_v1_${set.id}`
    );
    if (
      fc &&
      Array.isArray(fc.deckIds) &&
      fc.deckIds.length > 0 &&
      typeof fc.idx === "number" &&
      fc.idx > 0 &&
      fc.idx < fc.deckIds.length
    ) {
      const total = fc.deckIds.length;
      const pct = Math.max(1, Math.min(99, Math.round((fc.idx / total) * 100)));
      drafts.push({
        setId: set.id,
        title: set.title,
        mode: "flashcards",
        modeLabel: "Thẻ ghi nhớ",
        progressPct: pct,
        progressText: `Đã sắp xếp ${fc.idx}/${total} thẻ`,
        updatedAt: fc.updatedAt ?? 0,
        href: `/vocab?setId=${encodeURIComponent(set.id)}&mode=flashcards`,
      });
    }

    // 2. Học (Learn)
    const ln = loadStudyDraft<StoredLearnDraft>(
      `ielts_draft_learn_v1_${set.id}`
    );
    if (
      ln &&
      Array.isArray(ln.queue) &&
      ln.queue.length > 0 &&
      Array.isArray(ln.sessionWordIds) &&
      ln.sessionWordIds.length > 0
    ) {
      const passed = ln.phase1PassedIds?.length ?? 0;
      const mastered = ln.masteredIds?.length ?? 0;
      const missed = ln.missedIds?.length ?? 0;
      if (passed > 0 || mastered > 0 || missed > 0) {
        const totalMilestones =
          ln.learnMode === "mixed"
            ? ln.sessionWordIds.length * 2
            : ln.sessionWordIds.length;
        const completedMilestones =
          ln.learnMode === "mixed" ? passed + mastered : mastered;
        const pct = Math.max(
          1,
          Math.min(
            99,
            Math.round((completedMilestones / Math.max(1, totalMilestones)) * 100)
          )
        );
        drafts.push({
          setId: set.id,
          title: set.title,
          mode: "learn",
          modeLabel: "Học",
          progressPct: pct,
          progressText: `Đã hoàn thành ${pct}% số câu hỏi`,
          updatedAt: ln.updatedAt ?? 0,
          href: `/vocab?setId=${encodeURIComponent(set.id)}&mode=learn`,
        });
      }
    }

    // 3. Kiểm tra (Test)
    const ts = loadStudyDraft<StoredTestDraft>(
      `ielts_draft_test_v1_${set.id}`
    );
    if (
      ts &&
      Array.isArray(ts.sections) &&
      ts.sections.length > 0 &&
      (ts.totalQuestions ?? 0) > 0
    ) {
      let answered = 0;
      for (const sec of ts.sections) {
        if (sec.kind === "trueFalse") {
          const v = ts.tfAnswers?.[sec.id];
          if (v !== undefined && v !== null) answered++;
        } else if (sec.kind === "multipleChoice") {
          if (ts.mcAnswers?.[sec.id]) answered++;
        } else if (sec.kind === "written") {
          if ((ts.writtenAnswers?.[sec.id] ?? "").trim().length > 0) answered++;
        } else if (sec.kind === "matching") {
          const bm = ts.matchAnswers?.[sec.id] ?? {};
          for (const p of sec.pairs) {
            if (bm[p.pairId]) answered++;
          }
        }
      }
      if (answered > 0) {
        const pct = Math.max(
          1,
          Math.min(
            100,
            Math.round((answered / Math.max(1, ts.totalQuestions ?? 1)) * 100)
          )
        );
        drafts.push({
          setId: set.id,
          title: set.title,
          mode: "test",
          modeLabel: "Kiểm tra",
          progressPct: pct,
          progressText: `Đã hoàn thành ${pct}% số câu hỏi`,
          updatedAt: ts.updatedAt ?? 0,
          href: `/vocab?setId=${encodeURIComponent(set.id)}&mode=test`,
        });
      }
    }
  }

  return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
}
