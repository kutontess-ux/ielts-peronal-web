import "server-only";
import type { supabaseAdmin } from "@/lib/supabase";

export function isMissingUserWordsTableError(
  err: { code?: string; message?: string } | null | undefined
): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("user_words") && (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find"));
}

/**
 * Gắn danh sách word_id vào Kho từ vựng cá nhân (public.user_words) của đúng user_id.
 * Không ghi đè source nếu user đã có từ này trước đó (ignoreDuplicates: true).
 */
export async function linkWordsToUser(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string,
  wordIds: number[],
  source: string
): Promise<number> {
  const uniqueIds = Array.from(
    new Set(wordIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))
  );
  if (!userId || uniqueIds.length === 0) return 0;

  const cleanSource = (source || "import").trim() || "import";
  let linked = 0;

  for (let i = 0; i < uniqueIds.length; i += 500) {
    const chunk = uniqueIds.slice(i, i + 500).map((word_id) => ({
      user_id: userId,
      word_id,
      source: cleanSource,
    }));
    const { data, error } = await db
      .from("user_words")
      .upsert(chunk, { onConflict: "user_id,word_id", ignoreDuplicates: true })
      .select("word_id");

    if (error) {
      if (isMissingUserWordsTableError(error)) return 0;
      throw new Error(error.message);
    }
    linked += data?.length ?? 0;
  }

  return linked;
}

/**
 * Lấy tập word_id đang có trong Kho cá nhân (public.user_words) của user.
 */
export async function loadUserWordIdSet(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string,
  filterWordIds?: number[]
): Promise<{ ids: Set<number>; tableMissing: boolean }> {
  const ids = new Set<number>();

  if (filterWordIds) {
    const unique = Array.from(
      new Set(filterWordIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))
    );
    if (unique.length === 0) return { ids, tableMissing: false };
    for (let i = 0; i < unique.length; i += 500) {
      const { data, error } = await db
        .from("user_words")
        .select("word_id")
        .eq("user_id", userId)
        .in("word_id", unique.slice(i, i + 500));
      if (error) {
        if (isMissingUserWordsTableError(error)) return { ids, tableMissing: true };
        throw new Error(error.message);
      }
      for (const r of data ?? []) ids.add(Number(r.word_id));
    }
    return { ids, tableMissing: false };
  }

  const CHUNK = 1000;
  for (let from = 0; from < 50000; from += CHUNK) {
    const { data, error } = await db
      .from("user_words")
      .select("word_id")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, from + CHUNK - 1);
    if (error) {
      if (isMissingUserWordsTableError(error)) return { ids, tableMissing: true };
      throw new Error(error.message);
    }
    const batch = data ?? [];
    for (const r of batch) ids.add(Number(r.word_id));
    if (batch.length < CHUNK) break;
  }
  return { ids, tableMissing: false };
}

/**
 * Đếm số từ trong Kho cá nhân của user (fallback về tổng words nếu DB chưa chạy migration).
 */
export async function countUserWords(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string
): Promise<number> {
  const { count, error } = await db
    .from("user_words")
    .select("word_id,words!inner(status)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("words.status", "approved");

  if (!error) return count ?? 0;
  if (!isMissingUserWordsTableError(error)) {
    throw new Error(error.message);
  }

  const fallback = await db
    .from("words")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("created_by", userId)
    .not("source", "like", "book-%");
  return fallback.count ?? 0;
}

/**
 * Trả Map<norm_key, source> chỉ cho các từ đã nằm trong Kho cá nhân của user hiện tại.
 */
export async function loadUserBankSourceMap(
  db: ReturnType<typeof supabaseAdmin>,
  userId: string,
  normKeys: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const uniqueKeys = Array.from(new Set(normKeys.filter(Boolean)));
  if (!userId || uniqueKeys.length === 0) return result;

  const { data: dictRows, error: dictErr } = await db
    .from("words")
    .select("id,norm_key,source,created_by")
    .in("norm_key", uniqueKeys);
  if (dictErr || !dictRows || dictRows.length === 0) return result;

  const wordIds = dictRows.map((r) => Number(r.id));
  const { data: uwRows, error: uwErr } = await db
    .from("user_words")
    .select("word_id,source")
    .eq("user_id", userId)
    .in("word_id", wordIds);

  if (uwErr) {
    if (isMissingUserWordsTableError(uwErr)) {
      for (const r of dictRows) {
        if (r.created_by === userId) {
          result.set(String(r.norm_key), String(r.source ?? "import"));
        }
      }
    }
    return result;
  }

  const uwSourceById = new Map<number, string>();
  for (const r of uwRows ?? []) {
    uwSourceById.set(Number(r.word_id), String(r.source ?? "import"));
  }
  for (const r of dictRows) {
    const src = uwSourceById.get(Number(r.id));
    if (src) result.set(String(r.norm_key), src);
  }
  return result;
}
