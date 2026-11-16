import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type Item = {
  lemma: string; norm_key: string; ipa?: string; pos?: string; meaning_vi?: string;
  definition_en?: string; example?: string; cefr_level?: string; topic?: string;
  is_awl?: boolean; collocations?: string[]; synonyms?: string[];
};

// Bước 2: người dùng đã duyệt -> ghi vào kho. Trùng khoá chuẩn hoá thì bỏ qua (an toàn tuyệt đối).
export async function POST(req: Request) {
  try {
    const { items, stats, source } = (await req.json()) as {
      items: Item[];
      stats?: { total: number; duplicates: number; invalid: number };
      source?: string;
    };
    if (!items?.length) return NextResponse.json({ error: "Không có từ nào để lưu" }, { status: 400 });

    const rows = items.map((i) => ({
      lemma: i.lemma.toLowerCase().trim(),
      norm_key: i.norm_key,
      ipa: i.ipa || null,
      pos: i.pos || null,
      meaning_vi: i.meaning_vi || null,
      definition_en: i.definition_en || null,
      example: i.example || null,
      cefr_level: i.cefr_level || null,
      topic: i.topic || "Other",
      is_awl: !!i.is_awl,
      collocations: i.collocations ?? [],
      synonyms: i.synonyms ?? [],
      status: "approved",
      source: source || "import",
    }));

    const db = supabaseAdmin();
    const { data, error } = await db
      .from("words")
      .upsert(rows, { onConflict: "norm_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);

    const added = data?.length ?? 0;
    await db.from("imports").insert({
      total: stats?.total ?? items.length,
      added,
      duplicates: (stats?.duplicates ?? 0) + (items.length - added),
      invalid: stats?.invalid ?? 0,
    });
    return NextResponse.json({ added, skipped: items.length - added });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
