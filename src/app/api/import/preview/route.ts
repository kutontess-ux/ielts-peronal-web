import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { enrich, extractFromPassage } from "@/lib/ai";
import { cleanTerm, normKey, splitInput } from "@/lib/normalize";

export const maxDuration = 120;

// Bước 1: agent xử lý – KHÔNG ghi database. Trả về danh sách để người dùng duyệt.
export async function POST(req: Request) {
  try {
    const { text } = (await req.json()) as { text: string };
    if (!text?.trim()) return NextResponse.json({ error: "Chưa có nội dung" }, { status: 400 });

    const { terms, passage } = splitInput(text);
    let candidates = [...terms];
    if (passage) candidates.push(...(await extractFromPassage(passage)).map(cleanTerm));

    // 1) loại trùng ngay trong danh sách vừa dán
    const seenInput = new Set<string>();
    const inputDup: string[] = [];
    candidates = candidates.filter((c) => {
      if (!c) return false;
      if (seenInput.has(c)) { inputDup.push(c); return false; }
      seenInput.add(c);
      return true;
    });
    if (candidates.length === 0) return NextResponse.json({ error: "Không tìm thấy từ nào" }, { status: 400 });
    if (candidates.length > 300) return NextResponse.json({ error: "Tối đa 300 từ mỗi lần nạp, hãy chia nhỏ." }, { status: 400 });

    // 2) bỏ qua AI cho từ đã có trong kho (so khớp nhanh theo khoá chuẩn hoá của chính từ nhập)
    const db = supabaseAdmin();
    const keys = candidates.map(normKey);
    const { data: existing } = await db.from("words").select("norm_key").in("norm_key", keys);
    const have = new Set((existing ?? []).map((r) => r.norm_key as string));

    const toEnrich = candidates.filter((_, i) => !have.has(keys[i]));
    const enriched = toEnrich.length ? await enrich(toEnrich) : [];

    // 3) kiểm tra lại trùng theo lemma do AI trả về (vd "analysed" -> "analyse")
    const lemKeys = enriched.filter((e) => e.valid).map((e) => normKey(e.lemma));
    const { data: existing2 } = lemKeys.length
      ? await db.from("words").select("norm_key").in("norm_key", lemKeys)
      : { data: [] as { norm_key: string }[] };
    const have2 = new Set((existing2 ?? []).map((r) => r.norm_key as string));

    const seenLemma = new Set<string>();
    const items = enriched.map((e) => {
      if (!e.valid || !e.lemma) return { ...e, status: "invalid" as const };
      const k = normKey(e.lemma);
      if (have2.has(k) || seenLemma.has(k)) return { ...e, norm_key: k, status: "duplicate" as const };
      seenLemma.add(k);
      return { ...e, norm_key: k, status: "new" as const };
    });
    // từ đã có sẵn trong kho (bước 2) cũng báo là trùng
    candidates.forEach((c, i) => {
      if (have.has(keys[i])) items.push({ input: c, lemma: c, norm_key: keys[i], status: "duplicate" } as never);
    });
    inputDup.forEach((c) => items.push({ input: c, lemma: c, status: "duplicate" } as never));

    return NextResponse.json({
      items,
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
