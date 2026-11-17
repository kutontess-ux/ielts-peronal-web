import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { askJson, TOPICS, type Enriched } from "@/lib/ai";
import { normKey } from "@/lib/normalize";
import { fetchRecentNews } from "@/lib/rss";
import type { Word } from "@/lib/mock";

export const maxDuration = 120;

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

function dateOffsetVN(daysAgo = 0): string {
  const d = new Date(Date.now() - daysAgo * 86400 * 1000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
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
    level: (String(w.cefr_level ?? "B2")) as Word["level"],
    topic: String(w.topic ?? "Other"),
    awl: Boolean(w.is_awl),
    kind: r.kind as "news" | "ielts",
    source_sentence: r.source_sentence ?? undefined,
    article_title: r.article_title ?? undefined,
    article_url: r.article_url ?? undefined,
  };
}

async function readDaily(day: string): Promise<{ news: DailyWord[]; ielts: DailyWord[] }> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("daily_words")
    .select(
      "kind,source_sentence,article_title,article_url,words(id,lemma,ipa,pos,meaning_vi,definition_en,example,cefr_level,topic,is_awl)"
    )
    .eq("day", day)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map(mapRow).filter((x): x is DailyWord => x !== null);
  return {
    news: rows.filter((r) => r.kind === "news"),
    ielts: rows.filter((r) => r.kind === "ielts"),
  };
}

async function readRange(fromDay: string, toDay: string): Promise<DailyGroup[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("daily_words")
    .select(
      "day,kind,source_sentence,article_title,article_url,words(id,lemma,ipa,pos,meaning_vi,definition_en,example,cefr_level,topic,is_awl)"
    )
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

async function generateDaily(day: string) {
  const db = supabaseAdmin();
  const [{ data: existingRows }, newsList] = await Promise.all([
    db.from("words").select("lemma,norm_key"),
    fetchRecentNews(4),
  ]);

  const haveKeys = new Set((existingRows ?? []).map((r) => r.norm_key as string));

  const system = `Bạn là giáo viên IELTS Academic cho người Việt trình độ B1 hướng tới band 6.5.
Nhiệm vụ: Tạo danh sách 10 từ vựng hằng ngày gồm:
1) ĐÚNG 5 từ (kind="news") lấy từ nội dung các bài báo RSS được cung cấp, ưu tiên mức B2-C1, hữu ích cho IELTS Reading/Writing. Với mỗi từ này, ghi rõ "source_sentence" (câu trích từ bài báo chứa từ đó), "article_title" và "article_url" lấy chính xác từ bài báo.
2) ĐÚNG 5 từ (kind="ielts") là từ vựng học thuật IELTS Academic (B2-C1) hay dùng trong Writing Task 2 / Reading, khác với 5 từ báo.

QUY TẮC BẮT BUỘC:
- Ưu tiên từ vựng phong phú, giá trị học thuật cao, không chọn từ quá đơn giản (A1-A2).
- Không trùng lặp giữa 10 từ với nhau.
- lemma: dạng gốc, chữ thường.
- ipa: phiên âm IPA Anh-Anh có dấu gạch chéo.
- pos: một trong n, v, adj, adv, phr.
- meaning_vi: nghĩa tiếng Việt ngắn gọn (<= 8 từ).
- definition_en: định nghĩa tiếng Anh đơn giản (<= 20 từ).
- example: 1 câu ví dụ IELTS tự nhiên.
- cefr_level: B2 hoặc C1 (hoặc B1 nếu rất cần).
- topic: chọn đúng 1 trong: ${TOPICS.join(", ")}.
- is_awl: true nếu thuộc Academic Word List của Coxhead.
- collocations: tối đa 3 cụm. synonyms: tối đa 3 từ.
Trả về JSON dạng {"items":[...]}.`;

  const res = await askJson<{ items: DailyAiItem[] }>(
    system,
    JSON.stringify({ date: day, articles: newsList.slice(0, 5) })
  );

  const picked: DailyAiItem[] = [];
  const seen = new Set<string>(haveKeys);

  for (const item of res.items ?? []) {
    if (!item.lemma) continue;
    const k = normKey(item.lemma);
    if (seen.has(k)) continue;
    seen.add(k);
    picked.push({ ...item, lemma: item.lemma.toLowerCase().trim() });
  }

  for (const item of picked) {
    const k = normKey(item.lemma);
    const { data: wordRow, error: wErr } = await db
      .from("words")
      .upsert(
        {
          lemma: item.lemma,
          norm_key: k,
          ipa: item.ipa || null,
          pos: item.pos || null,
          meaning_vi: item.meaning_vi || null,
          definition_en: item.definition_en || null,
          example: item.example || null,
          cefr_level: item.cefr_level || "B2",
          topic: item.topic || "Other",
          is_awl: !!item.is_awl,
          collocations: item.collocations ?? [],
          synonyms: item.synonyms ?? [],
          status: "approved",
          source: item.kind === "news" ? "daily-news" : "daily-ielts",
        },
        { onConflict: "norm_key" }
      )
      .select("id")
      .single();

    if (wErr || !wordRow) continue;

    await db.from("daily_words").upsert(
      {
        day,
        word_id: wordRow.id,
        kind: item.kind === "news" ? "news" : "ielts",
        source_sentence: item.source_sentence || null,
        article_title: item.article_title || null,
        article_url: item.article_url || null,
      },
      { onConflict: "day,word_id", ignoreDuplicates: true }
    );
  }
}

// GET chỉ đọc dữ liệu từ Supabase (nhanh, không bao giờ gọi RSS/AI)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range");
    const today = dateOffsetVN(0);
    const yesterday = dateOffsetVN(1);

    const { data: daysData } = await supabaseAdmin()
      .from("daily_words")
      .select("day")
      .order("day", { ascending: false })
      .limit(100);
    const history = Array.from(new Set((daysData ?? []).map((d) => String(d.day))));

    if (range === "7d") {
      const fromDay = dateOffsetVN(6);
      const groups = await readRange(fromDay, today);
      return NextResponse.json({ today, yesterday, range: "7d", groups, history });
    }

    const day = searchParams.get("date") || today;
    const result = await readDaily(day);
    const needsGenerate = day === today && result.news.length === 0 && result.ielts.length === 0;

    return NextResponse.json({
      date: day,
      today,
      yesterday,
      needsGenerate,
      ...result,
      history,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST chỉ chạy 1 lần trong ngày khi hôm nay chưa có từ nào
export async function POST() {
  try {
    const today = dateOffsetVN(0);
    const existing = await readDaily(today);
    if (existing.news.length > 0 || existing.ielts.length > 0) {
      return NextResponse.json({ date: today, generated: false, ...existing });
    }

    await generateDaily(today);
    const created = await readDaily(today);
    return NextResponse.json({ date: today, generated: true, ...created });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
