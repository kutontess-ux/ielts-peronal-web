import "server-only";

export const TOPICS = [
  "Environment", "Education", "Economy", "Government", "Health", "Technology",
  "Crime", "Society", "Science", "Media", "Work", "Culture", "Travel", "Other",
] as const;

export type Enriched = {
  input: string;
  valid: boolean;
  lemma: string;
  ipa: string;
  pos: string;
  meaning_vi: string;
  definition_en: string;
  example: string;
  cefr_level: "A2" | "B1" | "B2" | "C1" | "C2";
  topic: string;
  is_awl: boolean;
  collocations: string[];
  synonyms: string[];
};

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const GEMINI_MODEL_2 = process.env.GEMINI_MODEL_2 || "gemini-2.5-flash-lite";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Gọi Gemini #1 (chính) -> Gemini #2 (dự phòng miễn phí/rẻ) -> OpenAI (chỉ dùng khi cả 2 key Gemini đều lỗi).
export async function askJson<T>(system: string, user: string): Promise<T> {
  const errors: string[] = [];
  const geminiTargets = [
    { label: "Gemini #1", apiKey: process.env.GEMINI_API_KEY, model: GEMINI_MODEL },
    { label: "Gemini #2", apiKey: process.env.GEMINI_API_KEY_2, model: GEMINI_MODEL_2 },
  ];

  for (const target of geminiTargets) {
    if (!target.apiKey) continue;
    try {
      const res = await callGeminiJson<T>(target.apiKey, target.model, system, user);
      console.log(`[AI Info] Gọi ${target.label} thành công với model: ${target.model}`);
      return res;
    } catch (e) {
      const errMsg = (e as Error).message;
      console.warn(`[AI Warning] ${target.label} (${target.model}) thất bại (${errMsg}).`);
      errors.push(`${target.label}: ${errMsg}`);
    }
  }

  // Cho phép tắt hoàn toàn fallback sang OpenAI nếu muốn 100% miễn phí (đặt DISABLE_OPENAI_FALLBACK=true)
  const allowOpenAi = process.env.OPENAI_API_KEY && process.env.DISABLE_OPENAI_FALLBACK !== "true";
  if (allowOpenAi) {
    try {
      console.info(`[AI Info] Cả 2 key Gemini đều lỗi, đang fallback sang OpenAI (${OPENAI_MODEL})...`);
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
      return JSON.parse(j.choices[0].message.content) as T;
    } catch (e) {
      errors.push(`OpenAI: ${(e as Error).message}`);
    }
  }
  throw new Error("Lỗi gọi AI: " + (errors.length ? errors.join(" | ") : "Chưa cấu hình API key"));
}

export type AiProfile = "vocab" | "reason" | "default";

async function callGeminiJson<T>(apiKey: string, model: string, system: string, user: string): Promise<T> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    }
  );
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
  const raw = (j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "").trim();
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

