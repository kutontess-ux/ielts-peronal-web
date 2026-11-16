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
