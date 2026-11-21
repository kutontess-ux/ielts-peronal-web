// Chuẩn hoá để chống trùng: chữ thường, bỏ dấu câu, gộp chính tả Anh/Mỹ
const US_UK: [RegExp, string][] = [
  [/yze$/, "yse"],
  [/yzed$/, "ysed"],
  [/ize$/, "ise"],
  [/ized$/, "ised"],
  [/ization$/, "isation"],
  [/izing$/, "ising"],
  [/ization(s)$/, "isation$1"],
];
const OR_OUR = ["color", "favor", "behavior", "labor", "neighbor", "honor", "humor", "flavor", "harbor", "rumor"];

export function cleanTerm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”"'`’()\[\]{}<>]/g, "")
    .replace(/^[\s\-–—•*\d.]+/, "")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normKey(lemma: string): string {
  let k = cleanTerm(lemma);
  for (const [re, rep] of US_UK) k = k.replace(re, rep);
  for (const base of OR_OUR) {
    if (k.startsWith(base) && !k.startsWith(base.replace(/or$/, "our"))) {
      k = base.replace(/or$/, "our") + k.slice(base.length);
    }
  }
  return k;
}

// Sinh các dạng nguyên mẫu ứng viên từ một từ đang chia thì / số nhiều / trạng từ trong bài đọc
// để bắt trúng từ gốc trong reading_notes hoặc bảng words mà không tốn thêm request AI.
export function possibleLemmas(raw: string): string[] {
  const base = normKey(raw);
  if (!base) return [];
  if (base.includes(" ")) return [base];

  const out = new Set<string>([base]);

  if (base.endsWith("ies") && base.length > 4) {
    out.add(base.slice(0, -3) + "y");
  }
  if (base.endsWith("ves") && base.length > 4) {
    out.add(base.slice(0, -3) + "f");
    out.add(base.slice(0, -3) + "fe");
  }
  if (base.endsWith("es") && base.length > 3) {
    out.add(base.slice(0, -2));
    out.add(base.slice(0, -1));
  }
  if (base.endsWith("s") && !base.endsWith("ss") && !base.endsWith("us") && !base.endsWith("is") && base.length > 3) {
    out.add(base.slice(0, -1));
  }
  if (base.endsWith("ied") && base.length > 4) {
    out.add(base.slice(0, -3) + "y");
  }
  if (base.endsWith("ed") && base.length > 3) {
    const stem = base.slice(0, -2);
    out.add(stem);
    out.add(stem + "e");
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) {
      out.add(stem.slice(0, -1));
    }
  }
  if (base.endsWith("ying") && base.length > 5) {
    out.add(base.slice(0, -4) + "ie");
  }
  if (base.endsWith("ing") && base.length > 4) {
    const stem = base.slice(0, -3);
    out.add(stem);
    out.add(stem + "e");
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) {
      out.add(stem.slice(0, -1));
    }
  }
  if (base.endsWith("iest") && base.length > 5) {
    out.add(base.slice(0, -4) + "y");
  }
  if (base.endsWith("ier") && base.length > 4) {
    out.add(base.slice(0, -3) + "y");
  }
  if (base.endsWith("ily") && base.length > 4) {
    out.add(base.slice(0, -3) + "y");
  }
  if (base.endsWith("ally") && base.length > 5) {
    out.add(base.slice(0, -4));
    out.add(base.slice(0, -2));
  }
  if (base.endsWith("ly") && base.length > 4) {
    out.add(base.slice(0, -2));
    out.add(base.slice(0, -2) + "e");
  }

  return Array.from(out)
    .map((x) => normKey(x))
    .filter((x) => x.length >= 2);
}


export type StructuredWordItem = {
  word: string;
  level?: "A2" | "B1" | "B2" | "C1" | "C2";
  pos?: string;
  ipa?: string;
  meaning_vi?: string;
  example?: string;
  synonyms?: string[];
};

