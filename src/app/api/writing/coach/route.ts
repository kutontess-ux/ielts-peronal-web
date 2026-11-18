import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { consumeAiQuota } from "@/lib/ai-quota";
import { askJsonWithVision, TOPICS } from "@/lib/ai";
import { normKey } from "@/lib/normalize";
import { linkWordsToUser } from "@/lib/user-words";
import {
  countWords,
  detectUsedTargetWords,
  getBlueprintForSession,
  getSubTypeMeta,
  type DrillFocus,
  type OutlineGuideResult,
  type RecommendedVocabItem,
  type WritingGradeResult,
  type WritingSubType,
  type WritingTaskType,
} from "@/lib/writing-frameworks";

const OUTLINE_SYSTEM_PROMPT = `Bạn là Giám khảo & Gia sư IELTS Academic Writing giàu kinh nghiệm chuyên kèm học viên Việt Nam từ trình độ B1 lên Band 6.5–7.5+.
Nhiệm vụ: Phân tích đề thi thật do học viên cung cấp (và đọc kỹ hình ảnh biểu đồ/bản đồ/quy trình nếu là Task 1 có ảnh đính kèm) để lập dàn ý hướng dẫn chi tiết.
TUYỆT ĐỐI KHÔNG tự chế đề bài mới. Chỉ phân tích đúng đề bài và số liệu trong ảnh của học viên.

Trả về đúng định dạng JSON sau:
{
  "task_analysis": {
    "main_topic_vi": "Tóm tắt chủ đề & yêu cầu trọng tâm bằng tiếng Việt (1-2 câu)",
    "required_parts_vi": ["Vế bắt buộc phải trả lời 1", "Vế bắt buộc phải trả lời 2"],
    "common_pitfalls_vi": ["Bẫy lạc đề hoặc lỗi học viên B1 hay mắc ở đề này 1", "Bẫy 2"],
    "suggested_stance_vi": "Gợi ý hướng tiếp cận / lập trường rõ ràng dễ viết đạt 6.5+ nhất (hoặc cách chia nhóm số liệu nếu là Task 1)"
  },
  "step_guides": {
    "intro_paraphrase_hint": "Gợi ý cụ thể cách paraphrase câu đề bài này (kèm 1 câu mẫu tiếng Anh)",
    "thesis_or_overview_hint": "Gợi ý câu Thesis Statement (Task 2) hoặc 2 câu Overview tóm tắt xu hướng/cực trị (Task 1) sát đề này",
    "body1_peel_hint": "Gợi ý chi tiết cho Body 1 (Luận điểm 1 -> Giải thích -> Ví dụ cụ thể; hoặc Nhóm số liệu 1 nếu là Task 1)",
    "body2_peel_hint": "Gợi ý chi tiết cho Body 2 (Luận điểm 2 -> Giải thích -> Ví dụ cụ thể; hoặc Nhóm số liệu 2 nếu là Task 1)",
    "conclusion_hint": "Gợi ý câu Kết bài ngắn gọn chốt lại toàn bài"
  },
  "topic_collocations": [
    {
      "phrase": "cụm từ học thuật B2-C1 sát chủ đề đề bài",
      "meaning_vi": "nghĩa tiếng Việt ngắn gọn",
      "example_sentence": "1 câu ví dụ áp dụng trực tiếp vào đề bài này",
      "cefr_level": "B2"
    }
  ],
  "grammar_structures": [
    {
      "pattern_name": "Tên cấu trúc câu ăn điểm Band 6.5+ (VD: Mệnh đề nhượng bộ / Câu bị động quy trình / So sánh gấp bội)",
      "formula": "Công thức ngắn gọn",
      "applied_example": "Câu tiếng Anh áp dụng trực tiếp vào đề bài này",
      "explanation_vi": "Giải thích ngắn gọn cách dùng"
    }
  ]
}
Yêu cầu: topic_collocations có 6-8 cụm từ; grammar_structures có 2-3 cấu trúc.`;

