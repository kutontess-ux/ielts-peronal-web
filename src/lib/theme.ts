"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "ielts_theme_v1";
const THEME_EVENT = "ielts-theme-change";

const THEME_META_COLOR: Record<Theme, string> = {
  light: "#f0f2f8",
  dark: "#0a092d",
};

export function applyThemeToDom(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", THEME_META_COLOR[theme]);
  }
}

export function getSavedTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // bỏ qua nếu trình duyệt chặn localStorage
  }
  return "dark";
}

export function setTheme(next: Theme) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // bỏ qua nếu trình duyệt chặn localStorage
  }
  applyThemeToDom(next);
  window.dispatchEvent(new Event(THEME_EVENT));
}

function getSnapshot(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function getServerSnapshot(): Theme {
  return "dark";
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
      applyThemeToDom(e.newValue);
      callback();
    }
  };
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Áp dụng lại theme từ localStorage khi React Strict Mode remount trong dev
  useLayoutEffect(() => {
    const saved = getSavedTheme();
    if (document.documentElement.getAttribute("data-theme") !== saved) {
      applyThemeToDom(saved);
      window.dispatchEvent(new Event(THEME_EVENT));
    }
  }, []);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
  return { theme, setTheme, toggleTheme };
}
