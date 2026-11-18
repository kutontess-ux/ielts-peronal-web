"use client";

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
