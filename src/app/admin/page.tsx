"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Database,
  Loader2,
  Lock,
  Shield,
  Sparkles,
  Unlock,
  Users,
} from "lucide-react";

type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: "admin" | "member";
  is_active: boolean;
  daily_ai_limit: number;
  created_at: string;
  aiUsedToday: number;
  enrolledWords: number;
};

type AdminData = {
  users: AdminUser[];
  totalWords: number;
  totalAiToday: number;
  legacyCounts: Record<string, number>;
  totalLegacy: number;
};

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string>("");
  const [claiming, setClaiming] = useState(false);
  const [limitDraft, setLimitDraft] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/users", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Không có quyền truy cập trang quản trị");
      setData(j);
      setErr("");
      const drafts: Record<string, number> = {};
      for (const u of j.users as AdminUser[]) {
        drafts[u.id] = u.daily_ai_limit;
      }
      setLimitDraft(drafts);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const updateUser = async (
    userId: string,
    patch: { role?: "admin" | "member"; is_active?: boolean; daily_ai_limit?: number }
  ) => {
    setBusyId(userId);
    setErr("");
    setMsg("");
    try {
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...patch }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Không cập nhật được");
      setData((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((u) => (u.id === userId ? { ...u, ...j.user } : u)),
            }
          : prev
      );
      setMsg("Đã lưu thay đổi tài khoản.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId("");
    }
  };

  const claimLegacy = async () => {
    if (claiming) return;
    setClaiming(true);
    setErr("");
    setMsg("");
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim_legacy" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Không gộp được dữ liệu cũ");
      setMsg("Đã gộp toàn bộ dữ liệu cũ về tài khoản Admin của bạn!");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted">
        <Loader2 className="animate-spin" size={18} /> Đang tải trang quản trị...
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-line bg-card p-8 text-center">
        <Shield size={40} className="mx-auto text-rose-500" />
        <h1 className="mt-4 text-xl font-bold">Không thể truy cập trang Quản trị</h1>
        <p className="mt-2 text-sm text-muted">{err}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white"
        >
          Về Trang chủ
        </Link>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Shield size={24} className="text-brand-hover" /> Quản trị hệ thống
          </h1>
          <p className="mt-1 text-sm text-muted">
            Quản lý tài khoản Google đã đăng nhập, phân quyền Admin/Member và hạn mức gọi AI theo ngày.
          </p>
        </div>
      </div>

      {err && (
        <div className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {err}
        </div>
      )}
      {msg && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <Check size={16} /> {msg}
        </div>
      )}

      {/* Thống kê tổng quan */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted">
            <Users size={15} className="text-brand-hover" /> Người dùng đã đăng nhập
          </div>
          <div className="mt-2 text-3xl font-bold">{data.users.length}</div>
        </div>
        <div className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted">
            <Database size={15} className="text-emerald-500" /> Kho từ vựng dùng chung
          </div>
          <div className="mt-2 text-3xl font-bold">{data.totalWords.toLocaleString("vi-VN")} từ</div>
        </div>
        <div className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted">
            <Sparkles size={15} className="text-amber-500" /> Lượt gọi AI hôm nay
          </div>
          <div className="mt-2 text-3xl font-bold">{data.totalAiToday} lượt</div>
        </div>
      </div>

      {/* Gộp dữ liệu cũ (WHERE user_id IS NULL) nếu có */}
      {data.totalLegacy > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <div className="font-bold text-amber-800 dark:text-amber-300">
                Phát hiện {data.totalLegacy} bản ghi cũ chưa gắn tài khoản
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Bao gồm: {data.legacyCounts.reviews} từ đang ôn, {data.legacyCounts.study_sets} học phần,{" "}
                {data.legacyCounts.study_folders} thư mục, {data.legacyCounts.reading_passages} bài đọc
                {data.legacyCounts.reading_notes ? `, ${data.legacyCounts.reading_notes} ghi chú đọc` : ""}
                {data.legacyCounts.daily_words ? `, ${data.legacyCounts.daily_words} từ hằng ngày` : ""}
                {data.legacyCounts.words ? `, ${data.legacyCounts.words} từ trong kho` : ""}
                {data.legacyCounts.user_settings ? `, ${data.legacyCounts.user_settings} cài đặt` : ""}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={claimLegacy}
            disabled={claiming}
            className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {claiming && <Loader2 size={14} className="animate-spin" />}
            Gộp dữ liệu cũ về tài khoản Admin
          </button>
        </div>
      )}

      {/* Bảng danh sách user */}
      <div className="space-y-3">
        {data.users.map((u) => {
          const isBusy = busyId === u.id;
          const draft = limitDraft[u.id] ?? u.daily_ai_limit;
          return (
            <div
              key={u.id}
              className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-card p-4 ${
                u.is_active ? "" : "opacity-60"
              }`}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink">{u.full_name || u.email}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      u.role === "admin"
                        ? "bg-brand/20 text-brand-hover"
                        : "bg-bg text-muted"
                    }`}
                  >
                    {u.role === "admin" ? "Admin (Không giới hạn)" : "Member"}
                  </span>
                  {!u.is_active && (
                    <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-300">
                      Đã khoá
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted">{u.email}</div>
                <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted">
                  <span>
                    Từ đang ôn: <b className="text-ink">{u.enrolledWords}</b>
                  </span>
                  <span>
                    AI hôm nay:{" "}
                    <b className="text-ink">
                      {u.aiUsedToday}
                      {u.role === "admin" ? " / ∞" : ` / ${u.daily_ai_limit}`}
                    </b>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {u.role === "member" && (
                  <div className="flex items-center gap-1.5 rounded-xl border border-line bg-bg px-2.5 py-1.5 text-xs">
                    <span className="text-muted">AI/ngày:</span>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={draft}
                      onChange={(e) =>
                        setLimitDraft((d) => ({ ...d, [u.id]: Number(e.target.value) }))
                      }
                      className="w-14 bg-transparent font-bold outline-none"
                    />
                    {draft !== u.daily_ai_limit && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => updateUser(u.id, { daily_ai_limit: draft })}
                        className="rounded-lg bg-brand px-2 py-1 text-[11px] font-bold text-white"
                      >
                        Lưu
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    updateUser(u.id, { role: u.role === "admin" ? "member" : "admin" })
                  }
                  className="rounded-xl border border-line bg-bg px-3 py-1.5 text-xs font-semibold hover:border-brand disabled:opacity-50"
                >
                  {u.role === "admin" ? "Hạ xuống Member" : "Nâng lên Admin"}
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => updateUser(u.id, { is_active: !u.is_active })}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                    u.is_active
                      ? "bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 dark:text-rose-300"
                      : "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
                  }`}
                >
                  {u.is_active ? (
                    <>
                      <Lock size={13} /> Khoá
                    </>
                  ) : (
                    <>
                      <Unlock size={13} /> Mở khoá
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
