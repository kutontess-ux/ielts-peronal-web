"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronRight,
  Eye,
  LogIn,
  LogOut,
  Newspaper,
  PenLine,
  Settings,
  Shield,
  Volume2,
  X,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { UserAvatar } from "@/components/UserAvatar";
import { VoiceSettingsModal } from "@/components/VoiceSettingsModal";
import { notifySettingsUpdated } from "@/lib/due-events";
import {
  ACCENT_OPTIONS,
  TTS_SETTINGS_CHANGED_EVENT,
  TtsSettings,
  getTtsSettings,
} from "@/lib/tts";
import type { MeInfo } from "@/lib/use-me";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dueCount: number;
  notifBadge: number;
  notifyReviewDue: boolean;
  onNotifyChange: (next: boolean) => void;
  me: MeInfo | null;
  meLoaded: boolean;
  signingOut: boolean;
  previewAsUser: boolean;
  onTogglePreview: () => void;
  onSignOut: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  dueCount,
  notifBadge,
  notifyReviewDue,
  onNotifyChange,
  me,
  meLoaded,
  signingOut,
  previewAsUser,
  onTogglePreview,
  onSignOut,
}: SettingsModalProps) {
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [ttsSettings, setTtsSettings] = useState<TtsSettings>(() => getTtsSettings());
  const [savingNotif, setSavingNotif] = useState(false);

  useEffect(() => {
    const onTtsChange = (e: Event) => {
      const custom = e as CustomEvent<TtsSettings>;
      setTtsSettings(custom.detail ?? getTtsSettings());
    };
    window.addEventListener(TTS_SETTINGS_CHANGED_EVENT, onTtsChange);
    return () => window.removeEventListener(TTS_SETTINGS_CHANGED_EVENT, onTtsChange);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !voiceModalOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose, voiceModalOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  const accentLabel =
    ACCENT_OPTIONS.find((a) => a.id === ttsSettings.accent)?.label || ttsSettings.accent;

  const handleToggleNotify = async () => {
    if (savingNotif) return;
    const nextVal = !notifyReviewDue;
    setSavingNotif(true);
    onNotifyChange(nextVal);
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_review_due: nextVal }),
      });
      if (r.ok) {
        notifySettingsUpdated({ notify_review_due: nextVal });
      } else {
        onNotifyChange(!nextVal);
      }
    } catch {
      onNotifyChange(!nextVal);
    } finally {
      setSavingNotif(false);
    }
  };

  const displayName =
    me?.profile.full_name || me?.profile.email.split("@")[0] || "Người dùng";

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cài đặt"
        >
          <div
            className="fixed inset-0 bg-black/55 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />

          <div className="relative z-10 flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-line bg-bg shadow-2xl sm:rounded-3xl">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-line bg-card px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand dark:text-brand-hover">
                  <Settings size={18} />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-ink">Cài đặt</h2>
                  <p className="text-[12px] text-muted">
                    Giao diện, âm thanh, thông báo &amp; tài khoản
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-muted transition hover:bg-bg hover:text-ink"
                aria-label="Đóng cài đặt"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {/* 1. Giao diện Sáng / Tối */}
              <div className="rounded-2xl border border-line bg-card p-3.5">
                <div className="mb-2.5 text-[12px] font-bold uppercase tracking-wider text-muted">
                  Giao diện
                </div>
                <ThemeToggle variant="switch" />
              </div>

              {/* 2. Âm thanh & Giọng đọc */}
              <div className="rounded-2xl border border-line bg-card p-3.5">
                <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-muted">
                  Âm thanh &amp; Giọng đọc
                </div>
                <button
                  type="button"
                  onClick={() => setVoiceModalOpen(true)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-bg px-3.5 py-3 text-left transition hover:bg-card-hover"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand dark:text-brand-hover">
                      <Volume2 size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-bold text-ink">
                        Tuỳ chỉnh giọng đọc (TTS)
                      </div>
                      <div className="truncate text-[12px] text-muted">
                        {accentLabel} · {ttsSettings.rate.toFixed(2)}x ·{" "}
                        {Math.round(ttsSettings.volume * 100)}%
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </button>
              </div>

              {/* 3. Thông báo */}
              <div className="space-y-2.5 rounded-2xl border border-line bg-card p-3.5">
                <div className="text-[12px] font-bold uppercase tracking-wider text-muted">
                  Thông báo
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl bg-bg px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-ink">
                      Nhắc ôn từ đến hạn
                    </div>
                    <div className="text-[12px] text-muted">
                      {dueCount > 0
                        ? `Hiện có ${dueCount} từ cần ôn hôm nay`
                        : "Không có từ tồn đọng"}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifyReviewDue}
                    disabled={savingNotif}
                    onClick={handleToggleNotify}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                      notifyReviewDue ? "bg-brand" : "bg-line"
                    } disabled:opacity-60`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        notifyReviewDue ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <Link
                  href="/notifications"
                  onClick={onClose}
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-bg px-3.5 py-2.5 text-left transition hover:bg-card-hover"
                >
                  <div className="flex items-center gap-2.5">
                    <Bell size={16} className="text-brand dark:text-brand-hover" />
                    <span className="text-[13px] font-semibold text-ink">
                      Trung tâm thông báo &amp; Web Push
                    </span>
                    {notifBadge > 0 && (
                      <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        Mới
                      </span>
                    )}
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </Link>
              </div>

              {/* 4. Kỹ năng IELTS */}
              <div className="rounded-2xl border border-line bg-card p-3.5">
                <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-muted">
                  Kỹ năng
                </div>
                {Boolean(me?.isAdmin) && !previewAsUser ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href="/reading"
                      onClick={onClose}
                      className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2.5 text-[13px] font-semibold text-ink transition hover:bg-card-hover"
                    >
                      <BookOpen size={16} className="text-brand dark:text-brand-hover" />
                      <span className="truncate">Reading</span>
                    </Link>
                    <Link
                      href="/writing"
                      onClick={onClose}
                      className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2.5 text-[13px] font-semibold text-ink transition hover:bg-card-hover"
                    >
                      <PenLine size={16} className="text-brand dark:text-brand-hover" />
                      <span className="truncate">Writing</span>
                    </Link>
                    <Link
                      href="/writing/stats"
                      onClick={onClose}
                      className="col-span-2 flex items-center gap-2 rounded-xl bg-bg px-3 py-2.5 text-[13px] font-semibold text-ink transition hover:bg-card-hover"
                    >
                      <BarChart3 size={16} className="text-brand dark:text-brand-hover" />
                      <span className="truncate">Thống kê Writing</span>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    <div
                      aria-disabled="true"
                      className="flex cursor-not-allowed items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2.5 text-[13px] font-semibold text-muted opacity-65"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <BookOpen size={16} />
                        <span className="truncate">Reading</span>
                      </span>
                      <span className="shrink-0 rounded bg-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                        Đang phát triển
                      </span>
                    </div>
                    <div
                      aria-disabled="true"
                      className="flex cursor-not-allowed items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2.5 text-[13px] font-semibold text-muted opacity-65"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <PenLine size={16} />
                        <span className="truncate">Writing</span>
                      </span>
                      <span className="shrink-0 rounded bg-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                        Đang phát triển
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Tiện ích từ vựng */}
              <div className="rounded-2xl border border-line bg-card p-3.5">
                <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-muted">
                  Tiện ích khác
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/vocab/daily"
                    onClick={onClose}
                    className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2.5 text-[13px] font-semibold text-ink transition hover:bg-card-hover"
                  >
                    <Newspaper size={16} className="text-brand dark:text-brand-hover" />
                    <span className="truncate">Từ hằng ngày</span>
                  </Link>
                  <Link
                    href="/vocab/stats"
                    onClick={onClose}
                    className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2.5 text-[13px] font-semibold text-ink transition hover:bg-card-hover"
                  >
                    <BarChart3 size={16} className="text-brand dark:text-brand-hover" />
                    <span className="truncate">Thống kê</span>
                  </Link>
                  {me?.isAdmin && (
                    <Link
                      href="/admin"
                      onClick={onClose}
                      className="col-span-2 flex items-center gap-2 rounded-xl bg-bg px-3 py-2.5 text-[13px] font-semibold text-ink transition hover:bg-card-hover"
                    >
                      <Shield size={16} className="text-brand dark:text-brand-hover" />
                      <span>Quản trị hệ thống</span>
                    </Link>
                  )}
                </div>
              </div>

              {/* 5. Tài khoản */}
              <div className="rounded-2xl border border-line bg-card p-3.5">
                {!me ? (
                  meLoaded ? (
                    <Link
                      href="/login"
                      onClick={onClose}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-[14px] font-bold text-white transition hover:bg-brand-hover"
                    >
                      <LogIn size={16} />
                      Đăng nhập Google
                    </Link>
                  ) : null
                ) : (
                  <div className="space-y-2.5">
                    <Link
                      href="/account"
                      onClick={onClose}
                      className="-mx-1.5 -mt-1.5 flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-bg"
                    >
                      <UserAvatar
                        avatarUrl={me.profile.avatar_url}
                        name={displayName}
                        email={me.profile.email}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[14px] font-bold text-ink">
                            {displayName}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              me.isAdmin
                                ? "bg-brand/15 text-brand dark:text-brand-hover"
                                : "bg-bg text-muted"
                            }`}
                          >
                            {me.isAdmin ? "Admin" : "Thành viên"}
                          </span>
                        </div>
                        <div className="truncate text-[12px] text-muted">
                          {me.profile.email}
                        </div>
                        <div className="mt-0.5 text-[11px] font-semibold text-brand dark:text-brand-hover">
                          Cấu hình tài khoản
                        </div>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-muted" />
                    </Link>

                    <div className="text-[12px] text-muted">
                      {me.isAdmin
                        ? `AI hôm nay: ${me.aiUsage.usedToday} lượt · Không giới hạn`
                        : `AI hôm nay: ${me.aiUsage.usedToday}/${
                            me.aiUsage.limit ?? me.profile.daily_ai_limit
                          }`}
                    </div>

                    {me.isAdmin && (
                      <button
                        type="button"
                        onClick={onTogglePreview}
                        className={`flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold transition ${
                          previewAsUser
                            ? "border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-300"
                            : "border-line bg-bg text-muted hover:text-ink"
                        }`}
                      >
                        <Eye size={14} />
                        {previewAsUser
                          ? "Đang xem kiểu User · Bật lại Admin"
                          : "Xem thử giao diện User"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onSignOut();
                      }}
                      disabled={signingOut}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-bg px-3 py-2 text-[13px] font-semibold text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
                    >
                      <LogOut size={14} />
                      {signingOut ? "Đang đăng xuất..." : "Đăng xuất"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <VoiceSettingsModal
        isOpen={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
      />
    </>
  );
}
