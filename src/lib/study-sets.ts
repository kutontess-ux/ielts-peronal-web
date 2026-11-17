"use client";

import { useSyncExternalStore } from "react";

export type StudySet = {
  id: string;
  title: string;
  desc: string;
  wordIds: number[];
  createdAt: string;
};

export const STUDY_SETS_STORAGE_KEY = "ielts_study_sets_v1";
const STUDY_SETS_EVENT = "ielts-study-sets-change";
const EMPTY_SETS: StudySet[] = [];

let cachedRaw: string | null | undefined;
let cachedParsed: StudySet[] = EMPTY_SETS;

function parseSets(raw: string | null): StudySet[] {
  if (!raw) return EMPTY_SETS;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return EMPTY_SETS;
    return data.filter(
      (s): s is StudySet =>
        !!s &&
        typeof s.id === "string" &&
        typeof s.title === "string" &&
        Array.isArray(s.wordIds)
    );
  } catch {
    return EMPTY_SETS;
  }
}

function getSnapshot(): StudySet[] {
  if (typeof window === "undefined") return EMPTY_SETS;
  try {
    const raw = localStorage.getItem(STUDY_SETS_STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedParsed = parseSets(raw);
    }
    return cachedParsed;
  } catch {
    return EMPTY_SETS;
  }
}

function getServerSnapshot(): StudySet[] {
  return EMPTY_SETS;
}

function writeSets(next: StudySet[]) {
  const raw = JSON.stringify(next);
  cachedRaw = raw;
  cachedParsed = next;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STUDY_SETS_STORAGE_KEY, raw);
    } catch {
      // bỏ qua nếu trình duyệt chặn localStorage
    }
    window.dispatchEvent(new Event(STUDY_SETS_EVENT));
  }
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STUDY_SETS_STORAGE_KEY) {
      cachedRaw = undefined;
      callback();
    }
  };
  window.addEventListener(STUDY_SETS_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STUDY_SETS_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function createStudySet(input: {
  title: string;
  desc?: string;
  wordIds: number[];
}): StudySet {
  const current = getSnapshot();
  const created: StudySet = {
    id: `set-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim(),
    desc: (input.desc ?? "").trim(),
    wordIds: Array.from(new Set(input.wordIds)),
    createdAt: new Date().toISOString(),
  };
  writeSets([created, ...current]);
  return created;
}

export function updateStudySet(
  id: string,
  patch: { title: string; desc?: string; wordIds: number[] }
) {
  const current = getSnapshot();
  const next = current.map((s) =>
    s.id === id
      ? {
          ...s,
          title: patch.title.trim(),
          desc: (patch.desc ?? "").trim(),
          wordIds: Array.from(new Set(patch.wordIds)),
        }
      : s
  );
  writeSets(next);
}

export function deleteStudySet(id: string) {
  const current = getSnapshot();
  writeSets(current.filter((s) => s.id !== id));
}

export function useStudySets() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