async function callOpenAiCompatibleJson<T>(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  user: string
): Promise<T> {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
  const raw = String(j.choices?.[0]?.message?.content ?? "").trim();
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

// Gọi AI theo từng hạng mục Reading (vocab dùng model nhẹ/miễn phí; reason dùng model suy luận).
// Nếu chưa cấu hình biến riêng trong .env.local thì tự động fallback về askJson mặc định.
export async function askJsonWithProfile<T>(
  profile: AiProfile,
  system: string,
  user: string
): Promise<T> {
  if (profile === "default") return askJson<T>(system, user);

  const prefix = profile === "vocab" ? "READING_VOCAB" : "READING_REASON";
  const apiKey = process.env[`${prefix}_API_KEY`];
  if (!apiKey) return askJson<T>(system, user);

  const baseUrl = process.env[`${prefix}_BASE_URL`];
  const providerEnv = process.env[`${prefix}_PROVIDER`]?.toLowerCase();
  const provider =
    providerEnv ||
    (baseUrl ? "openai_compatible" : apiKey.startsWith("AIza") ? "gemini" : "openai_compatible");

  const model =
    process.env[`${prefix}_MODEL`] ||
    (provider === "gemini" ? GEMINI_MODEL : "llama-3.3-70b-versatile");

  try {
    if (provider === "gemini") {
      return await callGeminiJson<T>(apiKey, model, system, user);
    }
    return await callOpenAiCompatibleJson<T>(
      baseUrl || "https://api.groq.com/openai/v1",
      apiKey,
      model,
      system,
      user
    );
  } catch {
    // Nếu key riêng lỗi/hết quota tạm thời -> fallback về askJson mặc định
    return askJson<T>(system, user);
  }
}

const ENRICH_SYSTEM = `Bạn là giáo viên IELTS Academic cho người Việt học ở trình độ B1 hướng tới band 6.5.
Với mỗi mục đầu vào, trả về thông tin từ vựng. Quy tắc:
- valid=false nếu không phải từ/cụm từ tiếng Anh có thật (sai chính tả nặng, rác, tiếng khác). Khi đó các trường còn lại để chuỗi rỗng.
- lemma: dạng gốc, chữ thường (analysed -> analyse; "running" -> run). Giữ cụm từ cố định (vd "carbon footprint").
- ipa: phiên âm IPA Anh-Anh có dấu gạch chéo.
- pos: một trong n, v, adj, adv, phr (cụm), prep, conj.
- meaning_vi: nghĩa tiếng Việt ngắn gọn, ưu tiên nghĩa học thuật (tối đa 8 từ).
- definition_en: định nghĩa tiếng Anh đơn giản (<= 20 từ).
- example: 1 câu ví dụ học thuật/IELTS tự nhiên.
- cefr_level: A2, B1, B2, C1 hoặc C2 (đánh giá thực tế độ khó).
- topic: chọn đúng 1 trong: ${TOPICS.join(", ")}.
- is_awl: true nếu thuộc Academic Word List của Coxhead.
- collocations: tối đa 3 cụm hay đi kèm. synonyms: tối đa 3 từ đồng nghĩa.
Trả về JSON dạng {"items":[...]} giữ nguyên thứ tự đầu vào, mỗi item có trường "input" đúng bằng chuỗi gốc.`;

export async function enrich(terms: string[]): Promise<Enriched[]> {
  const BATCH = 25;
  const chunks: string[][] = [];
  for (let i = 0; i < terms.length; i += BATCH) chunks.push(terms.slice(i, i + BATCH));

  // Chạy song song các lô (tối đa 4 lô cùng lúc) để nhanh hơn khi nạp nhiều từ
  const results: Enriched[][] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const idx = next++;
      const chunk = chunks[idx];
      const res = await askJson<{ items: Enriched[] }>(ENRICH_SYSTEM, JSON.stringify(chunk));
      const byInput = new Map(res.items.map((x) => [String(x.input).toLowerCase(), x]));
      results[idx] = chunk.map(
        (t) =>
          byInput.get(t.toLowerCase()) ?? {
            input: t, valid: false, lemma: "", ipa: "", pos: "", meaning_vi: "", definition_en: "",
            example: "", cefr_level: "B2", topic: "Other", is_awl: false, collocations: [], synonyms: [],
          }
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, worker));
  return results.flat();
}

export async function extractFromPassage(passage: string): Promise<string[]> {
  const res = await askJson<{ words: string[] }>(
    `Bạn trích từ vựng IELTS Academic từ đoạn văn. Chọn tối đa 25 từ/cụm từ hữu ích ở mức B2-C1 (bỏ từ quá dễ, tên riêng). Trả JSON {"words":["..."]} dạng gốc, chữ thường.`,
    passage.slice(0, 4500)
  );
  return res.words ?? [];
}

// Tách số lượng từ người dùng yêu cầu trong prompt (bỏ qua số của Task 1/2, Band 6.5, B1-C2)
export function parseRequestedWordCount(
  prompt: string,
  defaultCount = 15,
  maxCount = 60
): { targetCount: number; explicit: boolean } {
  const cleaned = prompt
    .replace(/\btask\s*[12]\b/gi, " ")
    .replace(/\bband\s*\d+(?:\.\d+)?\b/gi, " ")
    .replace(/\b[abc][12]\b/gi, " ");

  const explicitUnit = cleaned.match(
    /\b(\d{1,3})\s*(?:từ|tu|thẻ|the|flashcards?|cards?|words?|vocab(?:ulary)?|cụm|collocations?|items?)\b/i
  );
  const rawNum = explicitUnit?.[1] ?? cleaned.match(/\b(\d{1,3})\b/)?.[1];
  if (!rawNum) return { targetCount: defaultCount, explicit: false };

  const n = Number(rawNum);
  if (!Number.isFinite(n) || n < 3) return { targetCount: defaultCount, explicit: false };
  return { targetCount: Math.min(maxCount, Math.max(3, Math.round(n))), explicit: true };
}
