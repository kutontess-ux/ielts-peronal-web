import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { Word } from "@/lib/mock";

// Trả toàn bộ kho từ vựng (dùng cá nhân nên số lượng nhỏ, lọc ở phía trình duyệt)
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from("words")
      .select("id,lemma,ipa,pos,meaning_vi,definition_en,example,cefr_level,topic,is_awl,source")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    const words: Word[] = (data ?? []).map((r) => ({
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
    }));
    return NextResponse.json({ words });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Xoá 1 hoặc nhiều từ khỏi kho (kèm xoá cascade ở daily_words và reviews)
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const singleId = searchParams.get("id");
    let ids: number[] = [];

    if (singleId) {
      ids = [Number(singleId)].filter((n) => Number.isFinite(n) && n > 0);
    } else {
      const body = (await req.json().catch(() => ({}))) as { ids?: number[] };
      ids = (body.ids ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    }

    if (ids.length === 0) {
      return NextResponse.json({ error: "Thiếu id từ cần xoá" }, { status: 400 });
    }

    const { error } = await supabaseAdmin().from("words").delete().in("id", ids);
    if (error) throw new Error(error.message);

    return NextResponse.json({ deleted: ids.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