const GRADE_SYSTEM_PROMPT = `Bạn là Giám khảo chấm thi IELTS Academic Writing chính thức, chấm bài và sửa lỗi chi tiết cho học viên Việt Nam mục tiêu Band 6.5–7.5+.
Hãy chấm điểm công tâm, sát thang điểm IELTS 4 tiêu chí (làm tròn đến 0.5, ví dụ: 5.5, 6.0, 6.5, 7.0) và sửa chi tiết từng câu trong bài viết của học viên.
Nếu là bài luyện đoạn ngắn (Daily Micro-Writing như chỉ viết Mở bài, Overview hoặc 1 đoạn Body PEEL), hãy đánh giá chất lượng học thuật, độ mạch lạc, từ vựng và ngữ pháp của chính đoạn đó trên thang IELTS tương ứng và viết model_version cho đúng phần được giao.

Trả về đúng định dạng JSON sau:
{
  "overall_band": 6.0,
  "tr_band": 6.0,
  "cc_band": 6.0,
  "lr_band": 6.5,
  "gra_band": 6.0,
  "summary_vi": "Nhận xét tổng quan 2-3 câu bằng tiếng Việt: khen ngợi điểm làm tốt và chỉ ra điểm nghẽn lớn nhất cần sửa để lên 6.5+.",
  "criteria_feedback": {
    "tr_vi": {
      "strengths": "Điểm mạnh về Task Response / Task Achievement (tiếng Việt)",
      "improvements": "Điểm cần cải thiện cụ thể (tiếng Việt)"
    },
    "cc_vi": {
      "strengths": "Điểm mạnh về Coherence & Cohesion (tiếng Việt)",
      "improvements": "Điểm cần cải thiện cụ thể (tiếng Việt)"
    },
    "lr_vi": {
      "strengths": "Điểm mạnh về Lexical Resource (tiếng Việt)",
      "improvements": "Điểm cần cải thiện cụ thể (tiếng Việt)"
    },
    "gra_vi": {
      "strengths": "Điểm mạnh về Grammatical Range & Accuracy (tiếng Việt)",
      "improvements": "Điểm cần cải thiện cụ thể (tiếng Việt)"
    }
  },
  "sentence_corrections": [
    {
      "original": "Trích nguyên văn từng câu trong bài của học viên",
      "has_error": true,
      "error_type": "grammar",
      "explanation_vi": "Giải thích ngắn gọn lỗi sai ngữ pháp / từ vựng / diễn đạt hoặc lý do câu đã tốt",
      "band65_fix": "Bản sửa chuẩn Band 6.5+ (giữ sát ý gốc của học viên, tự nhiên, đúng ngữ pháp để học viên gõ lại)",
      "band75_upgrade": "Bản nâng cấp Band 7.5+ (dùng collocations và cấu trúc học thuật cao cấp hơn)"
    }
  ],
  "model_version": "Bài viết / Đoạn văn mẫu hoàn chỉnh chuẩn Band 7.0+ được viết lại dựa trên chính hướng lập luận của học viên (chia đoạn bằng ký tự xuống dòng \\n\\n).",
  "recommended_vocab": [
    {
      "lemma": "từ/cụm từ dạng nguyên mẫu chữ thường (vd: mitigate climate change)",
      "ipa": "/.../",
      "pos": "v",
      "meaning_vi": "nghĩa tiếng Việt ngắn gọn (<= 8 từ)",
      "definition_en": "short English definition (<= 18 words)",
      "example": "1 câu ví dụ học thuật IELTS tự nhiên",
      "cefr_level": "B2",
      "topic": "chọn đúng 1 trong: ${TOPICS.join(", ")}",
      "is_awl": true,
      "collocations": ["cụm đi kèm 1", "cụm đi kèm 2"],
      "synonyms": ["từ đồng nghĩa 1", "từ đồng nghĩa 2"]
    }
  ]
}
Quy tắc bắt buộc:
- error_type chỉ nhận 1 trong 5 giá trị: "grammar", "lexical", "coherence", "task_response", "none". Nếu has_error = false thì error_type = "none".
- Tách đầy đủ các câu trong bài học viên vào sentence_corrections. Với những câu có lỗi hoặc diễn đạt lủng củng B1, đặt has_error = true và viết band65_fix thật chuẩn xác, gọn gàng (1 câu hoàn chỉnh) để học viên luyện gõ lại ở Bước 3.
- recommended_vocab gồm 5–7 từ/cụm từ đắt giá nhất rút ra từ bản nâng cấp & bài mẫu.`;

