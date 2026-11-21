import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { consumeAiQuota } from "@/lib/ai-quota";
import { enrich, extractFromPassage } from "@/lib/ai";
import { cleanTerm, normKey, splitInput } from "@/lib/normalize";
import { loadUserWordIdSet } from "@/lib/user-words";

export const maxDuration = 120;

type DictWordRow = {
  id: number;
  norm_key: string;
  lemma: string;
  ipa: string | null;
  pos: string | null;
  meaning_vi: string | null;
  definition_en: string | null;
  example: string | null;
  cefr_level: string | null;
  topic: string | null;
  is_awl: boolean;
  collocations: string[] | null;
  synonyms: string[] | null;
  created_by?: string | null;
};

const DICT_COLS =
  "id,norm_key,lemma,ipa,pos,meaning_vi,definition_en,example,cefr_level,topic,is_awl,collocations,synonyms,created_by";

// Bước 1: agent xử lý – KHÔNG ghi database.
// - Tận dụng từ điển public.words (0 lượt AI) nếu từ đã được dịch sẵn từ trước (kể cả từ Oxford 3000 hay user khác).
// - Chỉ đánh dấu "duplicate" nếu từ đã nằm trong Kho cá nhân (user_words) của chính người dùng này.
export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;
    const db = ctx.db;

    const { text } = (await req.json()) as { text: string };
    if (!text?.trim()) return NextResponse.json({ error: "Chưa có nội dung" }, { status: 400 });

    const { terms, passage, structured } = splitInput(text);
    const structuredMap = new Map((structured ?? []).map((s) => [normKey(s.word), s]));

    const candidatesRaw = [...terms];
    if (passage) {
      const quotaErr = await consumeAiQuota(ctx, "import-passage");
      if (quotaErr) return quotaErr;
      candidatesRaw.push(...(await extractFromPassage(passage)).map(cleanTerm));
    }

    // 1) loại trùng ngay trong danh sách vừa dán
    const seenInput = new Set<string>();
    const inputDup: string[] = [];
    const candidates = candidatesRaw.filter((c) => {
      if (!c) return false;
      if (seenInput.has(c)) {
        inputDup.push(c);
        return false;
      }
      seenInput.add(c);
      return true;
    });
    if (candidates.length === 0) return NextResponse.json({ error: "Không tìm thấy từ nào" }, { status: 400 });
    if (candidates.length > 300) return NextResponse.json({ error: "Tối đa 300 từ mỗi lần nạp, hãy chia nhỏ." }, { status: 400 });

    // 2) kiểm tra cache từ điển public.words (0 lượt AI)
    const keys = candidates.map(normKey);
    const { data: existing } = await db.from("words").select(DICT_COLS).in("norm_key", keys);
    const dictMap = new Map<string, DictWordRow>();
    for (const r of (existing ?? []) as DictWordRow[]) {
      dictMap.set(r.norm_key, r);
    }

    const toEnrich = candidates.filter((_, i) => !dictMap.has(keys[i]));
    const selfEnriched: Enriched[] = [];
    const needAi: string[] = [];

    for (const c of toEnrich) {
      const s = structuredMap.get(normKey(c));
      if (s && s.meaning_vi) {
        selfEnriched.push({
          input: c,
          valid: true,
          lemma: s.word,
          ipa: s.ipa ?? "",
          pos: s.pos ?? "n",
          meaning_vi: s.meaning_vi,
          definition_en: s.meaning_vi,
          example: s.example ?? "",
          cefr_level: (s.level ?? "B2") as Enriched["cefr_level"],
          topic: "Other",
          is_awl: false,
          collocations: [],
          synonyms: s.synonyms ?? [],
        });
      } else {
        needAi.push(c);
      }
    }

    if (needAi.length > 0 && !passage) {
      const quotaErr = await consumeAiQuota(ctx, "import-enrich");
      if (quotaErr) return quotaErr;
    }

    const aiEnriched = needAi.length ? await enrich(needAi) : [];
    const enriched = [...selfEnriched, ...aiEnriched];

    // 3) kiểm tra lại cache theo lemma do AI trả về (vd "analysed" -> "analyse")
    const lemKeys = enriched.filter((e) => e.valid).map((e) => normKey(e.lemma));
    const { data: existing2 } = lemKeys.length
      ? await db.from("words").select(DICT_COLS).in("norm_key", lemKeys)
      : { data: [] as DictWordRow[] };
    for (const r of (existing2 ?? []) as DictWordRow[]) {
      dictMap.set(r.norm_key, r);
    }

    // 4) đối chiếu với Kho cá nhân (user_words) của riêng user hiện tại
    const allDictIds = Array.from(dictMap.values()).map((d) => Number(d.id));
    const { ids: userWordIds, tableMissing } = await loadUserWordIdSet(
      db,
      ctx.user.id,
      allDictIds
    );
    const effectiveUserHas = (row: DictWordRow): boolean =>
      tableMissing ? row.created_by === ctx.user.id : userWordIds.has(Number(row.id));

    const seenLemma = new Set<string>();
    const existingWordIds = new Set<number>();
    const items: Record<string, unknown>[] = [];

    const dictToItem = (row: DictWordRow, inputLabel: string, status: "new" | "duplicate") => {
      const s = structuredMap.get(row.norm_key);
      return {
        input: inputLabel,
        lemma: row.lemma,
        norm_key: row.norm_key,
        existingId: row.id,
        ipa: s?.ipa || row.ipa || "",
        pos: s?.pos || row.pos || "",
        meaning_vi: s?.meaning_vi || row.meaning_vi || "",
        definition_en: row.definition_en || s?.meaning_vi || "",
        example: s?.example || row.example || "",
        cefr_level: s?.level || row.cefr_level || "B2",
        topic: row.topic ?? "Other",
        is_awl: !!row.is_awl,
        collocations: row.collocations ?? [],
        synonyms: s?.synonyms && s.synonyms.length > 0 ? s.synonyms : row.synonyms ?? [],
        cachedFromBank: true,
        status,
      };
    };

    // Từ đã có sẵn trong cache từ điển (0 lượt AI)
    candidates.forEach((c, i) => {
      const match = dictMap.get(keys[i]);
      if (!match) return;
      if (seenLemma.has(match.norm_key)) {
        items.push(dictToItem(match, c, "duplicate"));
        if (effectiveUserHas(match)) existingWordIds.add(match.id);
        return;
      }
      seenLemma.add(match.norm_key);
      if (effectiveUserHas(match)) {
        existingWordIds.add(match.id);
        items.push(dictToItem(match, c, "duplicate"));
      } else {
        items.push(dictToItem(match, c, "new"));
      }
    });

    // Từ mới được AI phân tích
    for (const e of enriched) {
      if (!e.valid || !e.lemma) {
        items.push({ ...e, status: "invalid" as const });
        continue;
      }
      const k = normKey(e.lemma);
      const match = dictMap.get(k);
      if (match) {
        if (seenLemma.has(k)) {
          if (effectiveUserHas(match)) existingWordIds.add(match.id);
          items.push(dictToItem(match, e.input, "duplicate"));
          continue;
        }
        seenLemma.add(k);
        if (effectiveUserHas(match)) {
          existingWordIds.add(match.id);
          items.push(dictToItem(match, e.input, "duplicate"));
        } else {
          items.push(dictToItem(match, e.input, "new"));
        }
        continue;
      }
      if (seenLemma.has(k)) {
        items.push({ ...e, norm_key: k, status: "duplicate" as const });
        continue;
      }
      seenLemma.add(k);
      items.push({ ...e, norm_key: k, status: "new" as const });
    }

    inputDup.forEach((c) => items.push({ input: c, lemma: c, status: "duplicate" }));

    return NextResponse.json({
      items,
      existingIds: Array.from(existingWordIds),
      summary: {
        total: candidates.length + inputDup.length,
        new: items.filter((i) => i.status === "new").length,
        duplicate: items.filter((i) => i.status === "duplicate").length,
        invalid: items.filter((i) => i.status === "invalid").length,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
