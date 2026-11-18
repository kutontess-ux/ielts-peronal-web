import type { DailyGroup, DailyWord } from "@/app/api/daily/route";

export type DailyDayEntry = {
  date: string;
  news: DailyWord[];
  ielts: DailyWord[];
};

export type DailyClientCache = {
  userId: string | null;
  today: string;
  yesterday: string;
  dailyEnabled: boolean;
  history: string[];
  days: Record<string, DailyDayEntry>;
  range7d?: DailyGroup[];
  autoGenTriedToday?: boolean;
};

const STORAGE_KEY = "ielts_daily_cache_v1";

let memCache: DailyClientCache | null = null;

export function getTodayVNClient(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

export function clearDailyClientCache(): void {
  memCache = null;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // bỏ qua
    }
  }
}

export function readDailyClientCache(userId?: string | null): DailyClientCache | null {
  const vnToday = getTodayVNClient();
  let c = memCache;
  if (!c && typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        c = JSON.parse(raw) as DailyClientCache;
        memCache = c;
      }
    } catch {
      c = null;
    }
  }
  if (!c) return null;
  if (c.today !== vnToday) {
    clearDailyClientCache();
    return null;
  }
  if (userId && c.userId && c.userId !== userId) {
    clearDailyClientCache();
    return null;
  }
  if (userId && !c.userId) {
    c.userId = userId;
    persistCache(c);
  }
  return c;
}

function persistCache(next: DailyClientCache): void {
  memCache = next;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // bỏ qua nếu quota đầy
    }
  }
}

export function upsertDailyCacheMeta(meta: {
  userId?: string | null;
  today: string;
  yesterday: string;
  dailyEnabled?: boolean;
  history?: string[];
  autoGenTriedToday?: boolean;
}): DailyClientCache {
  const existing = readDailyClientCache(meta.userId);
  const next: DailyClientCache = {
    userId: meta.userId ?? existing?.userId ?? null,
    today: meta.today,
    yesterday: meta.yesterday,
    dailyEnabled:
      typeof meta.dailyEnabled === "boolean"
        ? meta.dailyEnabled
        : (existing?.dailyEnabled ?? true),
    history: meta.history ?? existing?.history ?? [],
    days: existing?.days ? { ...existing.days } : {},
    range7d: existing?.range7d,
    autoGenTriedToday: meta.autoGenTriedToday ?? existing?.autoGenTriedToday ?? false,
  };
  persistCache(next);
  return next;
}

export function saveDailyDayCache(
  entry: DailyDayEntry,
  meta: {
    userId?: string | null;
    today: string;
    yesterday: string;
    dailyEnabled?: boolean;
    history?: string[];
    autoGenTriedToday?: boolean;
    invalidate7d?: boolean;
  }
): DailyClientCache {
  const next = upsertDailyCacheMeta(meta);
  next.days[entry.date] = entry;
  if (meta.invalidate7d) {
    delete next.range7d;
  }
  persistCache(next);
  return next;
}

export function saveDaily7dCache(
  groups: DailyGroup[],
  meta: {
    userId?: string | null;
    today: string;
    yesterday: string;
    dailyEnabled?: boolean;
    history?: string[];
  }
): DailyClientCache {
  const next = upsertDailyCacheMeta(meta);
  next.range7d = groups;
  for (const g of groups) {
    // Cache các ngày từ 7 ngày qua để chuyển sang tab ngày đơn cũng tức thì
    next.days[g.date] = {
      date: g.date,
      news: g.news,
      ielts: g.ielts,
    };
  }
  persistCache(next);
  return next;
}
