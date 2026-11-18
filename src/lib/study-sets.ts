"use client";

import { useEffect, useSyncExternalStore } from "react";

export type StudyFolder = {
  id: string;
  name: string;
  desc: string;
  createdAt: string;
};

export type StudySet = {
  id: string;
  title: string;
  desc: string;
  wordIds: number[];
  folderId?: string | null;
  createdAt: string;
  lastStudiedAt?: string | null;
  nextReviewAt?: string | null;
  reviewLevel?: number;
  studyCount?: number;
  lastScore?: number | null;
};

export type StudySetReviewConfig = {
  mode: "srs" | "fixed";
  fixedDays: number;
};

export const STUDY_SET_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;
export const DEFAULT_STUDY_SET_REVIEW_CONFIG: StudySetReviewConfig = {
  mode: "srs",
  fixedDays: 3,
};

export const STUDY_SETS_STORAGE_KEY = "ielts_study_sets_v1";
const STUDY_SETS_EVENT = "ielts-study-sets-change";
const EMPTY_SETS: StudySet[] = [];

export const STUDY_SET_REVIEW_CFG_KEY = "ielts_study_set_review_cfg_v1";
const STUDY_SET_REVIEW_CFG_EVENT = "ielts-study-set-review-cfg-change";

export const STUDY_FOLDERS_STORAGE_KEY = "ielts_study_folders_v1";
const STUDY_FOLDERS_EVENT = "ielts-study-folders-change";
const EMPTY_FOLDERS: StudyFolder[] = [];

const MIGRATED_KEY = "ielts_study_migrated_v1";
const DAY_MS = 86400 * 1000;

let cachedRaw: string | null | undefined;
let cachedParsed: StudySet[] = EMPTY_SETS;

let cachedFoldersRaw: string | null | undefined;
let cachedFoldersParsed: StudyFolder[] = EMPTY_FOLDERS;

let cachedCfgRaw: string | null | undefined;
let cachedCfgParsed: StudySetReviewConfig = DEFAULT_STUDY_SET_REVIEW_CONFIG;

let remoteSyncPromise: Promise<void> | null = null;

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

function parseFolders(raw: string | null): StudyFolder[] {
  if (!raw) return EMPTY_FOLDERS;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return EMPTY_FOLDERS;
    return data.filter(
      (f): f is StudyFolder =>
        !!f &&
        typeof f.id === "string" &&
        typeof f.name === "string"
    );
  } catch {
    return EMPTY_FOLDERS;
  }
}

function parseReviewConfig(raw: string | null): StudySetReviewConfig {
  if (!raw) return DEFAULT_STUDY_SET_REVIEW_CONFIG;
  try {
    const data = JSON.parse(raw) as Partial<StudySetReviewConfig>;
    const mode = data.mode === "fixed" ? "fixed" : "srs";
    const fixedDays = Math.max(1, Math.min(90, Math.round(Number(data.fixedDays) || 3)));
    return { mode, fixedDays };
  } catch {
    return DEFAULT_STUDY_SET_REVIEW_CONFIG;
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

function getFoldersSnapshot(): StudyFolder[] {
  if (typeof window === "undefined") return EMPTY_FOLDERS;
  try {
    const raw = localStorage.getItem(STUDY_FOLDERS_STORAGE_KEY);
    if (raw !== cachedFoldersRaw) {
      cachedFoldersRaw = raw;
      cachedFoldersParsed = parseFolders(raw);
    }
    return cachedFoldersParsed;
  } catch {
    return EMPTY_FOLDERS;
  }
}

function getReviewConfigSnapshot(): StudySetReviewConfig {
  if (typeof window === "undefined") return DEFAULT_STUDY_SET_REVIEW_CONFIG;
  try {
    const raw = localStorage.getItem(STUDY_SET_REVIEW_CFG_KEY);
    if (raw !== cachedCfgRaw) {
      cachedCfgRaw = raw;
      cachedCfgParsed = parseReviewConfig(raw);
    }
    return cachedCfgParsed;
  } catch {
    return DEFAULT_STUDY_SET_REVIEW_CONFIG;
  }
}

function getServerSnapshot(): StudySet[] {
  return EMPTY_SETS;
}

function getFoldersServerSnapshot(): StudyFolder[] {
  return EMPTY_FOLDERS;
}

function getReviewConfigServerSnapshot(): StudySetReviewConfig {
  return DEFAULT_STUDY_SET_REVIEW_CONFIG;
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

function writeFolders(next: StudyFolder[]) {
  const raw = JSON.stringify(next);
  cachedFoldersRaw = raw;
  cachedFoldersParsed = next;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STUDY_FOLDERS_STORAGE_KEY, raw);
    } catch {
      // bỏ qua nếu trình duyệt chặn localStorage
    }
    window.dispatchEvent(new Event(STUDY_FOLDERS_EVENT));
  }
}

