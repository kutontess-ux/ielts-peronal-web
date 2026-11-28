import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { askJson, TOPICS, type Enriched } from "@/lib/ai";
import { cleanTerm, normKey, possibleLemmas } from "@/lib/normalize";
import { fetchRecentNews, type NewsItem } from "@/lib/rss";
import { linkWordsToUser } from "@/lib/user-words";
import type { Word } from "@/lib/mock";

export const TARGET_NEWS = 5;
export const TARGET_IELTS = 5;
const MAX_PASSES = 5;

const VALID_LEVELS = new Set(["A2", "B1", "B2", "C1", "C2"]);
const VALID_TOPICS = new Set<string>(TOPICS);
const VALID_POS = new Set(["n", "v", "adj", "adv", "phr", "prep", "conj"]);

// Khoá chống chạy trùng khi cùng 1 user mở nhiều tab hoặc cron chạy song song
const inFlightByUserDay = new Map<string, Promise<void>>();

export type DailyWord = Word & {
  kind: "news" | "ielts";
  source_sentence?: string;
  article_title?: string;
  article_url?: string;
};

export type DailyGroup = {
  date: string;
  news: DailyWord[];
  ielts: DailyWord[];
};

type DailyAiItem = Omit<Enriched, "input" | "valid"> & {
  kind: "news" | "ielts";
  source_sentence?: string;
  article_title?: string;
  article_url?: string;
};

export function dateOffsetVN(daysAgo = 0): string {
  const d = new Date(Date.now() - daysAgo * 86400 * 1000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

export function isDailyInFlight(userId: string, day: string): boolean {
  return inFlightByUserDay.has(`${userId}:${day}`);
}

function safeLevel(raw: unknown): Word["level"] {
  const up = String(raw ?? "").trim().toUpperCase();
  if (up === "A1") return "A2";
  if (VALID_LEVELS.has(up)) return up as Word["level"];
  return "B2";
}

function safePos(raw: unknown): string | null {
  const p = String(raw ?? "").trim().toLowerCase();
  if (VALID_POS.has(p)) return p;
  return p ? p.slice(0, 16) : null;
}

function safeTopic(raw: unknown): string {
  const t = String(raw ?? "").trim();
  return VALID_TOPICS.has(t) ? t : "Other";
}

function safeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function matchArticle(item: DailyAiItem, newsList: NewsItem[]): NewsItem | undefined {
  const rawUrl = (item.article_url ?? "").trim();
  const rawTitle = (item.article_title ?? "").trim().toLowerCase();
  if (rawUrl) {
    const byUrl = newsList.find((n) => n.url === rawUrl);
    if (byUrl) return byUrl;
  }
  if (rawTitle) {
    const byTitle = newsList.find((n) => n.title.trim().toLowerCase() === rawTitle);
    if (byTitle) return byTitle;
  }
  return undefined;
}

function mapRow(r: {
  kind: string;
  source_sentence: string | null;
  article_title: string | null;
  article_url: string | null;
  words: unknown;
}): DailyWord | null {
  if (!r.words) return null;
  const w = (Array.isArray(r.words) ? r.words[0] : r.words) as Record<string, unknown>;
  if (!w) return null;
  return {
    id: Number(w.id),
    word: String(w.lemma ?? ""),
    ipa: String(w.ipa ?? ""),
    pos: String(w.pos ?? ""),
    vi: String(w.meaning_vi ?? ""),
    en: String(w.definition_en ?? ""),
    example: String(w.example ?? ""),
    level: String(w.cefr_level ?? "B2") as Word["level"],
    topic: String(w.topic ?? "Other"),
    awl: Boolean(w.is_awl),
    kind: r.kind as "news" | "ielts",
    source_sentence: r.source_sentence ?? undefined,
    article_title: r.article_title ?? undefined,
    article_url: r.article_url ?? undefined,
  };
}

export async function readDaily(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string,
  day: string
): Promise<{ news: DailyWord[]; ielts: DailyWord[] }> {
  const { data, error } = await db
    .from("daily_words")
    .select(
      "kind,source_sentence,article_title,article_url,words(id,lemma,ipa,pos,meaning_vi,definition_en,example,cefr_level,topic,is_awl)"
    )
    .eq("user_id", userId)
    .eq("day", day)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map(mapRow).filter((x): x is DailyWord => x !== null);
  return {
    news: rows.filter((r) => r.kind === "news"),
    ielts: rows.filter((r) => r.kind === "ielts"),
  };
}

export async function readRange(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string,
  fromDay: string,
  toDay: string
): Promise<DailyGroup[]> {
  const { data, error } = await db
    .from("daily_words")
    .select(
      "day,kind,source_sentence,article_title,article_url,words(id,lemma,ipa,pos,meaning_vi,definition_en,example,cefr_level,topic,is_awl)"
    )
    .eq("user_id", userId)
    .gte("day", fromDay)
    .lte("day", toDay)
    .order("day", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);

  const grouped = new Map<string, DailyWord[]>();
  for (const r of data ?? []) {
    const mapped = mapRow(r);
    if (!mapped) continue;
    const d = String(r.day);
    const arr = grouped.get(d) ?? [];
    arr.push(mapped);
    grouped.set(d, arr);
  }

  return Array.from(grouped.entries()).map(([date, list]) => ({
    date,
    news: list.filter((x) => x.kind === "news"),
    ielts: list.filter((x) => x.kind === "ielts"),
  }));
}

export async function readDailyVocabEnabled(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string
): Promise<boolean> {
  const { data, error } = await db
    .from("user_settings")
    .select("notify_daily_vocab")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data || typeof data.notify_daily_vocab !== "boolean") return true;
  return data.notify_daily_vocab;
}

// Tải toàn bộ norm_key -> id trong bảng words theo lô 1.000 dòng (tránh giới hạn mặc định 1.000 của Supabase)
async function loadAllWordMap(db: ReturnType<typeof supabaseAdmin>): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const CHUNK = 1000;
  for (let from = 0; from < 50000; from += CHUNK) {
    const { data, error } = await db
      .from("words")
      .select("id,norm_key,lemma")
      .order("id", { ascending: true })
      .range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const r of batch) {
      const id = Number(r.id);
      if (r.norm_key) map.set(String(r.norm_key), id);
      if (r.lemma) {
        const nk = normKey(String(r.lemma));
        if (nk && !map.has(nk)) map.set(nk, id);
      }
    }
    if (batch.length < CHUNK) break;
  }
  return map;
}

