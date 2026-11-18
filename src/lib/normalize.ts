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


// Tách văn bản dán vào thành các mục. Trả về { terms, passage }:
// - terms: các mục ngắn (≤3 từ) -> coi là từ/cụm từ
// - passage: các dòng dài -> coi là đoạn văn, để AI trích từ
export function splitInput(text: string): { terms: string[]; passage: string } {
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
