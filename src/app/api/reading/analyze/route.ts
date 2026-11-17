import { NextResponse } from "next/server";
import { askJsonWithProfile, TOPICS } from "@/lib/ai";
import { cleanTerm, normKey } from "@/lib/normalize";
import { supabaseAdmin } from "@/lib/supabase";

const VALID_LEVELS = new Set(["A2", "B1", "B2", "C1", "C2"]);
function safeLevel(lv?: string): "A2" | "B1" | "B2" | "C1" | "C2" {
  const up = String(lv ?? "").toUpperCase().trim();
  return (VALID_LEVELS.has(up) ? up : "B2") as "A2" | "B1" | "B2" | "C1" | "C2";
}

type VocabResult = {
  valid: boolean;
  lemma: string;
  ipa: string;
  pos: string;
  meaning_vi: string;
  meaning_in_context: string;
  definition_en: string;
  example?: string;
  cefr_level: "A2" | "B1" | "B2" | "C1" | "C2";
  topic: string;
  is_awl: boolean;
  collocations: string[];
  synonyms: string[];
};

type SentenceResult = {
  translation_vi: string;
  subject: string;
  main_verb: string;
  clauses: string[];
  grammar_points: string[];
  key_vocab: { word: string; meaning_vi: string }[];
};

type QuestionResult = {
  evidence_quote: string;
  explanation_vi: string;
  paraphrases: { question_phrase: string; passage_phrase: string }[];
  tip_vi: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      mode: "vocab" | "sentence" | "question" | "batch_vocab";
      passageId?: number;
      term?: string;
      sentence?: string;
      question?: string;
      correctAnswer?: string;
      userAnswer?: string;
      passageContent?: string;
      forceAi?: boolean;
    };

    const db = supabaseAdmin();

    if (body.mode === "vocab") {
      const rawTerm = cleanTerm(body.term ?? "");
      const sentence = (body.sentence ?? "").trim();
      if (!rawTerm) return NextResponse.json({ error: "Chưa chọn từ cần tra" }, { status: 400 });
      const searchKey = normKey(rawTerm);

      // Tầng 1: Kiểm tra lịch sử tra từ trong reading_notes của bài này (0 token)
      let existingNoteId: number | null = null;
      if (body.passageId) {
        const { data: noteRows } = await db
          .from("reading_notes")
          .select("*")
          .eq("passage_id", body.passageId)
          .eq("kind", "vocab");

        const matchedNote = (noteRows ?? []).find((n) => {
          const rj = (n.result_json ?? {}) as Record<string, unknown>;
          const nk = typeof rj.norm_key === "string" ? rj.norm_key : normKey(n.target_text);
          return nk === searchKey || cleanTerm(n.target_text) === rawTerm;
        });

        if (matchedNote) {
          existingNoteId = matchedNote.id;
          if (!body.forceAi) {
            const rj = matchedNote.result_json as Record<string, unknown>;
            const key = typeof rj.norm_key === "string" ? rj.norm_key : searchKey;
            const { data: existing } = await db
              .from("words")
              .select("id,source")
              .eq("norm_key", key)
              .maybeSingle();
            return NextResponse.json({
              vocab: {
                ...rj,
                norm_key: key,
                existsInBank: !!existing,
                bankSource: existing?.source ?? null,
              },
              note: matchedNote,
              cached: true,
              cacheSource: "note",
            });
          }
        }
      }

      // Tầng 2: Kiểm tra trong Kho từ vựng (words) (0 token)
      if (!body.forceAi) {
        const { data: bankWord } = await db
          .from("words")
          .select("*")
          .eq("norm_key", searchKey)
          .maybeSingle();

        if (bankWord) {
          return NextResponse.json({
            vocab: {
              lemma: bankWord.lemma,
              norm_key: bankWord.norm_key,
              ipa: bankWord.ipa ?? "",
              pos: bankWord.pos ?? "",
              meaning_vi: bankWord.meaning_vi ?? "",
              meaning_in_context: bankWord.meaning_vi ?? "",
              definition_en: bankWord.definition_en ?? "",
              example: sentence || bankWord.example || "",
              cefr_level: safeLevel(bankWord.cefr_level),
              topic: bankWord.topic ?? "Other",
              is_awl: !!bankWord.is_awl,
              collocations: bankWord.collocations ?? [],
              synonyms: bankWord.synonyms ?? [],
              existsInBank: true,
              bankSource: bankWord.source ?? "import",
            },
            cached: true,
            cacheSource: "bank",
          });
        }
      }

      // Tầng 3: Gọi AI theo profile "vocab" (ưu tiên model nhẹ/miễn phí)
      const ai = await askJsonWithProfile<VocabResult>(
        "vocab",
        `Bạn là từ điển IELTS Academic cho người Việt trình độ B1 hướng tới 6.5.
Phân tích từ/cụm từ tiếng Anh dựa trên câu ngữ cảnh. Trả về JSON:
{
  "valid": true/false,
  "lemma": "dạng gốc chữ thường (vd analysed -> analyse; giữ cụm cố định)",
  "ipa": "phiên âm IPA Anh-Anh",
  "pos": "n|v|adj|adv|phr|prep|conj",
  "meaning_vi": "nghĩa tiếng Việt chính ngắn gọn (<=8 từ)",
  "meaning_in_context": "nghĩa sát nhất trong câu ngữ cảnh này (<=12 từ)",
  "definition_en": "định nghĩa tiếng Anh đơn giản (<=20 từ)",
  "cefr_level": "A2|B1|B2|C1|C2",
  "topic": "chọn 1 trong: ${TOPICS.join(", ")}",
  "is_awl": true/false,
  "collocations": ["tối đa 3 cụm hay đi kèm"],
  "synonyms": ["tối đa 3 từ đồng nghĩa"]
}`,
        `Từ/cụm từ: "${rawTerm}"\nCâu ngữ cảnh: "${sentence || rawTerm}"`
      );

      if (!ai.valid || !ai.lemma) {
        return NextResponse.json({ error: `"${rawTerm}" không phải từ/cụm từ tiếng Anh hợp lệ` }, { status: 400 });
      }

      const key = normKey(ai.lemma);
      const { data: existing } = await db
        .from("words")
        .select("id,source")
        .eq("norm_key", key)
        .maybeSingle();

      const vocabPayload = {
        ...ai,
        cefr_level: safeLevel(ai.cefr_level),
        norm_key: key,
        example: sentence,
        existsInBank: !!existing,
        bankSource: existing?.source ?? null,
      };

      let savedNote = null;
      if (body.passageId) {
        if (existingNoteId) {
          const { data } = await db
            .from("reading_notes")
            .update({ target_text: ai.lemma, result_json: vocabPayload })
            .eq("id", existingNoteId)
            .select("*")
            .single();
          savedNote = data;
        } else {
          const { data } = await db
            .from("reading_notes")
            .insert({
              passage_id: body.passageId,
              kind: "vocab",
              target_text: ai.lemma,
              result_json: vocabPayload,
            })
            .select("*")
            .single();
          savedNote = data;
        }
      }

      return NextResponse.json({ vocab: vocabPayload, note: savedNote, cached: false });
    }

    if (body.mode === "batch_vocab") {
      const passageContent = (body.passageContent ?? "").trim();
      if (!passageContent) {
        return NextResponse.json({ error: "Thiếu nội dung bài đọc" }, { status: 400 });
      }

      const ai = await askJsonWithProfile<{ items: VocabResult[] }>(
        "vocab",
        `Bạn là giáo viên IELTS Academic. Hãy chọn ra 10 từ hoặc cụm từ (collocations) trình độ B2-C1 đắt giá nhất trong bài đọc để học viên Việt Nam (B1 -> 6.5) học.
Với mỗi mục, trích nguyên câu chứa từ đó trong bài làm "example".
Trả về JSON:
{"items": [{
  "valid": true,
  "lemma": "dạng gốc chữ thường",
  "ipa": "IPA Anh-Anh",
  "pos": "n|v|adj|adv|phr",
  "meaning_vi": "nghĩa tiếng Việt chính (<=8 từ)",
  "meaning_in_context": "nghĩa trong bài đọc (<=12 từ)",
  "definition_en": "định nghĩa EN ngắn (<=20 từ)",
  "example": "câu gốc chứa từ này trong bài",
  "cefr_level": "B2|C1|C2",
  "topic": "chọn 1 trong: ${TOPICS.join(", ")}",
  "is_awl": true/false,
  "collocations": ["tối đa 3 cụm"],
  "synonyms": ["tối đa 3 từ"]
}]}`,
        passageContent.slice(0, 5000)
      );

      const rawItems = (ai.items ?? []).filter((x) => x.lemma);
      const keys = rawItems.map((x) => normKey(x.lemma));

      const bankMap = new Map<string, string>();
      if (keys.length > 0) {
        const { data: bankRows } = await db
          .from("words")
          .select("norm_key,source")
          .in("norm_key", keys);
        for (const r of bankRows ?? []) bankMap.set(r.norm_key, r.source ?? "import");
      }

      const existingNoteKeys = new Set<string>();
      if (body.passageId) {
        const { data: noteRows } = await db
          .from("reading_notes")
          .select("target_text,result_json")
          .eq("passage_id", body.passageId)
          .eq("kind", "vocab");
        for (const n of noteRows ?? []) {
          const rj = (n.result_json ?? {}) as Record<string, unknown>;
          existingNoteKeys.add(typeof rj.norm_key === "string" ? rj.norm_key : normKey(n.target_text));
        }
      }

      const toInsert: {
        passage_id: number;
        kind: "vocab";
        target_text: string;
        result_json: Record<string, unknown>;
      }[] = [];

      const items = rawItems.map((it) => {
        const nk = normKey(it.lemma);
        const bankSource = bankMap.get(nk) ?? null;
        const payload = {
          ...it,
          cefr_level: safeLevel(it.cefr_level),
          norm_key: nk,
          existsInBank: !!bankSource,
          bankSource,
        };
        if (body.passageId && !existingNoteKeys.has(nk)) {
          existingNoteKeys.add(nk);
          toInsert.push({
            passage_id: body.passageId,
            kind: "vocab",
            target_text: it.lemma,
            result_json: payload,
          });
        }
        return payload;
      });

      let addedNotes: unknown[] = [];
      if (toInsert.length > 0) {
        const { data } = await db.from("reading_notes").insert(toInsert).select("*");
        addedNotes = data ?? [];
      }

      return NextResponse.json({ items, addedNotes });
    }

    if (body.mode === "sentence") {
      const sentence = (body.sentence ?? "").trim();
      if (!sentence || sentence.length < 10) {
        return NextResponse.json({ error: "Vui lòng chọn hoặc dán câu đủ dài để phân tích" }, { status: 400 });
      }

      if (!body.forceAi && body.passageId) {
        const { data: existingNote } = await db
          .from("reading_notes")
          .select("*")
          .eq("passage_id", body.passageId)
          .eq("kind", "sentence")
          .eq("target_text", sentence)
          .maybeSingle();

        if (existingNote) {
          return NextResponse.json({
            sentence: existingNote.result_json,
            note: existingNote,
            cached: true,
          });
        }
      }

      const result = await askJsonWithProfile<SentenceResult>(
        "reason",
        `Bạn là giáo viên IELTS Reading giúp học viên B1 hiểu câu học thuật phức tạp.
Trả về JSON:
{
  "translation_vi": "dịch tiếng Việt tự nhiên, sát nghĩa học thuật",
  "subject": "chủ ngữ chính của câu (trích nguyên văn tiếng Anh + giải thích ngắn)",
  "main_verb": "động từ chính của câu",
  "clauses": ["liệt kê tối đa 3 mệnh đề phụ / cụm rút gọn / cụm bổ nghĩa quan trọng và vai trò của nó bằng tiếng Việt"],
  "grammar_points": ["1-2 điểm ngữ pháp hoặc từ nối đáng chú ý"],
  "key_vocab": [{"word": "từ khó trong câu", "meaning_vi": "nghĩa ngắn"}]
}`,
        sentence.slice(0, 1500)
      );

      let savedNote = null;
      if (body.passageId) {
        const { data } = await db
          .from("reading_notes")
          .insert({
            passage_id: body.passageId,
            kind: "sentence",
            target_text: sentence,
            result_json: result,
          })
          .select("*")
          .single();
        savedNote = data;
      }

      return NextResponse.json({ sentence: result, note: savedNote, cached: false });
    }

    if (body.mode === "question") {
      const question = (body.question ?? "").trim();
      const passageContent = (body.passageContent ?? "").trim();
      if (!question || !passageContent) {
        return NextResponse.json({ error: "Thiếu câu hỏi hoặc nội dung bài đọc" }, { status: 400 });
      }

      if (!body.forceAi && body.passageId) {
        const { data: existingNote } = await db
          .from("reading_notes")
          .select("*")
          .eq("passage_id", body.passageId)
          .eq("kind", "question")
          .eq("target_text", question)
          .maybeSingle();

        if (existingNote) {
          return NextResponse.json({
            question: existingNote.result_json,
            note: existingNote,
            cached: true,
          });
        }
      }

      const result = await askJsonWithProfile<QuestionResult>(
        "reason",
        `Bạn là gia sư IELTS Reading. Học viên vừa làm sai 1 câu hỏi sau khi đọc bài.
Hãy tìm đúng câu dẫn chứng trong bài đọc và giải thích ngắn gọn, dễ hiểu bằng tiếng Việt.
Trả về JSON:
{
  "evidence_quote": "trích nguyên văn 1-2 câu trong bài đọc chứa thông tin trả lời (copy chính xác từng chữ từ bài đọc để highlight được; nếu Not Given hoàn toàn không có thì trích câu gần liên quan nhất)",
  "explanation_vi": "giải thích rõ tại sao đáp án đúng là vậy (nếu là TFNG/YNNG thì phân biệt rõ False vs Not Given)",
  "paraphrases": [{"question_phrase": "cụm từ trong câu hỏi", "passage_phrase": "cụm từ tương đương trong bài đọc"}],
  "tip_vi": "1 mẹo ngắn để lần sau không dính bẫy dạng câu này"
}`,
        `BÀI ĐỌC:\n${passageContent.slice(0, 5500)}\n\nCÂU HỎI:\n${question}\nĐÁP ÁN ĐÚNG: ${body.correctAnswer || "(chưa rõ, hãy tự suy luận)"}\nĐÁP ÁN HỌC VIÊN CHỌN: ${body.userAnswer || "(không rõ)"}`
      );

      let savedNote = null;
      if (body.passageId) {
        const { data } = await db
          .from("reading_notes")
          .insert({
            passage_id: body.passageId,
            kind: "question",
            target_text: question,
            result_json: {
              ...result,
              correctAnswer: body.correctAnswer ?? "",
              userAnswer: body.userAnswer ?? "",
            },
          })
          .select("*")
          .single();
        savedNote = data;
      }

      return NextResponse.json({ question: result, note: savedNote, cached: false });
    }

    return NextResponse.json({ error: "Chế độ không hợp lệ" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Admin tự thêm ghi chú tay (0 token)
export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      passageId: number;
      kind: "vocab" | "sentence" | "question";
      targetText: string;
      resultJson: Record<string, unknown>;
    };
    if (!body.passageId || !body.targetText?.trim()) {
      return NextResponse.json({ error: "Thiếu thông tin ghi chú" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin()
      .from("reading_notes")
      .insert({
        passage_id: body.passageId,
        kind: body.kind,
        target_text: body.targetText.trim(),
        result_json: body.resultJson,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ note: data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Admin tự chỉnh sửa nghĩa / ghi chú đã lưu (0 token)
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as {
      noteId: number;
      resultJson: Record<string, unknown>;
    };
    if (!body.noteId) return NextResponse.json({ error: "Thiếu noteId" }, { status: 400 });

    const { data, error } = await supabaseAdmin()
      .from("reading_notes")
      .update({ result_json: body.resultJson })
      .eq("id", body.noteId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ note: data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("noteId"));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Thiếu noteId" }, { status: 400 });
    }
    const { error } = await supabaseAdmin().from("reading_notes").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