export function parseStructuredVocab(text: string): StructuredWordItem[] | null {
  const lines = text.split(/[\r\n]+/);
  // Match lines like "1. abandon [B2] (v) /.../" or "1) abandon - ..." or "1. crime rate"
  const itemHeaderRegex =
    /^\s*(\d+)[\.\)\/:\-]\s*([a-zA-Z\s\-'\`’]+?)(?:\s*\[([A-Za-z0-9]+)\])?(?:\s*\(([a-z\s\.\/]+)\))?(?:\s*\/([^\/]+)\/)?\s*$/;

  const items: StructuredWordItem[] = [];
  let current: StructuredWordItem | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Bỏ qua các dòng tiêu đề như "📚 DAILY...", "📈 Tiến độ...", v.v.
    if (/^(?:📚|📈|Tiến độ|DAILY|Daily|Date|Ngày)\b/i.test(line)) continue;

    const m = line.match(itemHeaderRegex);
    if (m) {
      if (current) items.push(current);
      const w = cleanTerm(m[2]);
      if (w) {
        const rawLevel = m[3]?.toUpperCase();
        const level =
          rawLevel === "A1"
            ? "A2"
            : ["A2", "B1", "B2", "C1", "C2"].includes(rawLevel ?? "")
            ? (rawLevel as StructuredWordItem["level"])
            : undefined;
        const pos = m[4]?.trim().toLowerCase();
        const ipa = m[5] ? `/${m[5].trim()}/` : undefined;
        current = {
          word: w,
          level,
          pos: pos ? pos.replace(/[^a-z]/g, "") : undefined,
          ipa,
        };
      } else {
        current = null;
      }
      continue;
    }

    if (current) {
      // Dòng nghĩa tiếng Việt
      if (/^(?:🔹|•|-|\*)*\s*(?:nghĩa|meaning|định nghĩa)\s*:\s*/i.test(line)) {
        const val = line.replace(/^(?:🔹|•|-|\*)*\s*(?:nghĩa|meaning|định nghĩa)\s*:\s*/i, "").trim();
        if (val) current.meaning_vi = val;
      }
      // Dòng paraphrase / đồng nghĩa
      else if (/^(?:🔄|•|-|\*)*\s*(?:paraphrase|synonym|synonyms|đồng nghĩa)\s*:\s*/i.test(line)) {
        const val = line.replace(/^(?:🔄|•|-|\*)*\s*(?:paraphrase|synonym|synonyms|đồng nghĩa)\s*:\s*/i, "").trim();
        if (val) {
          current.synonyms = val.split(/[,;\/]+/).map((s) => cleanTerm(s)).filter(Boolean);
        }
      }
      // Dòng câu ví dụ
      else if (/^(?:💬|•|-|\*)*\s*(?:ví dụ|example|vd|ex)\s*:\s*/i.test(line)) {
        const val = line.replace(/^(?:💬|•|-|\*)*\s*(?:ví dụ|example|vd|ex)\s*:\s*/i, "").trim();
        if (val) current.example = val.replace(/^["“”'`]/, "").replace(/["“”'`]$/, "");
      }
    }
  }

  if (current) items.push(current);
  return items.length >= 2 ? items : null;
}

// Tách văn bản dán vào thành các mục. Trả về { terms, passage, structured }:
// - terms: các mục ngắn (≤3 từ) -> coi là từ/cụm từ
// - passage: các dòng dài -> coi là đoạn văn, để AI trích từ
// - structured: nếu phát hiện dạng danh sách từ vựng có cấu trúc (1. word, Nghĩa:..., Paraphrase:..., Ví dụ:...)
export function splitInput(text: string): {
  terms: string[];
  passage: string;
  structured?: StructuredWordItem[];
} {
  const structured = parseStructuredVocab(text);
  if (structured && structured.length > 0) {
    return {
      terms: structured.map((item) => item.word),
      passage: "",
      structured,
    };
  }

  const parts = text
    .split(/[\n\r;\t]+/)
    .flatMap((line) => (line.trim().split(/\s+/).length > 6 ? [line] : line.split(",")))
    .map((s) => s.trim())
    .filter(Boolean);
  const terms: string[] = [];
  const longs: string[] = [];
  for (const p of parts) {
    if (p.split(/\s+/).length <= 3) {
      const c = cleanTerm(p);
      if (c) terms.push(c);
    } else longs.push(p);
  }
  return { terms, passage: longs.join("\n") };
}
