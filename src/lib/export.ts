import type { Word } from "./mock";

export type ExportOpts = {
  separator: "tab" | "comma" | "dash";
  vi: boolean;
  en: boolean;
  pos: boolean;
  ipa: boolean;
  example: boolean;
};

export const DEFAULT_OPTS: ExportOpts = {
  separator: "tab",
  vi: true,
  en: false,
  pos: false,
  ipa: false,
  example: false,
};

export const SEP_CHAR = { tab: "\t", comma: ", ", dash: " - " } as const;

// Quizlet import: mỗi thẻ 1 dòng, "thuật ngữ" và "định nghĩa" cách nhau bằng 1 ký tự phân tách.
// Nội dung định nghĩa phải nằm trên 1 dòng nên ghép các phần bằng " | ".
export function buildQuizletText(words: Word[], o: ExportOpts): string {
  return words
    .map((w) => {
      const term = o.ipa ? `${w.word} ${w.ipa}` : w.word;
      const parts: string[] = [];
      if (o.vi) parts.push(o.pos ? `(${w.pos}) ${w.vi}` : w.vi);
      if (o.en) parts.push(w.en);
      if (o.example) parts.push(`VD: ${w.example}`);
      if (parts.length === 0) parts.push(w.vi);
      return `${term}${SEP_CHAR[o.separator]}${parts.join(" | ")}`;
    })
    .join("\n");
}