export function saveStudySetReviewConfig(next: StudySetReviewConfig) {
  const normalized: StudySetReviewConfig = {
    mode: next.mode === "fixed" ? "fixed" : "srs",
    fixedDays: Math.max(1, Math.min(90, Math.round(Number(next.fixedDays) || 3))),
  };
  const raw = JSON.stringify(normalized);
  cachedCfgRaw = raw;
  cachedCfgParsed = normalized;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STUDY_SET_REVIEW_CFG_KEY, raw);
    } catch {
      // bỏ qua
    }
    window.dispatchEvent(new Event(STUDY_SET_REVIEW_CFG_EVENT));
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

function subscribeFolders(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STUDY_FOLDERS_STORAGE_KEY) {
      cachedFoldersRaw = undefined;
      callback();
    }
  };
  window.addEventListener(STUDY_FOLDERS_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STUDY_FOLDERS_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeReviewConfig(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STUDY_SET_REVIEW_CFG_KEY) {
      cachedCfgRaw = undefined;
      callback();
    }
  };
  window.addEventListener(STUDY_SET_REVIEW_CFG_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STUDY_SET_REVIEW_CFG_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStudySetReviewConfig(): StudySetReviewConfig {
  return useSyncExternalStore(
    subscribeReviewConfig,
    getReviewConfigSnapshot,
    getReviewConfigServerSnapshot
  );
}

function mergeReviewMetadata(remoteSets: StudySet[], localSets: StudySet[]): StudySet[] {
  const localMap = new Map(localSets.map((s) => [s.id, s]));
  return remoteSets.map((remote) => {
    const local = localMap.get(remote.id);
    if (!local?.lastStudiedAt) return remote;
    const remoteMs = remote.lastStudiedAt ? new Date(remote.lastStudiedAt).getTime() : 0;
    const localMs = new Date(local.lastStudiedAt).getTime();
    if (!Number.isFinite(localMs) || localMs <= remoteMs) return remote;
    return {
      ...remote,
      lastStudiedAt: local.lastStudiedAt,
      nextReviewAt: local.nextReviewAt ?? remote.nextReviewAt ?? null,
      reviewLevel: local.reviewLevel ?? remote.reviewLevel ?? 0,
      studyCount: Math.max(local.studyCount ?? 0, remote.studyCount ?? 0),
      lastScore: local.lastScore ?? remote.lastScore ?? null,
    };
  });
}

async function postSync(payload: Record<string, unknown>) {
  try {
    await fetch("/api/study-sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // bỏ qua lỗi mạng tạm thời
  }
}

function backfillReviewFromHistory(sets: StudySet[]): {
  sets: StudySet[];
  backfilled: StudySet[];
} {
  const history = getHistorySnapshot();
  if (history.length === 0) return { sets, backfilled: [] };

  const byId = new Map<string, { studiedAt: string; ms: number; count: number }>();
  const byTitle = new Map<string, { studiedAt: string; ms: number; count: number }>();

  for (const h of history) {
    if (!h.studiedAt) continue;
    const ms = new Date(h.studiedAt).getTime();
    if (!Number.isFinite(ms)) continue;

    if (h.setId) {
      const prev = byId.get(h.setId);
      if (!prev) {
        byId.set(h.setId, { studiedAt: h.studiedAt, ms, count: 1 });
      } else {
        byId.set(h.setId, {
          studiedAt: ms > prev.ms ? h.studiedAt : prev.studiedAt,
          ms: Math.max(ms, prev.ms),
          count: prev.count + 1,
        });
      }
    }

    const titleKey = h.title.trim().toLowerCase();
    if (titleKey) {
      const prev = byTitle.get(titleKey);
      if (!prev) {
        byTitle.set(titleKey, { studiedAt: h.studiedAt, ms, count: 1 });
      } else {
        byTitle.set(titleKey, {
          studiedAt: ms > prev.ms ? h.studiedAt : prev.studiedAt,
          ms: Math.max(ms, prev.ms),
          count: prev.count + 1,
        });
      }
    }
  }

  const config = getReviewConfigSnapshot();
  const backfilled: StudySet[] = [];

  const nextSets = sets.map((s) => {
    if (s.lastStudiedAt) return s;
    const match = byId.get(s.id) ?? byTitle.get(s.title.trim().toLowerCase());
    if (!match) return s;

    const schedule = computeNextStudySetSchedule({
      prevLevel: Math.max(0, Math.min(4, match.count - 1)),
      scorePct: 100,
      config,
      nowMs: match.ms,
    });

    const updated: StudySet = {
      ...s,
      lastStudiedAt: match.studiedAt,
      nextReviewAt: schedule.nextReviewAt,
      reviewLevel: schedule.nextLevel,
      studyCount: Math.max(s.studyCount ?? 0, match.count),
      lastScore: s.lastScore ?? 100,
    };
    backfilled.push(updated);
    return updated;
  });

  return { sets: nextSets, backfilled };
}

function finalizeSyncedSets(remoteSets: StudySet[], localSets: StudySet[]) {
  const merged = mergeReviewMetadata(remoteSets, localSets);
  const { sets: withBackfill, backfilled } = backfillReviewFromHistory(merged);
  writeSets(withBackfill);
  for (const s of backfilled) {
    void postSync({
      action: "record_review",
      id: s.id,
      lastStudiedAt: s.lastStudiedAt,
      nextReviewAt: s.nextReviewAt,
      reviewLevel: s.reviewLevel ?? 1,
      studyCount: s.studyCount ?? 1,
      lastScore: s.lastScore ?? 100,
    });
  }
}

export function ensureStudySetsSynced() {
  if (typeof window === "undefined") return;
  if (remoteSyncPromise) return;

  remoteSyncPromise = (async () => {
    try {
      const res = await fetch("/api/study-sets", { cache: "no-store" });
      if (!res.ok) return;
      const remote = (await res.json()) as { folders?: StudyFolder[]; sets?: StudySet[] };
      const remoteFolders = remote.folders ?? [];
      const remoteSets = remote.sets ?? [];
      const localSets = getSnapshot();

      let migrated = false;
      try {
        migrated = localStorage.getItem(MIGRATED_KEY) === "1";
      } catch {
        migrated = false;
      }

      if (!migrated) {
        const localFolders = getFoldersSnapshot();
        const remoteFolderIds = new Set(remoteFolders.map((f) => f.id));
        const remoteSetIds = new Set(remoteSets.map((s) => s.id));

        const newFolders = localFolders.filter((f) => !remoteFolderIds.has(f.id));
        const newSets = localSets.filter((s) => !remoteSetIds.has(s.id));

        if (newFolders.length > 0 || newSets.length > 0) {
          await postSync({
            action: "sync_local",
            folders: newFolders,
            sets: newSets,
          });
          const res2 = await fetch("/api/study-sets", { cache: "no-store" });
          if (res2.ok) {
            const merged = (await res2.json()) as { folders?: StudyFolder[]; sets?: StudySet[] };
            writeFolders(merged.folders ?? []);
            finalizeSyncedSets(merged.sets ?? [], localSets);
          }
        } else {
          writeFolders(remoteFolders);
          finalizeSyncedSets(remoteSets, localSets);
        }

        try {
          localStorage.setItem(MIGRATED_KEY, "1");
        } catch {
          // bỏ qua
        }
      } else {
        writeFolders(remoteFolders);
        finalizeSyncedSets(remoteSets, localSets);
      }
    } catch {
      // fallback giữ localStorage nếu chưa chạy migration SQL
    }
  })();
}

export function createStudySet(input: {
  title: string;
  desc?: string;
  wordIds: number[];
  folderId?: string | null;
}): StudySet {
  const current = getSnapshot();
  const created: StudySet = {
    id: `set-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim(),
    desc: (input.desc ?? "").trim(),
    wordIds: Array.from(new Set(input.wordIds)),
    folderId: input.folderId || null,
    createdAt: new Date().toISOString(),
    lastStudiedAt: null,
    nextReviewAt: null,
    reviewLevel: 0,
    studyCount: 0,
    lastScore: null,
  };
  writeSets([created, ...current]);
  void postSync({ action: "create_set", set: created });
  return created;
}

export function updateStudySet(
  id: string,
  patch: { title: string; desc?: string; wordIds: number[]; folderId?: string | null }
) {
  const current = getSnapshot();
  const next = current.map((s) =>
    s.id === id
      ? {
          ...s,
          title: patch.title.trim(),
          desc: (patch.desc ?? "").trim(),
          wordIds: Array.from(new Set(patch.wordIds)),
          folderId: patch.folderId !== undefined ? patch.folderId || null : s.folderId ?? null,
        }
      : s
  );
  writeSets(next);
  void postSync({ action: "update_set", id, patch });
}

export function moveStudySetToFolder(setId: string, folderId: string | null) {
  const current = getSnapshot();
  const next = current.map((s) =>
    s.id === setId ? { ...s, folderId: folderId || null } : s
  );
  writeSets(next);
  void postSync({ action: "move_set", setId, folderId: folderId || null });
}

export function setFolderStudySets(folderId: string, setIds: string[]) {
  const idSet = new Set(setIds);
  const current = getSnapshot();
  const next = current.map((s) => {
    if (idSet.has(s.id)) {
      return { ...s, folderId };
    }
    if (s.folderId === folderId) {
      return { ...s, folderId: null };
    }
    return s;
  });
  writeSets(next);
  void postSync({ action: "set_folder_sets", folderId, setIds });
}

export function deleteStudySet(id: string) {
  const current = getSnapshot();
  writeSets(current.filter((s) => s.id !== id));
  void postSync({ action: "delete_set", id });
}

export function createStudyFolder(input: {
  name: string;
  desc?: string;
}): StudyFolder {
  const current = getFoldersSnapshot();
  const created: StudyFolder = {
    id: `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: input.name.trim(),
    desc: (input.desc ?? "").trim(),
    createdAt: new Date().toISOString(),
  };
  writeFolders([created, ...current]);
  void postSync({ action: "create_folder", folder: created });
  return created;
}

export function updateStudyFolder(
  id: string,
  patch: { name: string; desc?: string }
) {
  const current = getFoldersSnapshot();
  const next = current.map((f) =>
    f.id === id
      ? {
          ...f,
          name: patch.name.trim(),
          desc: (patch.desc ?? "").trim(),
        }
      : f
  );
  writeFolders(next);
  void postSync({ action: "update_folder", id, patch });
}

export function deleteStudyFolder(id: string) {
  const currentFolders = getFoldersSnapshot();
  writeFolders(currentFolders.filter((f) => f.id !== id));

  const currentSets = getSnapshot();
  const hasAffected = currentSets.some((s) => s.folderId === id);
  if (hasAffected) {
    writeSets(
      currentSets.map((s) => (s.folderId === id ? { ...s, folderId: null } : s))
    );
  }
  void postSync({ action: "delete_folder", id });
}

export function useStudySets() {
  useEffect(() => {
    ensureStudySetsSynced();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useStudyFolders() {
  useEffect(() => {
    ensureStudySetsSynced();
  }, []);
  return useSyncExternalStore(
    subscribeFolders,
    getFoldersSnapshot,
    getFoldersServerSnapshot
  );
}

export type StudySessionLog = {
  id: string;
  setId: string | null;
  title: string;
  wordCount: number;
  studiedAt: string;
  dateKey: string;
};

export const STUDY_HISTORY_STORAGE_KEY = "ielts_study_history_v1";
const STUDY_HISTORY_EVENT = "ielts-study-history-change";
const EMPTY_HISTORY: StudySessionLog[] = [];

let cachedHistoryRaw: string | null | undefined;
let cachedHistoryParsed: StudySessionLog[] = EMPTY_HISTORY;

export function getVnTodayKey(nowMs = Date.now()): string {
  const vn = new Date(nowMs + 7 * 60 * 60 * 1000);
  const y = vn.getUTCFullYear();
  const m = String(vn.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vn.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseHistory(raw: string | null): StudySessionLog[] {
  if (!raw) return EMPTY_HISTORY;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return EMPTY_HISTORY;
    return data.filter(
      (h): h is StudySessionLog =>
        !!h &&
        typeof h.id === "string" &&
        typeof h.title === "string" &&
        typeof h.dateKey === "string"
    );
  } catch {
    return EMPTY_HISTORY;
  }
}

function getHistorySnapshot(): StudySessionLog[] {
  if (typeof window === "undefined") return EMPTY_HISTORY;
  try {
    const raw = localStorage.getItem(STUDY_HISTORY_STORAGE_KEY);
    if (raw !== cachedHistoryRaw) {
      cachedHistoryRaw = raw;
      cachedHistoryParsed = parseHistory(raw);
    }
    return cachedHistoryParsed;
  } catch {
    return EMPTY_HISTORY;
  }
}

function getHistoryServerSnapshot(): StudySessionLog[] {
  return EMPTY_HISTORY;
}

function subscribeHistory(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STUDY_HISTORY_STORAGE_KEY) {
      cachedHistoryRaw = undefined;
      callback();
    }
  };
  window.addEventListener(STUDY_HISTORY_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STUDY_HISTORY_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function recordStudySetSession(input: {
  setId?: string | null;
  title: string;
  wordCount: number;
}) {
  const current = getHistorySnapshot();
  const nowMs = Date.now();
  const entry: StudySessionLog = {
    id: `hist-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    setId: input.setId ?? null,
    title: input.title,
    wordCount: input.wordCount,
    studiedAt: new Date(nowMs).toISOString(),
    dateKey: getVnTodayKey(nowMs),
  };
  const next = [entry, ...current].slice(0, 200);
  const raw = JSON.stringify(next);
  cachedHistoryRaw = raw;
  cachedHistoryParsed = next;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STUDY_HISTORY_STORAGE_KEY, raw);
    } catch {
      // bỏ qua
    }
    window.dispatchEvent(new Event(STUDY_HISTORY_EVENT));
  }
}

export function useStudyHistory() {
  return useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistoryServerSnapshot
  );
}

export type StudySetReviewResult = {
  nextLevel: number;
  intervalDays: number;
  nextReviewAt: string;
  lastStudiedAt: string;
  scorePct: number;
  studyCount: number;
};

export function computeNextStudySetSchedule(input: {
  prevLevel?: number;
  scorePct: number;
  config?: StudySetReviewConfig;
  nowMs?: number;
}): { nextLevel: number; intervalDays: number; nextReviewAt: string } {
  const prevLevel = Math.max(0, Math.min(5, Math.round(Number(input.prevLevel ?? 0))));
  const scorePct = Math.max(0, Math.min(100, Math.round(Number(input.scorePct ?? 100))));
  const config = input.config ?? DEFAULT_STUDY_SET_REVIEW_CONFIG;
  const nowMs = input.nowMs ?? Date.now();

  const nextLevel = scorePct >= 80 ? Math.min(5, Math.max(1, prevLevel + 1)) : 1;
  const intervalDays =
    config.mode === "fixed"
      ? Math.max(1, Math.min(90, Math.round(config.fixedDays || 3)))
      : STUDY_SET_INTERVAL_DAYS[nextLevel - 1];

  return {
    nextLevel,
    intervalDays,
    nextReviewAt: new Date(nowMs + intervalDays * DAY_MS).toISOString(),
  };
}

export function completeStudySetReview(
  setId: string,
  scorePct: number,
  nowMs = Date.now()
): StudySetReviewResult | null {
  const current = getSnapshot();
  const target = current.find((s) => s.id === setId);
  if (!target) return null;

  const config = getReviewConfigSnapshot();
  const cleanScore = Math.max(0, Math.min(100, Math.round(scorePct)));
  const schedule = computeNextStudySetSchedule({
    prevLevel: target.reviewLevel ?? 0,
    scorePct: cleanScore,
    config,
    nowMs,
  });

  const lastStudiedAt = new Date(nowMs).toISOString();
  const studyCount = (target.studyCount ?? 0) + 1;

  const nextSets = current.map((s) =>
    s.id === setId
      ? {
          ...s,
          lastStudiedAt,
          nextReviewAt: schedule.nextReviewAt,
          reviewLevel: schedule.nextLevel,
          studyCount,
          lastScore: cleanScore,
        }
      : s
  );
  writeSets(nextSets);

  void postSync({
    action: "record_review",
    id: setId,
    lastStudiedAt,
    nextReviewAt: schedule.nextReviewAt,
    reviewLevel: schedule.nextLevel,
    studyCount,
    lastScore: cleanScore,
  });

  return {
    nextLevel: schedule.nextLevel,
    intervalDays: schedule.intervalDays,
    nextReviewAt: schedule.nextReviewAt,
    lastStudiedAt,
    scorePct: cleanScore,
    studyCount,
  };
}

export function getRecentReviewQueue(sets: StudySet[], nowMs = Date.now()): StudySet[] {
  const studied = sets.filter((s) => {
    if (!s.lastStudiedAt || s.wordIds.length === 0) return false;
    const ms = new Date(s.lastStudiedAt).getTime();
    return Number.isFinite(ms);
  });

  // Chỉ lấy tối đa 5 học phần được học gần đây nhất
  const top5Recent = [...studied]
    .sort((a, b) => new Date(b.lastStudiedAt!).getTime() - new Date(a.lastStudiedAt!).getTime())
    .slice(0, 5);

  // Trong 5 học phần gần nhất: ưu tiên học phần đã đến hạn, và học lâu nhất đứng trước
  return top5Recent.sort((a, b) => {
    const aDue = a.nextReviewAt ? new Date(a.nextReviewAt).getTime() <= nowMs : false;
    const bDue = b.nextReviewAt ? new Date(b.nextReviewAt).getTime() <= nowMs : false;
    if (aDue !== bDue) return aDue ? -1 : 1;
    return new Date(a.lastStudiedAt!).getTime() - new Date(b.lastStudiedAt!).getTime();
  });
}

function getVnDayIndex(ms: number): number {
  return Math.floor((ms + 7 * 60 * 60 * 1000) / DAY_MS);
}

export function formatStudiedAgoLabel(iso: string, nowMs = Date.now()): string {
  const studiedMs = new Date(iso).getTime();
  if (!Number.isFinite(studiedMs)) return "Đã học";
  const dayDiff = Math.max(0, getVnDayIndex(nowMs) - getVnDayIndex(studiedMs));
  if (dayDiff === 0) {
    const hours = Math.floor(Math.max(0, nowMs - studiedMs) / (60 * 60 * 1000));
    if (hours < 1) return "Vừa học xong";
    return `Học hôm nay (${hours} giờ trước)`;
  }
  if (dayDiff === 1) return "Học hôm qua";
  return `Học ${dayDiff} ngày trước`;
}

export type StudySetReviewStatus = {
  kind: "unstudied" | "due" | "upcoming" | "archived-studied";
  badgeText: string;
  lastStudiedLabel: string | null;
  isDue: boolean;
  inRecentQueue: boolean;
};

export function getStudySetReviewStatus(
  set: StudySet,
  recentSetIds: Set<string>,
  nowMs = Date.now()
): StudySetReviewStatus {
  if (!set.lastStudiedAt) {
    return {
      kind: "unstudied",
      badgeText: "Chưa học",
      lastStudiedLabel: null,
      isDue: false,
      inRecentQueue: false,
    };
  }

  const lastStudiedLabel = formatStudiedAgoLabel(set.lastStudiedAt, nowMs);
  const inRecentQueue = recentSetIds.has(set.id);

  if (!inRecentQueue) {
    return {
      kind: "archived-studied",
      badgeText: lastStudiedLabel,
      lastStudiedLabel,
      isDue: false,
      inRecentQueue: false,
    };
  }

  const nextMs = set.nextReviewAt ? new Date(set.nextReviewAt).getTime() : null;
  if (nextMs !== null && Number.isFinite(nextMs) && nextMs <= nowMs) {
    const overdueDays = Math.floor((nowMs - nextMs) / DAY_MS);
    return {
      kind: "due",
      badgeText: overdueDays >= 1 ? `Cần ôn · Quá ${overdueDays} ngày` : "Cần ôn lại",
      lastStudiedLabel,
      isDue: true,
      inRecentQueue: true,
    };
  }

  if (nextMs !== null && Number.isFinite(nextMs)) {
    const diffMs = Math.max(0, nextMs - nowMs);
    const hoursLeft = Math.ceil(diffMs / (60 * 60 * 1000));
    const daysLeft = Math.ceil(diffMs / DAY_MS);
    const badgeText =
      hoursLeft < 24
        ? `Ôn lại sau ${Math.max(1, hoursLeft)} giờ`
        : `Ôn lại sau ${daysLeft} ngày`;
    return {
      kind: "upcoming",
      badgeText,
      lastStudiedLabel,
      isDue: false,
      inRecentQueue: true,
    };
  }

  return {
    kind: "upcoming",
    badgeText: lastStudiedLabel,
    lastStudiedLabel,
    isDue: false,
    inRecentQueue: true,
  };
}


