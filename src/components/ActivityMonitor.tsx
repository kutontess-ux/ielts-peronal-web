"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { consumeActivityLabel } from "@/lib/activity";

type LogEntry = {
  id: number;
  endpoint: string;
  method: string;
  label: string;
  status: "running" | "done" | "error";
  detail?: string;
  startedAt: number;
  durationMs?: number;
};

function describeRequest(method: string, path: string): string {
  if (path.startsWith("/api/import/preview")) return "Agent đang kiểm tra từ vựng, loại trùng & bổ sung nghĩa...";
  if (path.startsWith("/api/import/commit")) return "Đang lưu danh sách từ đã duyệt vào kho Supabase...";
  if (path.startsWith("/api/books/ielts-3000")) return "Agent đang lấy 30 từ chuẩn The Oxford 3000 & bổ sung nghĩa...";
  if (path.startsWith("/api/books/agent-find")) return "Agent đang tìm từ vựng theo yêu cầu của bạn...";
  if (path.startsWith("/api/daily") && method === "POST") return "Agent đang đọc RSS báo BBC/Guardian & tạo 10 từ hôm nay...";
  if (path.startsWith("/api/daily")) return "Đang tải từ vựng hằng ngày từ Supabase...";
  if (path.startsWith("/api/reviews") && method === "POST") return "Đang lưu lịch ôn tập ngắt quãng...";
  if (path.startsWith("/api/reviews")) return "Đang kiểm tra số từ đến hạn ôn tập...";
  if (path.startsWith("/api/words") && method === "DELETE") return "Đang xoá từ khỏi kho Supabase...";
  if (path.startsWith("/api/words")) return "Đang tải kho từ vựng từ Supabase...";
  return "Đang xử lý yêu cầu...";
}

export default function ActivityMonitor() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const origFetch = window.fetch.bind(window);
    let seq = 1;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const isLocalApi = rawUrl.startsWith("/api/");

      if (!isLocalApi) {
        return origFetch(input, init);
      }

      const method = (init?.method || "GET").toUpperCase();
      const path = rawUrl.split("?")[0];
      const id = seq++;
      const startedAt = Date.now();
      const customLabel = consumeActivityLabel(path);

      // Chỉ các lệnh ghi/AI (POST, DELETE...) mới hiện thẻ thông báo ngay; GET nền chỉ hiện nếu chậm (>500ms)
      const isImportant = method !== "GET";
      let shown = false;

      const addEntry = () => {
        if (shown) return;
        shown = true;
        setLogs((prev) => [
          ...prev.slice(-2),
          {
            id,
            endpoint: `${method} ${path}`,
            method,
            label: customLabel || describeRequest(method, path),
            status: "running",
            startedAt,
          },
        ]);
      };

      let delayShow: ReturnType<typeof setTimeout> | null = null;
      if (isImportant) {
        addEntry();
      } else {
        delayShow = setTimeout(addEntry, 500);
      }

      try {
        const res = await origFetch(input, init);
        if (delayShow) clearTimeout(delayShow);

        if (shown) {
          const durationMs = Date.now() - startedAt;
          setLogs((prev) =>
            prev.map((l) =>
              l.id === id
                ? {
                    ...l,
                    status: res.ok ? "done" : "error",
                    detail: res.ok ? `Hoàn tất (${res.status})` : `Lỗi (${res.status})`,
                    durationMs,
                  }
                : l
            )
          );
          setTimeout(() => {
            setLogs((prev) => prev.filter((l) => l.id !== id));
          }, 4500);
        }
        return res;
      } catch (err) {
        if (delayShow) clearTimeout(delayShow);
        addEntry();
        const durationMs = Date.now() - startedAt;
        setLogs((prev) =>
          prev.map((l) =>
            l.id === id
              ? {
                  ...l,
                  status: "error",
                  detail: (err as Error).message || "Lỗi kết nối",
                  durationMs,
                }
              : l
          )
        );
        setTimeout(() => {
          setLogs((prev) => prev.filter((l) => l.id !== id));
        }, 6000);
        throw err;
      }
    };

    return () => {
      window.fetch = origFetch;
    };
  }, []);

  if (logs.length === 0) return null;

  return (
    <div className="fixed bottom-16 left-3 z-50 flex w-60 max-w-[calc(100vw-1.5rem)] flex-col gap-1.5 md:bottom-3 md:left-3">
      {logs.map((l) => {
        const elapsed = l.durationMs ?? (now > 0 ? Math.max(0, now - l.startedAt) : 0);
        const sec = (elapsed / 1000).toFixed(1);
        return (
          <div
            key={l.id}
            className="rounded-xl border border-line bg-card/95 px-2.5 py-2 shadow-xl backdrop-blur transition-all"
          >
            <div className="flex items-center gap-2">
              <div className="shrink-0">
                {l.status === "running" && <Loader2 size={14} className="animate-spin text-brand-hover" />}
                {l.status === "done" && <CheckCircle2 size={14} className="text-emerald-400" />}
                {l.status === "error" && <XCircle size={14} className="text-rose-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-white" title={l.label}>
                  {l.label}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted">
                  <span className="max-w-[95px] truncate font-mono text-brand-hover">{l.endpoint}</span>
                  <span>·</span>
                  <span>{l.status === "running" ? `${sec}s` : `${l.detail ?? "Xong"} (${sec}s)`}</span>
                </div>
              </div>
              <button
                onClick={() => setLogs((prev) => prev.filter((x) => x.id !== l.id))}
                className="rounded p-0.5 text-muted hover:bg-line hover:text-white"
                aria-label="Đóng"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