// Tải toàn bộ từ user đã từng nhận trong daily_words (theo lô 1.000) để lọc trùng tuyệt đối cho user này
async function loadUserDailyHistory(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string
): Promise<{ keys: Set<string>; recentLemmas: string[] }> {
  const keys = new Set<string>();
  const recentLemmas: string[] = [];
  const CHUNK = 1000;
  for (let from = 0; from < 50000; from += CHUNK) {
    const { data, error } = await db
      .from("daily_words")
      .select("words(lemma,norm_key)")
      .eq("user_id", userId)
      .order("day", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const r of batch) {
      const w = (Array.isArray(r.words) ? r.words[0] : r.words) as
        | { lemma?: string | null; norm_key?: string | null }
        | null;
      if (!w) continue;
      if (w.norm_key) keys.add(String(w.norm_key));
      if (w.lemma) {
        const clean = cleanTerm(String(w.lemma));
        if (clean) {
          keys.add(normKey(clean));
          if (recentLemmas.length < 180) recentLemmas.push(clean);
        }
      }
    }
    if (batch.length < CHUNK) break;
  }
  return { keys, recentLemmas };
}

// Tải toàn bộ từ user đang học / đã ôn trong reviews (theo lô 1.000) để không gợi ý lại từ đã thuộc
async function loadUserReviewKeys(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string
): Promise<Set<string>> {
  const keys = new Set<string>();
  const CHUNK = 1000;
  for (let from = 0; from < 50000; from += CHUNK) {
    const { data, error } = await db
      .from("reviews")
      .select("words(lemma,norm_key)")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const r of batch) {
      const w = (Array.isArray(r.words) ? r.words[0] : r.words) as
        | { lemma?: string | null; norm_key?: string | null }
        | null;
      if (!w) continue;
      if (w.norm_key) keys.add(String(w.norm_key));
      if (w.lemma) keys.add(normKey(String(w.lemma)));
    }
    if (batch.length < CHUNK) break;
  }
  return keys;
}

