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
};

export const STUDY_SETS_STORAGE_KEY = "ielts_study_sets_v1";
const STUDY_SETS_EVENT = "ielts-study-sets-change";
const EMPTY_SETS: StudySet[] = [];

export const STUDY_FOLDERS_STORAGE_KEY = "ielts_study_folders_v1";
const STUDY_FOLDERS_EVENT = "ielts-study-folders-change";
const EMPTY_FOLDERS: StudyFolder[] = [];

const MIGRATED_KEY = "ielts_study_migrated_v1";

let cachedRaw: string | null | undefined;
let cachedParsed: StudySet[] = EMPTY_SETS;

let cachedFoldersRaw: string | null | undefined;
let cachedFoldersParsed: StudyFolder[] = EMPTY_FOLDERS;

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

function getServerSnapshot(): StudySet[] {
  return EMPTY_SETS;
}

function getFoldersServerSnapshot(): StudyFolder[] {
  return EMPTY_FOLDERS;
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

      let migrated = false;
      try {
        migrated = localStorage.getItem(MIGRATED_KEY) === "1";
      } catch {
        migrated = false;
      }

      if (!migrated) {
        const localFolders = getFoldersSnapshot();
        const localSets = getSnapshot();
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
            writeSets(merged.sets ?? []);
          }
        } else {
          writeFolders(remoteFolders);
          writeSets(remoteSets);
        }

        try {
          localStorage.setItem(MIGRATED_KEY, "1");
        } catch {
          // bỏ qua
        }
      } else {
        writeFolders(remoteFolders);
        writeSets(remoteSets);
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
