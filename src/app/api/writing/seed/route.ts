import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { WRITING_PROMPTS_SEED } from "@/data/writing-prompts-seed";

function normalizePromptKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function POST() {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const { data: existingRows, error: fetchErr } = await ctx.db
      .from("writing_prompts")
      .select("prompt_text")
      .eq("user_id", ctx.user.id);

    if (fetchErr) throw new Error(fetchErr.message);

    const existingSet = new Set(
      (existingRows ?? []).map((r) => normalizePromptKey(String(r.prompt_text ?? "")))
    );

    const toInsert = WRITING_PROMPTS_SEED.filter(
      (item) => !existingSet.has(normalizePromptKey(item.prompt_text))
    ).map((item) => ({
      user_id: ctx.user.id,
      task_type: item.task_type,
      sub_type: item.sub_type,
      title: item.title,
      source_name: item.source_name,
      topic: item.topic,
      prompt_text: item.prompt_text,
      chart_notes: item.chart_notes,
      status: "queued" as const,
    }));

    if (toInsert.length === 0) {
      return NextResponse.json({
        ok: true,
        inserted: 0,
        skipped: WRITING_PROMPTS_SEED.length,
        totalSeed: WRITING_PROMPTS_SEED.length,
      });
    }

    const { data: insertedRows, error: insErr } = await ctx.db
      .from("writing_prompts")
      .insert(toInsert)
      .select("id");

    if (insErr) throw new Error(insErr.message);

    const inserted = insertedRows?.length ?? toInsert.length;
    return NextResponse.json({
      ok: true,
      inserted,
      skipped: WRITING_PROMPTS_SEED.length - inserted,
      totalSeed: WRITING_PROMPTS_SEED.length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
