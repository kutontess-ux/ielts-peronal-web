"use client";

import { useCallback, useEffect, useState } from "react";
import { clearDailyClientCache } from "@/lib/daily-cache";

export type MeInfo = {
  profile: {
    id: string;
    email: string;
    full_name: string;
    avatar_url: string | null;
    role: "admin" | "member";
    daily_ai_limit: number;
  };
  isAdmin: boolean;
  aiUsage: { usedToday: number; limit: number | null };
};

const PREVIEW_USER_KEY = "ielts_admin_preview_user_v1";

let cachedMe: MeInfo | null = null;
let cachedLoaded = false;
let inflightPromise: Promise<MeInfo | null> | null = null;
let previewAsUserState = false;
let previewInitialized = false;

const listeners = new Set<() => void>();

function emitChange() {
  for (const fn of listeners) {
    fn();
  }
}

function initPreviewFromSession() {
  if (previewInitialized || typeof window === "undefined") return;
  previewInitialized = true;
  try {
    previewAsUserState = sessionStorage.getItem(PREVIEW_USER_KEY) === "1";
  } catch {
    previewAsUserState = false;
  }
}

export async function fetchMeOnce(force = false): Promise<MeInfo | null> {
  if (!force && cachedLoaded) return cachedMe;
  if (!force && inflightPromise) return inflightPromise;

  inflightPromise = fetch("/api/me", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) {
        cachedMe = null;
        return null;
      }
      const data = (await r.json()) as MeInfo;
      cachedMe = data;
      return data;
    })
    .catch(() => cachedMe)
    .finally(() => {
      cachedLoaded = true;
      inflightPromise = null;
      emitChange();
    });

  return inflightPromise;
}

export function clearCachedMe() {
  cachedMe = null;
  cachedLoaded = false;
  inflightPromise = null;
  previewAsUserState = false;
  clearDailyClientCache();
  try {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(PREVIEW_USER_KEY);
    }
  } catch {
    // bỏ qua
  }
  emitChange();
}

export function setAdminPreviewAsUser(next: boolean) {
  previewAsUserState = next;
  previewInitialized = true;
  try {
    if (typeof window !== "undefined") {
      if (next) {
        sessionStorage.setItem(PREVIEW_USER_KEY, "1");
      } else {
        sessionStorage.removeItem(PREVIEW_USER_KEY);
      }
    }
  } catch {
    // bỏ qua
  }
  emitChange();
}

export function useMe(options?: { skip?: boolean }) {
  const skip = Boolean(options?.skip);
  const [, setTick] = useState(0);

  useEffect(() => {
    initPreviewFromSession();
    const bump = () => setTick((t) => t + 1);
    listeners.add(bump);
    const raf = requestAnimationFrame(() => {
      bump();
    });

    if (!skip && !cachedLoaded) {
      void fetchMeOnce();
    }

    return () => {
      cancelAnimationFrame(raf);
      listeners.delete(bump);
    };
  }, [skip]);

  const refreshMe = useCallback(() => fetchMeOnce(true), []);
  const togglePreviewAsUser = useCallback(() => {
    setAdminPreviewAsUser(!previewAsUserState);
  }, []);

  const realIsAdmin = Boolean(cachedMe?.isAdmin);
  const previewAsUser = realIsAdmin && previewAsUserState;
  const isAdmin = realIsAdmin && !previewAsUser;

  return {
    me: cachedMe,
    meLoaded: cachedLoaded,
    realIsAdmin,
    isAdmin,
    previewAsUser,
    setPreviewAsUser: setAdminPreviewAsUser,
    togglePreviewAsUser,
    refreshMe,
    clearMe: clearCachedMe,
  };
}