function buildDailySystem(askNews: number, askIelts: number, excludeLemmas: string[]): string {
  const parts: string[] = [];
  if (askNews > 0) {
    parts.push(
      `1) ĐÚNG ${askNews} từ (kind="news") lấy từ nội dung các bài báo RSS được cung cấp, ưu tiên mức B2-C1, hữu ích cho IELTS Reading/Writing. Với mỗi từ này, ghi rõ "source_sentence" (câu trích từ bài báo chứa từ đó), "article_title" và "article_url" lấy chính xác từ bài báo.`
    );
  }
  if (askIelts > 0) {
    parts.push(
      `${askNews > 0 ? "2" : "1"}) ĐÚNG ${askIelts} từ (kind="ielts") là từ vựng học thuật IELTS Academic (B2-C1) hay dùng trong Writing Task 2 / Reading${askNews > 0 ? ", khác với các từ báo" : ""}.`
    );
  }

  const totalAsk = askNews + askIelts;
  const recentExclude = excludeLemmas.slice(-250);
  const excludeRule =
    recentExclude.length > 0
      ? `\n- TUYỆT ĐỐI KHÔNG chọn lại các từ đã có/đã dùng sau đây (kể cả dạng số nhiều hoặc chia thì): ${recentExclude.join(", ")}.`
      : "";

  return `Bạn là giáo viên IELTS Academic cho người Việt trình độ B1 hướng tới band 6.5.
Nhiệm vụ: Tạo danh sách ĐÚNG ${totalAsk} từ vựng mới gồm:
${parts.join("\n")}

QUAN TRỌNG: Mảng "items" BẮT BUỘC phải có đủ ${totalAsk} phần tử khác nhau (không dừng sớm).

QUY TẮC BẮT BUỘC:
- Ưu tiên từ vựng phong phú, giá trị học thuật cao, không chọn từ quá đơn giản (A1-A2).
- Không trùng lặp giữa các từ trả về với nhau.${excludeRule}
- lemma: dạng gốc, chữ thường (không chia thì, không thêm s/es trừ cụm cố định).
- ipa: phiên âm IPA Anh-Anh có dấu gạch chéo.
- pos: một trong n, v, adj, adv, phr.
- meaning_vi: nghĩa tiếng Việt ngắn gọn (<= 8 từ).
- definition_en: định nghĩa tiếng Anh đơn giản (<= 20 từ).
- example: 1 câu ví dụ IELTS tự nhiên.
- cefr_level: chọn đúng 1 giá trị trong B1, B2, C1 (ưu tiên B2 hoặc C1).
- topic: chọn đúng 1 trong: ${TOPICS.join(", ")}.
- is_awl: true nếu thuộc Academic Word List của Coxhead.
- collocations: tối đa 3 cụm. synonyms: tối đa 3 từ.
Trả về JSON dạng {"items":[...]}.`;
}

function pickArticleSlice(newsList: NewsItem[], pass: number, size = 12): NewsItem[] {
  if (newsList.length <= size) return newsList;
  const start = (pass * 6) % newsList.length;
  const doubled = [...newsList, ...newsList];
  return doubled.slice(start, start + size);
}

type SharedDailyResources = {
  sharedWordMap?: Map<string, number>;
  newsList?: NewsItem[];
};

