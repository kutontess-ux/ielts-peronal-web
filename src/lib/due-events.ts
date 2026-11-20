// Sự kiện đồng bộ số từ cần ôn, cài đặt thông báo & trạng thái đã xem thông báo giữa các trang và Sidebar
export const DUE_EVENT = "ielts-due-updated";
export const NOTIF_SEEN_EVENT = "ielts-notif-seen";
export const SETTINGS_EVENT = "ielts-settings-updated";
const NOTIF_SEEN_KEY = "ielts_notif_seen_date_v1";
const DUE_SUMMARY_CACHE_KEY = "ielts_due_summary_cache_v1";
const MAX_DAILY_DUE_FETCHES = 5;
const DUE_SUMMARY_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 giờ

export type DueSummary = {
  dueCount: number;
  totalWords: number | null;
  masteredCount: number;
  ok: boolean;
  error?: string;
};

type StoredDueCache = {
  dateKey: string;
  fetchCount: number;
  lastFetchedAt: number;
  dueCount: number;
  totalWords: number | null;
  masteredCount: number;
};

let memoryDueCache: StoredDueCache | null = null;
let inflightDuePromise: Promise<DueSummary> | null = null;

function getLocalDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readDueCache(): StoredDueCache | null {
  const today = getLocalDateKey();
  if (memoryDueCache && memoryDueCache.dateKey === today) {
    return memoryDueCache;
  }
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DUE_SUMMARY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDueCache>;
    if (parsed.dateKey !== today || typeof parsed.dueCount !== "number") {
      return null;
    }
    const normalized: StoredDueCache = {
      dateKey: today,
      fetchCount: Number(parsed.fetchCount ?? 0),
      lastFetchedAt: Number(parsed.lastFetchedAt ?? 0),
      dueCount: parsed.dueCount,
      totalWords: typeof parsed.totalWords === "number" ? parsed.totalWords : null,
      masteredCount: Number(parsed.masteredCount ?? 0),
    };
    memoryDueCache = normalized;
    return normalized;
  } catch {
    return null;
  }
}

function writeDueCache(next: StoredDueCache): void {
  memoryDueCache = next;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DUE_SUMMARY_CACHE_KEY, JSON.stringify(next));
  } catch {
    // bỏ qua nếu trình duyệt chặn storage
  }
}

export function updateDueSummaryCache(patch: {
  dueCount?: number;
  totalWords?: number | null;
  masteredCount?: number;
}): void {
  const today = getLocalDateKey();
  const prev = readDueCache();
  writeDueCache({
    dateKey: today,
    fetchCount: prev?.fetchCount ?? 0,
    lastFetchedAt: prev?.lastFetchedAt ?? Date.now(),
    dueCount: typeof patch.dueCount === "number" ? patch.dueCount : (prev?.dueCount ?? 0),
    totalWords: patch.totalWords !== undefined ? patch.totalWords : (prev?.totalWords ?? null),
    masteredCount:
      typeof patch.masteredCount === "number" ? patch.masteredCount : (prev?.masteredCount ?? 0),
  });
}

export function clearDueSummaryCache(): void {
  memoryDueCache = null;
  inflightDuePromise = null;
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DUE_SUMMARY_CACHE_KEY);
  } catch {
    // bỏ qua
  }
}

export async function fetchDueSummaryCached(options?: { force?: boolean }): Promise<DueSummary> {
  const cached = readDueCache();
  const now = Date.now();

  if (!options?.force && cached) {
    const withinDailyLimit = cached.fetchCount >= MAX_DAILY_DUE_FETCHES;
    const withinCooldown = now - cached.lastFetchedAt < DUE_SUMMARY_COOLDOWN_MS;
    if (withinDailyLimit || withinCooldown) {
      return {
        dueCount: cached.dueCount,
        totalWords: cached.totalWords,
        masteredCount: cached.masteredCount,
        ok: true,
      };
    }
  }

  if (inflightDuePromise) return inflightDuePromise;

  inflightDuePromise = (async (): Promise<DueSummary> => {
    try {
      const r = await fetch("/api/reviews", { cache: "no-store" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        return {
          dueCount: cached?.dueCount ?? 0,
          totalWords: cached?.totalWords ?? null,
          masteredCount: cached?.masteredCount ?? 0,
          ok: false,
          error: body?.error,
        };
      }

      const today = getLocalDateKey();
      const latest = readDueCache();
      const prevCount = latest && latest.dateKey === today ? latest.fetchCount : 0;
      const summary: DueSummary = {
        dueCount: Number(body.dueCount ?? 0),
        totalWords: typeof body.totalWords === "number" ? body.totalWords : null,
        masteredCount: Number(body.masteredCount ?? 0),
        ok: true,
      };

      writeDueCache({
        dateKey: today,
        fetchCount: prevCount + 1,
        lastFetchedAt: Date.now(),
        dueCount: summary.dueCount,
        totalWords: summary.totalWords,
        masteredCount: summary.masteredCount,
      });

      return summary;
    } catch {
      return {
        dueCount: cached?.dueCount ?? 0,
        totalWords: cached?.totalWords ?? null,
        masteredCount: cached?.masteredCount ?? 0,
        ok: false,
      };
    } finally {
      inflightDuePromise = null;
    }
  })();

  return inflightDuePromise;
}

export function notifyDueUpdated(dueCount?: number) {
  if (typeof dueCount === "number") {
    updateDueSummaryCache({ dueCount });
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DUE_EVENT, { detail: { dueCount } }));
  }
}

export function notifySettingsUpdated(settings?: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: settings }));
  }
}

export function isNotifSeenToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(NOTIF_SEEN_KEY) === getLocalDateKey();
  } catch {
    return false;
  }
}

export function markNotifSeenToday(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIF_SEEN_KEY, getLocalDateKey());
  } catch {
    // bỏ qua nếu trình duyệt chặn storage
  }
  window.dispatchEvent(new CustomEvent(NOTIF_SEEN_EVENT));
}
