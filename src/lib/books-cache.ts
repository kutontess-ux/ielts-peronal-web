import "server-only";
import type { supabaseAdmin } from "@/lib/supabase";
import type { Word } from "@/lib/mock";

type RawBookWordRow = {
  id: number;
  lemma: string;
  ipa: string | null;
  pos: string | null;
  meaning_vi: string | null;
  definition_en: string | null;
  example: string | null;
  cefr_level: string | null;
  topic: string | null;
  is_awl: boolean;
  source: string | null;
  synonyms?: string[] | null;
};

const BOOK_WORD_COLUMNS =
  "id,lemma,ipa,pos,meaning_vi,definition_en,example,cefr_level,topic,is_awl,source,synonyms";
const CHUNK = 1000;
const MAX_BOOK_WORDS = 20000;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedWords: Word[] | null = null;
let cachedAt = 0;
let inflightLoad: Promise<Word[]> | null = null;

function mapBookWord(r: RawBookWordRow): Word {
  return {
    id: r.id,
    word: r.lemma,
    ipa: r.ipa ?? "",
    pos: r.pos ?? "",
    vi: r.meaning_vi ?? "",
    en: r.definition_en ?? "",
    example: r.example ?? "",
    level: (r.cefr_level ?? "B2") as Word["level"],
    topic: r.topic ?? "Other",
    awl: r.is_awl,
    source: r.source ?? "import",
    synonyms: Array.isArray(r.synonyms) ? r.synonyms : [],
  };
}

export function invalidateBooksCache() {
  cachedWords = null;
  cachedAt = 0;
}

async function fetchBookWordsParallel(db: ReturnType<typeof supabaseAdmin>): Promise<Word[]> {
  const { count, error: countErr } = await db
    .from("words")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .like("source", "book-%");

  if (countErr) throw new Error(countErr.message);

  const total = Math.min(count ?? 0, MAX_BOOK_WORDS);
  if (total === 0) return [];

  const offsets: number[] = [];
  for (let from = 0; from < total; from += CHUNK) {
    offsets.push(from);
  }

  const batches = await Promise.all(
    offsets.map(async (from) => {
      const { data, error } = await db
        .from("words")
        .select(BOOK_WORD_COLUMNS)
        .eq("status", "approved")
        .like("source", "book-%")
        .order("created_at", { ascending: false })
        .range(from, from + CHUNK - 1);
      if (error) throw new Error(error.message);
      return ((data ?? []) as RawBookWordRow[]).map(mapBookWord);
    })
  );

  return batches.flat();
}

export async function getCachedBookWords(
  db: ReturnType<typeof supabaseAdmin>,
  forceRefresh = false
): Promise<Word[]> {
  if (!forceRefresh && cachedWords && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedWords;
  }
  if (!forceRefresh && inflightLoad) {
    return inflightLoad;
  }

  const task = fetchBookWordsParallel(db)
    .then((words) => {
      cachedWords = words;
      cachedAt = Date.now();
      return words;
    })
    .finally(() => {
      if (inflightLoad === task) {
        inflightLoad = null;
      }
    });

  inflightLoad = task;
  return task;
}