async function generateDaily(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string,
  day: string,
  shared?: SharedDailyResources
) {
  const [existingToday, userDaily, userReviewKeys, sharedWordMap, newsList, otherTodayRes] =
    await Promise.all([
      readDaily(db, userId, day),
      loadUserDailyHistory(db, userId),
      loadUserReviewKeys(db, userId),
      shared?.sharedWordMap ? Promise.resolve(shared.sharedWordMap) : loadAllWordMap(db),
      shared?.newsList ? Promise.resolve(shared.newsList) : fetchRecentNews(5),
      db
        .from("daily_words")
        .select("words(lemma,norm_key)")
        .eq("day", day)
        .neq("user_id", userId)
        .limit(120),
    ]);

  let savedNews = existingToday.news.length;
  let savedIelts = existingToday.ielts.length;
  if (savedNews >= TARGET_NEWS && savedIelts >= TARGET_IELTS) return;

  // Phương án A:
  // - userSeenKeys: cấm tuyệt đối lặp với lịch sử daily_words + reviews của chính user này
  // - otherTodayKeys: tránh lặp với từ người dùng khác vừa nhận hôm nay để mỗi người có bộ từ riêng
  const userSeenKeys = new Set<string>([...userDaily.keys, ...userReviewKeys]);
  const otherTodayKeys = new Set<string>();
  const excludeSet = new Set<string>(userDaily.recentLemmas);

  for (const w of [...existingToday.news, ...existingToday.ielts]) {
    const clean = cleanTerm(w.word);
    if (clean) {
      excludeSet.add(clean);
      userSeenKeys.add(normKey(clean));
    }
  }
  for (const r of otherTodayRes.data ?? []) {
    const w = (Array.isArray(r.words) ? r.words[0] : r.words) as
      | { lemma?: string | null; norm_key?: string | null }
      | null;
    if (!w) continue;
    if (w.norm_key) otherTodayKeys.add(String(w.norm_key));
    if (w.lemma) {
      const clean = cleanTerm(String(w.lemma));
      if (clean) {
        otherTodayKeys.add(normKey(clean));
        excludeSet.add(clean);
      }
    }
  }

  for (let pass = 0; pass < MAX_PASSES && (savedNews < TARGET_NEWS || savedIelts < TARGET_IELTS); pass++) {
    const remNews = newsList.length > 0 ? Math.max(0, TARGET_NEWS - savedNews) : 0;
    const remIelts = Math.max(0, TARGET_IELTS - savedIelts);
    if (remNews === 0 && remIelts === 0) break;

    // Xin dư +3 từ/nhóm để bù phần bị lọc trùng trong cùng 1 lượt gọi AI
    const askNews = remNews > 0 ? Math.min(8, remNews + 3) : 0;
    const askIelts = remIelts > 0 ? Math.min(8, remIelts + 3) : 0;
    const articles = askNews > 0 ? pickArticleSlice(newsList, pass, 12) : [];

    const res = await askJson<{ items: DailyAiItem[] }>(
      buildDailySystem(askNews, askIelts, Array.from(excludeSet)),
      JSON.stringify({
        date: day,
        needed: { news: askNews, ielts: askIelts },
        articles,
      })
    );

    const rawItems = res.items ?? [];
    if (rawItems.length === 0) break;

    // 3 lượt đầu ưu tiên từ hoàn toàn mới chưa có trong kho chung words;
    // từ lượt thứ 4 cho phép tái sử dụng từ trong kho chung mà user hiện tại chưa học/chưa nhận bao giờ
    const allowSharedFallback = pass >= 3;

    for (const item of rawItems) {
      if (savedNews >= TARGET_NEWS && savedIelts >= TARGET_IELTS) break;
      if (!item.lemma) continue;

      const kind: "news" | "ielts" = item.kind === "news" ? "news" : "ielts";
      if (kind === "news" && (savedNews >= TARGET_NEWS || newsList.length === 0)) continue;
      if (kind === "ielts" && savedIelts >= TARGET_IELTS) continue;

      const cleanLemma = cleanTerm(String(item.lemma));
      if (!cleanLemma || cleanLemma.length < 2) continue;

      const k = normKey(cleanLemma);
      if (!k) continue;

      const variants = possibleLemmas(cleanLemma);
      if (
        userSeenKeys.has(k) ||
        otherTodayKeys.has(k) ||
        variants.some((v) => userSeenKeys.has(v) || otherTodayKeys.has(v))
      ) {
        excludeSet.add(cleanLemma);
        continue;
      }

      const existingWordId = sharedWordMap.get(k);
      const hasVariantInShared = variants.some((v) => v !== k && sharedWordMap.has(v));
      if (!allowSharedFallback && (existingWordId !== undefined || hasVariantInShared)) {
        excludeSet.add(cleanLemma);
        continue;
      }
      if (existingWordId === undefined && hasVariantInShared) {
        excludeSet.add(cleanLemma);
        continue;
      }

      userSeenKeys.add(k);
      excludeSet.add(cleanLemma);

      const matchedArticle = kind === "news" ? matchArticle(item, newsList) : undefined;
      let wordId = existingWordId;

      if (wordId === undefined) {
        const { data: insertedWord, error: wErr } = await db
          .from("words")
          .upsert(
            {
              lemma: cleanLemma,
              norm_key: k,
              ipa: item.ipa || null,
              pos: safePos(item.pos),
              meaning_vi: item.meaning_vi || null,
              definition_en: item.definition_en || null,
              example: item.example || null,
              cefr_level: safeLevel(item.cefr_level),
              topic: safeTopic(item.topic),
              is_awl: !!item.is_awl,
              collocations: safeList(item.collocations),
              synonyms: safeList(item.synonyms),
              status: "approved",
              source: kind === "news" ? "daily-news" : "daily-ielts",
              created_by: userId,
            },
            { onConflict: "norm_key", ignoreDuplicates: true }
          )
          .select("id")
          .maybeSingle();

        if (wErr) continue;

        if (insertedWord?.id) {
          wordId = Number(insertedWord.id);
          sharedWordMap.set(k, wordId);
        } else {
          // Trường hợp 2 user cùng chèn từ giống nhau ở cùng 1 tích tắc -> đọc lại id sẵn có
          const { data: raced } = await db
            .from("words")
            .select("id")
            .eq("norm_key", k)
            .maybeSingle();
          if (!raced?.id) continue;
          wordId = Number(raced.id);
          sharedWordMap.set(k, wordId);
        }
      }

      const { error: dErr } = await db.from("daily_words").upsert(
        {
          user_id: userId,
          day,
          word_id: wordId,
          kind,
          source_sentence: kind === "news" ? item.source_sentence || null : null,
          article_title: kind === "news" ? matchedArticle?.title || item.article_title || null : null,
          article_url: kind === "news" ? matchedArticle?.url || item.article_url || null : null,
        },
        { onConflict: "user_id,day,word_id", ignoreDuplicates: true }
      );

      if (dErr) continue;

      await linkWordsToUser(db, userId, [wordId], kind === "news" ? "daily-news" : "daily-ielts");

      if (kind === "news") savedNews++;
      else savedIelts++;
    }
  }
}

