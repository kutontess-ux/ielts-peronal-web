"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, FileText, X } from "lucide-react";
import type { Word } from "@/lib/mock";
import { DEFAULT_OPTS, buildQuizletText, type ExportOpts } from "@/lib/export";

export default function ExportButton({
  words,
  filename = "tu-vung",
  label = "Xuất văn bản",
}: {
  words: Word[];
  filename?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [o, setO] = useState<ExportOpts>(DEFAULT_OPTS);
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => buildQuizletText(words, o), [words, o]);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggle = (k: "vi" | "en" | "pos" | "ipa" | "example") => setO((p) => ({ ...p, [k]: !p[k] }));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg"
      >
        <FileText size={17} strokeWidth={1.75} /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-3xl border border-line bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-lg font-bold">Xuất {words.length} từ để nhập vào Quizlet</div>
                <div className="text-sm text-muted">Quizlet → Tạo học phần → Nhập → dán văn bản vào</div>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-full p-2 text-muted hover:bg-line hover:text-ink">
                <X size={20} strokeWidth={1.75} />
              </button>
            </div>

            <div className="mb-3 text-xs font-semibold text-muted">Ký tự ngăn giữa từ và nghĩa</div>
            <div className="mb-4 flex flex-wrap gap-2">
              {([["tab", "Tab (mặc định Quizlet)"], ["comma", "Dấu phẩy"], ["dash", "Gạch ngang"]] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setO((p) => ({ ...p, separator: k }))}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold ${o.separator === k ? "bg-ink text-bg" : "bg-bg text-muted hover:text-ink"}`}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="mb-3 text-xs font-semibold text-muted">Nội dung ở mặt “định nghĩa”</div>
            <div className="mb-4 flex flex-wrap gap-2">
              {([["vi", "Nghĩa tiếng Việt"], ["en", "Định nghĩa tiếng Anh"], ["pos", "Từ loại"], ["ipa", "Phiên âm (ở mặt từ)"], ["example", "Ví dụ"]] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => toggle(k)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold ${o[k] ? "bg-brand text-white" : "bg-bg text-muted hover:text-ink"}`}
                >
                  {l}
                </button>
              ))}
            </div>

            <textarea
              readOnly
              value={text}
              className="h-56 w-full resize-none rounded-xl border border-line p-3 font-mono text-sm outline-none"
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={copy} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-hover hover:text-bg">
                {copied ? <Check size={17} strokeWidth={1.75} /> : <Copy size={17} strokeWidth={1.75} />}
                {copied ? "Đã sao chép" : "Sao chép"}
              </button>
              <button onClick={download} className="inline-flex items-center gap-2 rounded-full bg-line px-5 py-2.5 text-sm font-bold hover:bg-card-hover">
                <Download size={17} strokeWidth={1.75} /> Tải file .txt
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