function roundBand(val: unknown, fallback = 6.0): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  const clamped = Math.min(9.0, Math.max(1.0, n));
  return Math.round(clamped * 2) / 2;
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const body = (await req.json()) as {
      mode?: "outline_guide" | "grade";
      submissionId?: number;
      promptId?: number;
      forceAi?: boolean;
      content?: string;
      stepDrafts?: Record<string, string>;
      durationSeconds?: number;
      usedTargetWords?: string[];
    };

    const mode = body.mode ?? "grade";

    // =========================================================================
    // NHÁNH 1: AI GIA SƯ PHÂN TÍCH ĐỀ & GỢI Ý DÀN Ý (1 REQUEST - CACHED)
    // =========================================================================
    if (mode === "outline_guide") {
      let promptId = Number(body.promptId ?? 0);
      let submissionRow: Record<string, unknown> | null = null;

      if (body.submissionId) {
        const { data: sRow } = await ctx.db
          .from("writing_submissions")
          .select("*")
          .eq("id", Number(body.submissionId))
          .eq("user_id", ctx.user.id)
          .maybeSingle();
        submissionRow = sRow;
        if (!promptId && sRow?.prompt_id) {
          promptId = Number(sRow.prompt_id);
        }
      }

      type CoachPromptRow = {
        id: number;
        task_type: WritingTaskType;
        sub_type: WritingSubType;
        topic: string | null;
        source_name: string | null;
        prompt_text: string;
        image_data_url: string | null;
        chart_notes: string | null;
        ai_guide_json: OutlineGuideResult | null;
      };

      let promptRow: CoachPromptRow | null = null;

      if (promptId > 0) {
        const { data: pRow } = await ctx.db
          .from("writing_prompts")
          .select("*")
          .eq("id", promptId)
          .eq("user_id", ctx.user.id)
          .maybeSingle();
        promptRow = (pRow as CoachPromptRow | null) ?? null;
      }

      // Kiểm tra cache 0 token
      if (promptRow?.ai_guide_json && !body.forceAi) {
        return NextResponse.json({
          guide: promptRow.ai_guide_json,
          cached: true,
        });
      }

      const taskType: WritingTaskType =
        (promptRow?.task_type ??
          (submissionRow?.task_type as WritingTaskType) ??
          "task2") === "task1"
          ? "task1"
          : "task2";
      const subType = (promptRow?.sub_type ??
        (submissionRow?.sub_type as WritingSubType) ??
        "opinion") as WritingSubType;
      const subMeta = getSubTypeMeta(subType, taskType);
      const promptText = String(
        promptRow?.prompt_text ?? submissionRow?.prompt_snapshot ?? ""
      ).trim();

      if (!promptText) {
        return NextResponse.json({ error: "Không tìm thấy nội dung đề bài để phân tích" }, { status: 400 });
      }

      const quotaErr = await consumeAiQuota(ctx, "writing-outline");
      if (quotaErr) return quotaErr;

      const imageDataUrl =
        promptRow?.image_data_url ??
        (submissionRow?.image_snapshot as string | null) ??
        null;

      const userPrompt = `Loại bài: IELTS Academic Writing ${
        taskType === "task1" ? "Task 1 (Báo cáo biểu đồ/quy trình)" : "Task 2 (Bài nghị luận)"
      }
Dạng bài chi tiết: ${subMeta.label} (${subMeta.desc})
Chủ đề: ${promptRow?.topic ?? submissionRow?.topic ?? "General"}
Nguồn đề: ${promptRow?.source_name ?? "Đề thi thật do học viên sưu tầm"}
Đề bài gốc:
"""
${promptText}
"""
${promptRow?.chart_notes ? `Ghi chú biểu đồ của học viên: ${promptRow.chart_notes}\n` : ""}${
        imageDataUrl
          ? "Đề bài có đính kèm hình ảnh biểu đồ/bản đồ/quy trình. Hãy quan sát kỹ các trục, đơn vị, xu hướng, số liệu lớn nhất/nhỏ nhất trong ảnh để hướng dẫn học viên viết Overview và gom nhóm Body 1 & Body 2 thật chuẩn xác."
          : ""
      }`;

      const guide = await askJsonWithVision<OutlineGuideResult>(
        "reason",
        OUTLINE_SYSTEM_PROMPT,
        userPrompt,
        imageDataUrl
      );

      if (promptRow?.id) {
        await ctx.db
          .from("writing_prompts")
          .update({ ai_guide_json: guide })
          .eq("id", promptRow.id)
          .eq("user_id", ctx.user.id);
      }

      return NextResponse.json({
        guide,
        cached: false,
      });
    }

    // =========================================================================
    // NHÁNH 2: CHẤM CHỮA TOÀN DIỆN 4 TIÊU CHÍ IELTS (1 REQUEST)
    // =========================================================================
    const submissionId = Number(body.submissionId ?? 0);
    if (!submissionId) {
      return NextResponse.json({ error: "Thiếu submissionId cần chấm điểm" }, { status: 400 });
    }

    const { data: subRow, error: subErr } = await ctx.db
      .from("writing_submissions")
      .select("*")
      .eq("id", submissionId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();

    if (subErr) throw new Error(subErr.message);
    if (!subRow) {
      return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 });
    }

    const essayContent = String(body.content ?? subRow.content ?? "").trim();
    const wordCount = countWords(essayContent);
    if (wordCount < 15) {
      return NextResponse.json(
        { error: "Bài viết quá ngắn (dưới 15 từ). Hãy viết đầy đủ câu/đoạn trước khi gửi chấm AI." },
        { status: 400 }
      );
    }

    const quotaErr = await consumeAiQuota(ctx, "writing-grade");
    if (quotaErr) return quotaErr;

    const taskType: WritingTaskType = subRow.task_type === "task1" ? "task1" : "task2";
    const drillFocus = (subRow.drill_focus ?? "full") as DrillFocus;
    const subMeta = getSubTypeMeta(subRow.sub_type, taskType);
    const blueprint = getBlueprintForSession(taskType, drillFocus, subRow.sub_type);
    const targetWords: string[] = Array.isArray(subRow.target_words) ? subRow.target_words : [];
    const usedTargetWords =
      body.usedTargetWords ?? detectUsedTargetWords(essayContent, targetWords);

    const userPrompt = `Thông tin bài nộp của học viên:
- Kỹ năng: IELTS Academic Writing ${taskType === "task1" ? "Task 1" : "Task 2"} (${subMeta.label})
- Chế độ luyện tập: ${
      subRow.mode === "full_essay"
        ? "Viết trọn bài hoàn chỉnh (Full Essay)"
        : `Luyện viết đoạn ngắn kỷ luật hằng ngày (${blueprint.title})`
    }
- Mục tiêu tối thiểu của nhiệm vụ này: >= ${blueprint.minWords} từ (Học viên đã viết: ${wordCount} từ)
- Từ vựng mục tiêu SRS khuyến khích chèn vào bài: ${
      targetWords.length > 0 ? targetWords.join(", ") : "Không có"
    } (Đã áp dụng: ${usedTargetWords.length > 0 ? usedTargetWords.join(", ") : "Chưa dùng"})

Đề bài gốc:
"""
${subRow.prompt_snapshot}
"""

Bài làm của học viên:
"""
${essayContent}
"""`;

    const rawResult = await askJsonWithVision<WritingGradeResult>(
      "reason",
      GRADE_SYSTEM_PROMPT,
      userPrompt,
      subRow.image_snapshot
    );

    const trBand = roundBand(rawResult.tr_band, 6.0);
    const ccBand = roundBand(rawResult.cc_band, 6.0);
    const lrBand = roundBand(rawResult.lr_band, 6.0);
    const graBand = roundBand(rawResult.gra_band, 6.0);
    const computedAvg = roundBand((trBand + ccBand + lrBand + graBand) / 4, 6.0);
    const overallBand = roundBand(rawResult.overall_band, computedAvg);

    const rawVocab = Array.isArray(rawResult.recommended_vocab)
      ? rawResult.recommended_vocab
      : [];
    const vocabWithNorm = rawVocab
      .filter((v) => v && typeof v.lemma === "string" && v.lemma.trim().length >= 2)
      .map((v) => ({
        lemma: v.lemma.toLowerCase().trim(),
        norm_key: normKey(v.lemma),
        ipa: v.ipa || "",
        pos: v.pos || "n",
        meaning_vi: v.meaning_vi || "",
        definition_en: v.definition_en || "",
        example: v.example || "",
        cefr_level: (["B1", "B2", "C1", "C2"].includes(v.cefr_level)
          ? v.cefr_level
          : "B2") as "B1" | "B2" | "C1" | "C2",
        topic: v.topic || subRow.topic || "Other",
        is_awl: Boolean(v.is_awl),
        collocations: Array.isArray(v.collocations) ? v.collocations.slice(0, 4) : [],
        synonyms: Array.isArray(v.synonyms) ? v.synonyms.slice(0, 4) : [],
      }));

    const existingNormSet = new Set<string>();
    if (vocabWithNorm.length > 0) {
      const { data: existingWords } = await ctx.db
        .from("words")
        .select("norm_key")
        .in(
          "norm_key",
          vocabWithNorm.map((v) => v.norm_key)
        );
      for (const w of existingWords ?? []) {
        existingNormSet.add(w.norm_key);
      }
    }

    const recommendedVocab: RecommendedVocabItem[] = vocabWithNorm.map((v) => ({
      ...v,
      existsInBank: existingNormSet.has(v.norm_key),
    }));

    const sentenceCorrections = Array.isArray(rawResult.sentence_corrections)
      ? rawResult.sentence_corrections.map((s) => ({
          original: String(s.original ?? "").trim(),
          has_error: Boolean(s.has_error),
          error_type: (["grammar", "lexical", "coherence", "task_response", "none"].includes(
            s.error_type
          )
            ? s.error_type
            : s.has_error
            ? "grammar"
            : "none") as "grammar" | "lexical" | "coherence" | "task_response" | "none",
          explanation_vi: String(s.explanation_vi ?? "").trim(),
          band65_fix: String(s.band65_fix ?? s.original ?? "").trim(),
          band75_upgrade: String(s.band75_upgrade ?? s.band65_fix ?? "").trim(),
        }))
      : [];

    const hasErrorSentences = sentenceCorrections.some(
      (s) => s.has_error && s.band65_fix.length > 0
    );
    const disciplineCompleted = !hasErrorSentences;

    const feedbackPayload: WritingGradeResult = {
      overall_band: overallBand,
      tr_band: trBand,
      cc_band: ccBand,
      lr_band: lrBand,
      gra_band: graBand,
      summary_vi: rawResult.summary_vi || "",
      criteria_feedback: {
        tr_vi: {
          strengths: rawResult.criteria_feedback?.tr_vi?.strengths || "",
          improvements: rawResult.criteria_feedback?.tr_vi?.improvements || "",
        },
        cc_vi: {
          strengths: rawResult.criteria_feedback?.cc_vi?.strengths || "",
          improvements: rawResult.criteria_feedback?.cc_vi?.improvements || "",
        },
        lr_vi: {
          strengths: rawResult.criteria_feedback?.lr_vi?.strengths || "",
          improvements: rawResult.criteria_feedback?.lr_vi?.improvements || "",
        },
        gra_vi: {
          strengths: rawResult.criteria_feedback?.gra_vi?.strengths || "",
          improvements: rawResult.criteria_feedback?.gra_vi?.improvements || "",
        },
      },
      sentence_corrections: sentenceCorrections,
      model_version: rawResult.model_version || "",
      recommended_vocab: recommendedVocab,
    };

    const updatePayload: Record<string, unknown> = {
      content: essayContent,
      word_count: wordCount,
      used_target_words: usedTargetWords,
      overall_band: overallBand,
      tr_band: trBand,
      cc_band: ccBand,
      lr_band: lrBand,
      gra_band: graBand,
      feedback_json: feedbackPayload,
      discipline_completed: disciplineCompleted,
    };
    if (body.stepDrafts !== undefined) {
      updatePayload.step_drafts_json = body.stepDrafts;
    }
    if (body.durationSeconds !== undefined) {
      updatePayload.duration_seconds = Math.max(0, Math.round(Number(body.durationSeconds)));
    }

    const { data: updatedSubmission, error: updErr } = await ctx.db
      .from("writing_submissions")
      .update(updatePayload)
      .eq("id", submissionId)
      .eq("user_id", ctx.user.id)
      .select("*")
      .single();

    if (updErr) throw new Error(updErr.message);

    // Cập nhật số lần luyện của đề trong kho
    if (subRow.prompt_id) {
      const { data: pRow } = await ctx.db
        .from("writing_prompts")
        .select("id,times_practiced,status")
        .eq("id", subRow.prompt_id)
        .eq("user_id", ctx.user.id)
        .maybeSingle();

      if (pRow) {
        const nextStatus =
          disciplineCompleted && overallBand >= 6.5
            ? "mastered"
            : pRow.status === "mastered"
            ? "mastered"
            : "practiced";
        await ctx.db
          .from("writing_prompts")
          .update({
            status: nextStatus,
            times_practiced: Math.max(1, Number(pRow.times_practiced ?? 0) + 1),
            last_practiced_at: new Date().toISOString(),
          })
          .eq("id", pRow.id)
          .eq("user_id", ctx.user.id);
      }
    }

    return NextResponse.json({
      submission: updatedSubmission,
      feedback: feedbackPayload,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// 1-Click lưu từ vựng / collocations gợi ý từ Writing Coach vào Kho từ vựng & trả về wordIds để ghi danh SRS
export async function PUT(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const body = (await req.json()) as {
      items?: Partial<RecommendedVocabItem>[];
      source?: string;
    };

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "Không có từ vựng nào để lưu" }, { status: 400 });
    }

    const rows = items
      .map((i) => {
        const lemma = String(i.lemma ?? "").toLowerCase().trim();
        const nk = i.norm_key || normKey(lemma);
        if (!lemma || !nk) return null;
        return {
          lemma,
          norm_key: nk,
          ipa: i.ipa || null,
          pos: i.pos || "phr",
          meaning_vi: i.meaning_vi || null,
          definition_en: i.definition_en || null,
          example: i.example || null,
          cefr_level: ["A2", "B1", "B2", "C1", "C2"].includes(String(i.cefr_level))
            ? i.cefr_level
            : "B2",
          topic: i.topic || "Other",
          is_awl: Boolean(i.is_awl),
          collocations: Array.isArray(i.collocations) ? i.collocations : [],
          synonyms: Array.isArray(i.synonyms) ? i.synonyms : [],
          status: "approved",
          source:
            ctx.isAdmin && body.source ? String(body.source).trim() : "writing-coach",
          created_by: ctx.user.id,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Từ vựng không hợp lệ" }, { status: 400 });
    }

    const { error: upsertErr } = await ctx.db
      .from("words")
      .upsert(rows, { onConflict: "norm_key", ignoreDuplicates: true });

    if (upsertErr) throw new Error(upsertErr.message);

    const normKeys = rows.map((r) => r.norm_key);
    const { data: resolvedWords, error: selErr } = await ctx.db
      .from("words")
      .select("id,lemma,norm_key")
      .in("norm_key", normKeys);

    if (selErr) throw new Error(selErr.message);

    const wordIds = (resolvedWords ?? []).map((w) => w.id);
    await linkWordsToUser(ctx.db, ctx.user.id, wordIds, "writing-coach");

    return NextResponse.json({
      wordIds,
      count: wordIds.length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