export async function ensureDaily(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string,
  day: string,
  shared?: SharedDailyResources
): Promise<void> {
  const lockKey = `${userId}:${day}`;
  const existingTask = inFlightByUserDay.get(lockKey);
  if (existingTask) return existingTask;

  const task = generateDaily(db, userId, day, shared).finally(() => {
    inFlightByUserDay.delete(lockKey);
  });
  inFlightByUserDay.set(lockKey, task);
  return task;
}

export type PregenerateSummary = {
  day: string;
  checked: number;
  alreadyComplete: number;
  generated: number;
  skippedDisabled: number;
  failed: number;
  timedOut: boolean;
  errors: string[];
};

export async function pregenerateDailyForActiveUsers(
  db: ReturnType<typeof supabaseAdmin>,
  options?: { day?: string; timeBudgetMs?: number }
): Promise<PregenerateSummary> {
  const day = options?.day || dateOffsetVN(0);
  const timeBudgetMs = options?.timeBudgetMs ?? 95_000;
  const startedAt = Date.now();

  const { data: profiles, error: profErr } = await db
    .from("profiles")
    .select("id")
    .eq("is_active", true);

  if (profErr) throw new Error(profErr.message);

  const userIds = (profiles ?? []).map((p) => String(p.id));
  if (userIds.length === 0) {
    return {
      day,
      checked: 0,
      alreadyComplete: 0,
      generated: 0,
      skippedDisabled: 0,
      failed: 0,
      timedOut: false,
      errors: [],
    };
  }

  const [{ data: settingsRows }, { data: existingTodayRows }] = await Promise.all([
    db
      .from("user_settings")
      .select("user_id,notify_daily_vocab")
      .in("user_id", userIds),
    db
      .from("daily_words")
      .select("user_id,kind")
      .eq("day", day)
      .in("user_id", userIds),
  ]);

  const disabledUsers = new Set<string>();
  for (const row of settingsRows ?? []) {
    if (row.notify_daily_vocab === false) {
      disabledUsers.add(String(row.user_id));
    }
  }

  const countsByUser = new Map<string, { news: number; ielts: number }>();
  for (const row of existingTodayRows ?? []) {
    const uid = String(row.user_id);
    const cur = countsByUser.get(uid) ?? { news: 0, ielts: 0 };
    if (row.kind === "news") cur.news += 1;
    else cur.ielts += 1;
    countsByUser.set(uid, cur);
  }

  let alreadyComplete = 0;
  let skippedDisabled = 0;
  const pendingUserIds: string[] = [];

  for (const uid of userIds) {
    if (disabledUsers.has(uid)) {
      skippedDisabled += 1;
      continue;
    }
    const counts = countsByUser.get(uid);
    if (counts && counts.news >= TARGET_NEWS && counts.ielts >= TARGET_IELTS) {
      alreadyComplete += 1;
      continue;
    }
    pendingUserIds.push(uid);
  }

  let generated = 0;
  let failed = 0;
  let timedOut = false;
  const errors: string[] = [];

  if (pendingUserIds.length > 0) {
    // Tải RSS và danh sách từ chung 1 lần dùng chung cho cả lô
    const [sharedWordMap, newsList] = await Promise.all([
      loadAllWordMap(db),
      fetchRecentNews(5),
    ]);
    const shared: SharedDailyResources = { sharedWordMap, newsList };

    for (const uid of pendingUserIds) {
      if (Date.now() - startedAt > timeBudgetMs) {
        timedOut = true;
        break;
      }
      try {
        await ensureDaily(db, uid, day, shared);
        generated += 1;
      } catch (e) {
        failed += 1;
        errors.push(`${uid.slice(0, 8)}: ${(e as Error).message}`);
      }
    }
  }

  return {
    day,
    checked: userIds.length,
    alreadyComplete,
    generated,
    skippedDisabled,
    failed,
    timedOut,
    errors: errors.slice(0, 10),
  };
}
