import { NextResponse } from "next/server";
import { requireAuth, type AuthContext } from "@/lib/supabase-server";
import { normKey } from "@/lib/normalize";
import {
  computeWritingStreak,
  countWords,
  detectUsedTargetWords,
  getSubTypeMeta,
  getTodaySchedule,
  toVnDateKey,
  type DrillFocus,
  type SentenceCorrectionItem,
  type WritingGradeResult,
  type WritingMode,
  type WritingSubType,
  type WritingTaskType,
} from "@/lib/writing-frameworks";
import { WRITING_PROMPTS_SEED } from "@/data/writing-prompts-seed";

function isMissingWritingTable(msg: string): boolean {
  const lower = (msg || "").toLowerCase();
  return (
    (lower.includes("writing_prompts") || lower.includes("writing_submissions")) &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
}

export type TargetVocabCard = {
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
};

type RawJoinedWord = {
  id: number;
  lemma: string;
  ipa?: string | null;
  pos?: string | null;
  meaning_vi?: string | null;
  example?: string | null;
  cefr_level?: string | null;
  topic?: string | null;
  collocations?: string[] | null;
  status?: string | null;
};

async function fetchTargetVocabForWriting(
  ctx: AuthContext,
  preferredTopic?: string | null,
  limit = 5
): Promise<TargetVocabCard[]> {
  const seen = new Set<string>();
  const candidates: (TargetVocabCard & { priorityScore: number })[] = [];
  const topicClean = (preferredTopic ?? "").trim().toLowerCase();

  const pushWord = (w: RawJoinedWord | null | undefined, basePriority: number) => {
    if (!w || !w.lemma) return;
    const k = normKey(w.lemma);
    if (!k || seen.has(k)) return;
    seen.add(k);
    const topicMatch =
      topicClean &&
      topicClean !== "other" &&
      (w.topic ?? "").toLowerCase() === topicClean
        ? 20
        : 0;
    candidates.push({
      id: w.id,
      word: w.lemma,
      lemma: w.lemma,
      ipa: w.ipa ?? "",
      pos: w.pos ?? "",
      vi: w.meaning_vi ?? "",
      meaning_vi: w.meaning_vi ?? "",
      example: w.example ?? "",
      level: w.cefr_level ?? "B2",
      cefr_level: w.cefr_level ?? "B2",
      topic: w.topic ?? "Other",
      collocations: Array.isArray(w.collocations) ? w.collocations : [],
      priorityScore: basePriority + topicMatch,
    });
  };

  // 1. Lấy các từ đang học trong SRS (ưu tiên level thấp & sắp đến hạn)
  const { data: revRows } = await ctx.db
    .from("reviews")
    .select(
      "word_id,level,next_review_at,words!inner(id,lemma,ipa,pos,meaning_vi,example,cefr_level,topic,collocations,status)"
    )
    .eq("user_id", ctx.user.id)
    .eq("words.status", "approved")
    .order("level", { ascending: true })
    .order("next_review_at", { ascending: true })
    .limit(25);

  for (const r of revRows ?? []) {
    const w = Array.isArray(r.words) ? (r.words[0] as RawJoinedWord) : (r.words as RawJoinedWord);
    const levelBonus = Math.max(0, 6 - Number(r.level ?? 1)) * 2;
    pushWord(w, 30 + levelBonus);
  }

  // 2. Lấy thêm từ hằng ngày gần nhất của chính người dùng
  const { data: dailyRows } = await ctx.db
    .from("daily_words")
    .select("day,kind,words(id,lemma,ipa,pos,meaning_vi,example,cefr_level,topic,collocations)")
    .eq("user_id", ctx.user.id)
    .order("day", { ascending: false })
    .limit(20);

  for (const d of dailyRows ?? []) {
    const w = Array.isArray(d.words) ? (d.words[0] as RawJoinedWord) : (d.words as RawJoinedWord);
    pushWord(w, d.kind === "ielts" ? 22 : 18);
  }

  // 3. Nếu chưa đủ 5 từ, bổ sung từ học thuật AWL trong kho từ chung
  if (candidates.length < limit) {
    const { data: awlRows } = await ctx.db
      .from("words")
      .select("id,lemma,ipa,pos,meaning_vi,example,cefr_level,topic,collocations,status")
      .eq("status", "approved")
      .eq("is_awl", true)
      .limit(15);

    for (const w of awlRows ?? []) {
      pushWord(w as RawJoinedWord, 10);
    }
  }

  return candidates
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      word: item.word,
      lemma: item.lemma,
      ipa: item.ipa,
      pos: item.pos,
      vi: item.vi,
      meaning_vi: item.meaning_vi,
      example: item.example,
      level: item.level,
      cefr_level: item.cefr_level,
      topic: item.topic,
      collocations: item.collocations,
    }));
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const { searchParams } = new URL(req.url);
    const topicFilter = searchParams.get("topic");

    const todaySchedule = getTodaySchedule();
    const targetVocab = await fetchTargetVocabForWriting(ctx, topicFilter, 5);

    let { data: promptRows, error: promptErr } = await ctx.db
      .from("writing_prompts")
      .select(
        "id,task_type,sub_type,title,source_name,topic,prompt_text,image_data_url,chart_notes,ai_guide_json,status,times_practiced,last_practiced_at,created_at"
      )
      .eq("user_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (promptErr) {
      if (isMissingWritingTable(promptErr.message)) {
        return NextResponse.json({
          needsMigration: true,
          prompts: [],
          submissions: [],
          streak: computeWritingStreak([]),
          todaySchedule,
          recommendedPrompt: null,
          errorStats: { grammar: 0, lexical: 0, coherence: 0, task_response: 0, total: 0 },
          recentMistakes: [],
          targetVocab,
        });
      }
      throw new Error(promptErr.message);
    }

    if ((promptRows ?? []).length === 0) {
      const toInsert = WRITING_PROMPTS_SEED.map((item) => ({
        user_id: ctx.user.id,
        task_type: item.task_type,
        sub_type: item.sub_type,
        title: item.title,
        source_name: item.source_name,
        topic: item.topic,
        prompt_text: item.prompt_text,
        image_data_url: item.image_data_url,
        chart_notes: item.chart_notes,
        status: "queued" as const,
      }));
      const { data: seededRows } = await ctx.db
        .from("writing_prompts")
        .insert(toInsert)
        .select(
          "id,task_type,sub_type,title,source_name,topic,prompt_text,image_data_url,chart_notes,ai_guide_json,status,times_practiced,last_practiced_at,created_at"
        );
      if (seededRows && seededRows.length > 0) {
        promptRows = seededRows;
      }
    }

    const { data: subRows, error: subErr } = await ctx.db
      .from("writing_submissions")
      .select(
        "id,prompt_id,mode,drill_focus,task_type,sub_type,topic,prompt_snapshot,image_snapshot,target_words,used_target_words,content,word_count,duration_seconds,overall_band,tr_band,cc_band,lr_band,gra_band,feedback_json,rewritten_sentences_json,discipline_completed,studied_at,created_at"
      )
      .eq("user_id", ctx.user.id)
      .order("studied_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (subErr) {
      if (isMissingWritingTable(subErr.message)) {
        return NextResponse.json({
          needsMigration: true,
          prompts: [],
          submissions: [],
          streak: computeWritingStreak([]),
          todaySchedule,
          recommendedPrompt: null,
          errorStats: { grammar: 0, lexical: 0, coherence: 0, task_response: 0, total: 0 },
          recentMistakes: [],
          targetVocab,
        });
      }
      throw new Error(subErr.message);
    }

    const prompts = (promptRows ?? []).map((p) => ({
      ...p,
      has_ai_guide: Boolean(p.ai_guide_json),
    }));

    const submissions = subRows ?? [];
    const streak = computeWritingStreak(submissions);

    // Chọn đề gợi ý cho nhiệm vụ hôm nay (ưu tiên đề queued khớp taskType của lịch hôm nay)
    const queuedForTodayTask = prompts.find(
      (p) => p.status === "queued" && p.task_type === todaySchedule.taskType
    );
    const anyQueued = prompts.find((p) => p.status === "queued");
    const recommendedPrompt = queuedForTodayTask ?? anyQueued ?? prompts[0] ?? null;

    // Tổng hợp Sổ tay lỗi sai (Error Notebook)
    const errorStats = {
      grammar: 0,
      lexical: 0,
      coherence: 0,
      task_response: 0,
      total: 0,
    };

    const recentMistakes: {
      id: string;
      submissionId: number;
      submission_id: number;
      studiedAt: string;
      studied_at: string;
      topic: string;
      taskType: WritingTaskType;
      original: string;
      error_type: "grammar" | "lexical" | "coherence" | "task_response";
      explanation_vi: string;
      band65_fix: string;
      band75_upgrade: string;
      rewritten: boolean;
    }[] = [];

    for (const sub of submissions) {
      const fb = sub.feedback_json as WritingGradeResult | null;
      const corrections = fb?.sentence_corrections;
      if (!Array.isArray(corrections)) continue;
      const rewrittenMap = (sub.rewritten_sentences_json ?? {}) as Record<string, string>;

      corrections.forEach((item: SentenceCorrectionItem, idx: number) => {
        if (!item?.has_error || !item.error_type || item.error_type === "none") return;
        const eType = item.error_type;
        if (eType in errorStats) {
          errorStats[eType] += 1;
          errorStats.total += 1;
        }
        if (recentMistakes.length < 40 && item.original && item.band65_fix) {
          recentMistakes.push({
            id: `${sub.id}-${idx}`,
            submissionId: sub.id,
            submission_id: sub.id,
            studiedAt: sub.studied_at,
            studied_at: sub.studied_at,
            topic: sub.topic || "Other",
            taskType: (sub.task_type as WritingTaskType) || "task2",
            original: item.original,
            error_type: eType,
            explanation_vi: item.explanation_vi || "",
            band65_fix: item.band65_fix,
            band75_upgrade: item.band75_upgrade || "",
            rewritten: Boolean(rewrittenMap[String(idx)]?.trim()),
          });
        }
      });
    }

    return NextResponse.json({
      needsMigration: false,
      prompts,
      submissions,
      streak,
      todaySchedule,
      recommendedPrompt,
      errorStats,
      recentMistakes,
      targetVocab,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const body = (await req.json()) as {
      action?: "create_prompt" | "start_session";
      startImmediately?: boolean;
      startSession?: boolean;
      prompt_id?: number | null;
      promptId?: number | null;
      mode?: WritingMode;
      drill_focus?: DrillFocus;
      drillFocus?: DrillFocus;
      task_type?: WritingTaskType;
      taskType?: WritingTaskType;
      sub_type?: WritingSubType;
      subType?: WritingSubType;
      title?: string;
      source_name?: string;
      sourceName?: string;
      topic?: string;
      prompt_text?: string;
      promptText?: string;
      image_data_url?: string | null;
      imageDataUrl?: string | null;
      chart_notes?: string | null;
      chartNotes?: string | null;
    };

    const existingPromptId = Number(body.prompt_id ?? body.promptId ?? 0);
    const shouldStartSession =
      body.action === "start_session" ||
      Boolean(body.startImmediately) ||
      Boolean(body.startSession) ||
      existingPromptId > 0;

    type PromptRowShape = {
      id: number;
      task_type: WritingTaskType;
      sub_type: WritingSubType;
      title: string;
      source_name: string | null;
      topic: string;
      prompt_text: string;
      image_data_url: string | null;
      chart_notes: string | null;
    };

    let promptRow: PromptRowShape | null = null;

    if (existingPromptId > 0) {
      const { data: foundPrompt, error: findErr } = await ctx.db
        .from("writing_prompts")
        .select(
          "id,task_type,sub_type,title,source_name,topic,prompt_text,image_data_url,chart_notes"
        )
        .eq("id", existingPromptId)
        .eq("user_id", ctx.user.id)
        .maybeSingle();

      if (findErr) throw new Error(findErr.message);
      if (!foundPrompt) {
        return NextResponse.json({ error: "Không tìm thấy đề bài trong kho" }, { status: 404 });
      }
      promptRow = foundPrompt as PromptRowShape;
    } else {
      const promptText = (body.prompt_text ?? body.promptText ?? "").trim();
      if (!promptText || promptText.length < 15) {
        return NextResponse.json(
          { error: "Vui lòng nhập nội dung đề bài IELTS thật (tối thiểu 15 ký tự)" },
          { status: 400 }
        );
      }

      const taskType: WritingTaskType =
        (body.task_type ?? body.taskType) === "task1" ? "task1" : "task2";
      const subMeta = getSubTypeMeta(body.sub_type ?? body.subType, taskType);
      const topic = (body.topic ?? "").trim() || "Other";
      const sourceName = (body.source_name ?? body.sourceName ?? "").trim() || null;
      const rawTitle = (body.title ?? "").trim();
      const autoTitle =
        rawTitle ||
        `${taskType === "task1" ? "Task 1" : "Task 2"} (${subMeta.shortLabel}): ${promptText.slice(0, 68)}${
          promptText.length > 68 ? "..." : ""
        }`;

      const { data: createdPrompt, error: createErr } = await ctx.db
        .from("writing_prompts")
        .insert({
          user_id: ctx.user.id,
          task_type: taskType,
          sub_type: subMeta.id,
          title: autoTitle,
          source_name: sourceName,
          topic,
          prompt_text: promptText,
          image_data_url: (body.image_data_url ?? body.imageDataUrl ?? "").trim() || null,
          chart_notes: (body.chart_notes ?? body.chartNotes ?? "").trim() || null,
          status: "queued",
        })
        .select(
          "id,task_type,sub_type,title,source_name,topic,prompt_text,image_data_url,chart_notes,status,times_practiced,created_at"
        )
        .single();

      if (createErr) throw new Error(createErr.message);
      promptRow = createdPrompt as PromptRowShape;

      if (!shouldStartSession) {
        return NextResponse.json({ prompt: createdPrompt, id: createdPrompt.id });
      }
    }

    if (!promptRow) {
      return NextResponse.json({ error: "Không xác định được đề bài" }, { status: 400 });
    }

    const drillFocus: DrillFocus =
      body.drill_focus ??
      body.drillFocus ??
      (body.mode === "full_essay"
        ? "full"
        : promptRow.task_type === "task1"
        ? "task1_overview"
        : "body_peel_1");

    const mode: WritingMode =
      body.mode ?? (drillFocus === "full" ? "full_essay" : "daily_drill");

    const vocabCards = await fetchTargetVocabForWriting(ctx, promptRow.topic, 5);
    const targetWords = vocabCards.map((v) => v.lemma);

    const { data: submission, error: subInsErr } = await ctx.db
      .from("writing_submissions")
      .insert({
        user_id: ctx.user.id,
        prompt_id: promptRow.id,
        mode,
        drill_focus: drillFocus,
        task_type: promptRow.task_type,
        sub_type: promptRow.sub_type,
        topic: promptRow.topic || "Other",
        prompt_snapshot: promptRow.prompt_text,
        image_snapshot: promptRow.image_data_url || null,
        target_words: targetWords,
        used_target_words: detectUsedTargetWords("", targetWords),
        step_drafts_json: {},
        content: "",
        word_count: countWords(""),
        duration_seconds: 0,
        rewritten_sentences_json: {},
        discipline_completed: false,
        studied_at: toVnDateKey(),
      })
      .select("*")
      .single();

    if (subInsErr) throw new Error(subInsErr.message);

    return NextResponse.json({
      prompt: promptRow,
      submission,
      submissionId: submission.id,
      id: submission.id,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind");
    const rawId = Number(searchParams.get("id") ?? 0);
    const promptId = Number(searchParams.get("promptId") ?? (kind === "prompt" ? rawId : 0));
    const submissionId = Number(
      searchParams.get("submissionId") ?? (kind === "submission" ? rawId : 0)
    );

    if (promptId > 0) {
      const { error } = await ctx.db
        .from("writing_prompts")
        .delete()
        .eq("id", promptId)
        .eq("user_id", ctx.user.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, deletedPromptId: promptId });
    }

    if (submissionId > 0) {
      const { error } = await ctx.db
        .from("writing_submissions")
        .delete()
        .eq("id", submissionId)
        .eq("user_id", ctx.user.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, deletedSubmissionId: submissionId });
    }

    return NextResponse.json({ error: "Thiếu ID đề bài hoặc bài viết cần xoá" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
