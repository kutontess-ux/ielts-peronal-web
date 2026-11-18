import "server-only";
import type { supabaseAdmin } from "@/lib/supabase";

export async function getLegacyCounts(db: ReturnType<typeof supabaseAdmin>) {
  const [
    legacyReviewsRes,
    legacySetsRes,
    legacyFoldersRes,
    legacyPassagesRes,
    legacyNotesRes,
    legacySettingsRes,
    legacyDailyRes,
  ] = await Promise.all([
    db.from("reviews").select("word_id", { count: "exact", head: true }).is("user_id", null),
    db.from("study_sets").select("id", { count: "exact", head: true }).is("user_id", null),
    db.from("study_folders").select("id", { count: "exact", head: true }).is("user_id", null),
    db.from("reading_passages").select("id", { count: "exact", head: true }).is("user_id", null),
    db.from("reading_notes").select("id", { count: "exact", head: true }).is("user_id", null),
    db.from("user_settings").select("id", { count: "exact", head: true }).is("user_id", null),
    db.from("daily_words").select("id", { count: "exact", head: true }).is("user_id", null),
  ]);

  const legacyCounts = {
    reviews: legacyReviewsRes.count ?? 0,
    study_sets: legacySetsRes.count ?? 0,
    study_folders: legacyFoldersRes.count ?? 0,
    reading_passages: legacyPassagesRes.count ?? 0,
    reading_notes: legacyNotesRes.count ?? 0,
    user_settings: legacySettingsRes.count ?? 0,
    daily_words: legacyDailyRes.error ? 0 : (legacyDailyRes.count ?? 0),
  };
  const totalLegacy = Object.values(legacyCounts).reduce((a, b) => a + b, 0);
  return { legacyCounts, totalLegacy };
}

export async function claimLegacyDataForUser(
  db: ReturnType<typeof supabaseAdmin>,
  adminId: string
) {
  await Promise.all([
    db.from("study_folders").update({ user_id: adminId }).is("user_id", null),
    db.from("study_sets").update({ user_id: adminId }).is("user_id", null),
    db.from("reading_passages").update({ user_id: adminId }).is("user_id", null),
    db.from("reading_notes").update({ user_id: adminId }).is("user_id", null),
  ]);

  const { data: adminSettings } = await db
    .from("user_settings")
    .select("id")
    .eq("user_id", adminId)
    .maybeSingle();

  if (!adminSettings) {
    await db.from("user_settings").update({ user_id: adminId }).is("user_id", null);
  } else {
    await db.from("user_settings").delete().is("user_id", null);
  }

  const { data: adminRevRows } = await db
    .from("reviews")
    .select("word_id")
    .eq("user_id", adminId);
  const adminWordIds = new Set((adminRevRows ?? []).map((r) => Number(r.word_id)));

  const { data: legacyRevRows } = await db
    .from("reviews")
    .select("id,word_id")
    .is("user_id", null);

  const claimIds: number[] = [];
  const dupIds: number[] = [];
  for (const r of legacyRevRows ?? []) {
    if (adminWordIds.has(Number(r.word_id))) dupIds.push(Number(r.id));
    else claimIds.push(Number(r.id));
  }

  for (let i = 0; i < claimIds.length; i += 500) {
    await db
      .from("reviews")
      .update({ user_id: adminId })
      .is("user_id", null)
      .in("id", claimIds.slice(i, i + 500));
  }
  for (let i = 0; i < dupIds.length; i += 500) {
    await db
      .from("reviews")
      .delete()
      .is("user_id", null)
      .in("id", dupIds.slice(i, i + 500));
  }

  // Gộp các bản ghi daily_words cũ (user_id IS NULL) về Admin nếu cột user_id đã tồn tại
  try {
    const [{ data: adminDailyRows, error: adErr }, { data: legacyDailyRows, error: ldErr }] =
      await Promise.all([
        db.from("daily_words").select("day,word_id").eq("user_id", adminId),
        db.from("daily_words").select("id,day,word_id").is("user_id", null),
      ]);

    if (!adErr && !ldErr && legacyDailyRows && legacyDailyRows.length > 0) {
      const adminDailyKeys = new Set(
        (adminDailyRows ?? []).map((r) => `${String(r.day)}:${Number(r.word_id)}`)
      );
      const claimDailyIds: number[] = [];
      const dupDailyIds: number[] = [];
      for (const r of legacyDailyRows) {
        const key = `${String(r.day)}:${Number(r.word_id)}`;
        if (adminDailyKeys.has(key)) dupDailyIds.push(Number(r.id));
        else {
          adminDailyKeys.add(key);
          claimDailyIds.push(Number(r.id));
        }
      }
      for (let i = 0; i < claimDailyIds.length; i += 500) {
        await db
          .from("daily_words")
          .update({ user_id: adminId })
          .is("user_id", null)
          .in("id", claimDailyIds.slice(i, i + 500));
      }
      for (let i = 0; i < dupDailyIds.length; i += 500) {
        await db
          .from("daily_words")
          .delete()
          .is("user_id", null)
          .in("id", dupDailyIds.slice(i, i + 500));
      }
    }
  } catch {
    // Bỏ qua nếu chưa chạy migration daily_words.user_id
  }
}

export async function autoClaimLegacyIfAny(
  db: ReturnType<typeof supabaseAdmin>,
  adminId: string
) {
  try {
    const { totalLegacy } = await getLegacyCounts(db);
    if (totalLegacy > 0) {
      await claimLegacyDataForUser(db, adminId);
    }
  } catch {
    // Bỏ qua nếu bảng chưa migrate đủ; không làm chặn đăng nhập
  }
}
