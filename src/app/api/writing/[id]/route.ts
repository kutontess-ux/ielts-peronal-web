import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { normKey } from "@/lib/normalize";
import {
  countWords,
  detectUsedTargetWords,
  isRewriteMatched,
  type SentenceCorrectionItem,
  type WritingGradeResult,
} from "@/lib/writing-frameworks";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const { id } = await context.params;
    const submissionId = Number(id);
    if (!Number.isFinite(submissionId) || submissionId <= 0) {
      return NextResponse.json({ error: "ID phiên luyện viết không hợp lệ" }, { status: 400 });
    }

    const { data: submission, error: subErr } = await ctx.db
      .from("writing_submissions")
      .select("*")
      .eq("id", submissionId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();

    if (subErr) throw new Error(subErr.message);
    if (!submission) {
      return NextResponse.json({ error: "Không tìm thấy phiên luyện viết" }, { status: 404 });
    }

    let prompt = null;
    if (submission.prompt_id) {
      const { data: pRow } = await ctx.db
        .from("writing_prompts")
        .select("*")
        .eq("id", submission.prompt_id)
        .eq("user_id", ctx.user.id)
        .maybeSingle();
      prompt = pRow ?? null;
    }

    const targetLemmas: string[] = Array.isArray(submission.target_words)
      ? submission.target_words
      : [];

    let targetVocab: {
      id: number;
      word: string;
      lemma: string;
      ipa: string;
      pos: string;
      vi: string;
      meaning_vi: string;
      example: string;
      level: string;
      cefr_level: string;
      topic: string;
      collocations: string[];
    }[] = [];

    if (targetLemmas.length > 0) {
      const normKeys = targetLemmas.map((l) => normKey(l)).filter(Boolean);
      const { data: wordRows } = await ctx.db
        .from("words")
        .select("id,lemma,norm_key,ipa,pos,meaning_vi,example,cefr_level,topic,collocations")
        .in("norm_key", normKeys);

      const byNorm = new Map((wordRows ?? []).map((w) => [w.norm_key, w]));
      targetVocab = targetLemmas.map((lemma, idx) => {
        const matched = byNorm.get(normKey(lemma));
        return {
          id: matched?.id ?? -(idx + 1),
          word: matched?.lemma ?? lemma,
          lemma: matched?.lemma ?? lemma,
          ipa: matched?.ipa ?? "",
          pos: matched?.pos ?? "",
          vi: matched?.meaning_vi ?? "",
          meaning_vi: matched?.meaning_vi ?? "",
          example: matched?.example ?? "",
          level: matched?.cefr_level ?? "B2",
          cefr_level: matched?.cefr_level ?? "B2",
          topic: matched?.topic ?? submission.topic ?? "Other",
          collocations: Array.isArray(matched?.collocations) ? matched.collocations : [],
        };
      });
    }

    return NextResponse.json({
      submission,
      prompt,
      aiGuide: prompt?.ai_guide_json ?? null,
      targetVocab,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const { id } = await context.params;
    const submissionId = Number(id);
    if (!Number.isFinite(submissionId) || submissionId <= 0) {
      return NextResponse.json({ error: "ID phiên luyện viết không hợp lệ" }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await ctx.db
      .from("writing_submissions")
      .select("*")
      .eq("id", submissionId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 });
    }

    const body = (await req.json()) as {
      content?: string;
      step_drafts_json?: Record<string, string>;
      stepDrafts?: Record<string, string>;
      duration_seconds?: number;
      durationSeconds?: number;
      used_target_words?: string[];
      usedTargetWords?: string[];
      rewritten_sentences_json?: Record<string, string>;
      rewrittenSentences?: Record<string, string>;
      discipline_completed?: boolean;
      disciplineCompleted?: boolean;
    };

    const patch: Record<string, unknown> = {};

    if (body.content !== undefined) {
      patch.content = body.content;
      patch.word_count = countWords(body.content);
      const targetWords: string[] = Array.isArray(existing.target_words)
        ? existing.target_words
        : [];
      patch.used_target_words =
        body.used_target_words ??
        body.usedTargetWords ??
        detectUsedTargetWords(body.content, targetWords);
    } else if (body.used_target_words !== undefined || body.usedTargetWords !== undefined) {
      patch.used_target_words = body.used_target_words ?? body.usedTargetWords;
    }

    if (body.step_drafts_json !== undefined || body.stepDrafts !== undefined) {
      patch.step_drafts_json = body.step_drafts_json ?? body.stepDrafts ?? {};
    }

    if (body.duration_seconds !== undefined || body.durationSeconds !== undefined) {
      patch.duration_seconds = Math.max(
        0,
        Math.round(Number(body.duration_seconds ?? body.durationSeconds ?? 0))
      );
    }

    const nextRewritten =
      body.rewritten_sentences_json ?? body.rewrittenSentences ?? existing.rewritten_sentences_json;
    if (body.rewritten_sentences_json !== undefined || body.rewrittenSentences !== undefined) {
      patch.rewritten_sentences_json = nextRewritten ?? {};
    }

    // Kiểm tra hoàn thành Bước 3 (Active Rewrite)
    const fb = existing.feedback_json as WritingGradeResult | null;
    const corrections: SentenceCorrectionItem[] = Array.isArray(fb?.sentence_corrections)
      ? fb.sentence_corrections
      : [];
    const errorIndices = corrections
      .map((item, idx) => (item?.has_error && item.band65_fix ? idx : -1))
      .filter((idx) => idx >= 0);

    let allErrorsRewritten = false;
    if (existing.overall_band !== null && existing.overall_band !== undefined) {
      if (errorIndices.length === 0) {
        allErrorsRewritten = true;
      } else if (nextRewritten && typeof nextRewritten === "object") {
        const mapObj = nextRewritten as Record<string, string>;
        allErrorsRewritten = errorIndices.every((idx) => {
          const typed = String(mapObj[String(idx)] ?? "").trim();
          const target = corrections[idx]?.band65_fix ?? "";
          return isRewriteMatched(typed, target);
        });
      }
    }

    const explicitDiscipline = body.discipline_completed ?? body.disciplineCompleted;
    const nextDisciplineCompleted =
      Boolean(existing.discipline_completed) ||
      allErrorsRewritten ||
      (Boolean(explicitDiscipline) && existing.overall_band !== null);

    if (nextDisciplineCompleted !== existing.discipline_completed) {
      patch.discipline_completed = nextDisciplineCompleted;
    }

    const { data: updated, error: updErr } = await ctx.db
      .from("writing_submissions")
      .update(patch)
      .eq("id", submissionId)
      .eq("user_id", ctx.user.id)
      .select("*")
      .single();

    if (updErr) throw new Error(updErr.message);

    // Nếu vừa hoàn thành kỷ luật 3 bước và có liên kết đề trong kho -> cập nhật trạng thái đề
    if (nextDisciplineCompleted && !existing.discipline_completed && existing.prompt_id) {
      const { data: pRow } = await ctx.db
        .from("writing_prompts")
        .select("id,times_practiced,status")
        .eq("id", existing.prompt_id)
        .eq("user_id", ctx.user.id)
        .maybeSingle();

      if (pRow) {
        const band = Number(existing.overall_band ?? 0);
        const nextStatus = band >= 6.5 ? "mastered" : "practiced";
        await ctx.db
          .from("writing_prompts")
          .update({
            status: pRow.status === "mastered" ? "mastered" : nextStatus,
            times_practiced: Math.max(1, Number(pRow.times_practiced ?? 0) + 1),
            last_practiced_at: new Date().toISOString(),
          })
          .eq("id", pRow.id)
          .eq("user_id", ctx.user.id);
      }
    }

    return NextResponse.json({ submission: updated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
