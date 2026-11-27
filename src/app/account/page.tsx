"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Award,
  BarChart3,
  Bell,
  Calendar,
  Check,
  ChevronRight,
  Image as ImageIcon,
  Layers,
  Library,
  Link2,
  Loader2,
  LogOut,
  Repeat,
  RotateCcw,
  Save,
  Shield,
  Sliders,
  Sparkles,
  Upload,
  User,
} from "lucide-react";
import { CharacterLoader } from "@/components/CharacterLoader";
import ThemeToggle from "@/components/ThemeToggle";
import { AVATAR_PRESETS, PresetAvatarIcon, UserAvatar } from "@/components/UserAvatar";
import { VoiceSettingsButton } from "@/components/VoiceSettingsModal";
import { parsePresetAvatar, toPresetAvatarUrl } from "@/lib/avatar-presets";
import { notifySettingsUpdated } from "@/lib/due-events";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/lib/srs";
import { useStudySets } from "@/lib/study-sets";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { setCachedMe, useMe, type MeInfo } from "@/lib/use-me";

type VocabOverview = {
  totalWords: number;
  masteredCount: number;
  reviewedToday: number;
  dailyReviewLimit: number;
  dueNowCount: number;
  enrolledCount: number;
};

type AvatarTab = "preset" | "upload" | "url";

function formatJoinedDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

async function compressAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Vui lòng chọn tệp hình ảnh (PNG, JPG hoặc WebP).");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Ảnh gốc quá lớn (tối đa 5MB).");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Không xử lý được tệp ảnh."));
    el.src = dataUrl;
  });

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");

  const minSide = Math.min(img.width, img.height);
  const sx = (img.width - minSide) / 2;
  const sy = (img.height - minSide) / 2;
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

  let out = canvas.toDataURL("image/webp", 0.82);
  if (!out.startsWith("data:image/webp") || out.length > 240_000) {
    out = canvas.toDataURL("image/jpeg", 0.8);
  }
  if (out.length > 250_000) {
    out = canvas.toDataURL("image/jpeg", 0.65);
  }
  return out;
}

export default function AccountPage() {
  const router = useRouter();
  const { me, meLoaded, clearMe } = useMe();
  const studySets = useStudySets();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Drafts: undefined means "not modified yet, follow me.profile"
  const [nameDraft, setNameDraft] = useState<string | undefined>(undefined);
  const [avatarDraft, setAvatarDraft] = useState<string | null | undefined>(undefined);
  const [avatarTab, setAvatarTab] = useState<AvatarTab>("preset");
  const [urlInput, setUrlInput] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [overview, setOverview] = useState<VocabOverview | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [statsRes, settingsRes] = await Promise.allSettled([
        fetch("/api/vocab/stats", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);
      if (!active) return;

      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        const j = await statsRes.value.json().catch(() => null);
        if (active && j) {
          setOverview({
            totalWords: Number(j.totalWords ?? 0),
            masteredCount: Number(j.masteredCount ?? 0),
            reviewedToday: Number(j.reviewedToday ?? 0),
            dailyReviewLimit: Number(j.dailyReviewLimit ?? DEFAULT_USER_SETTINGS.daily_review_limit),
            dueNowCount: Number(j.dueNowCount ?? 0),
            enrolledCount: Number(j.enrolledCount ?? 0),
          });
        }
      }

      if (settingsRes.status === "fulfilled" && settingsRes.value.ok) {
        const j = await settingsRes.value.json().catch(() => null);
        if (active && j) {
          setSettings({
            daily_review_limit: Number(
              j.daily_review_limit ?? DEFAULT_USER_SETTINGS.daily_review_limit
            ),
            daily_new_limit: Number(j.daily_new_limit ?? DEFAULT_USER_SETTINGS.daily_new_limit),
            session_size: Number(j.session_size ?? DEFAULT_USER_SETTINGS.session_size),
          });
        }
      }
      if (active) setSettingsLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!meLoaded) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <CharacterLoader mode="reading" indicator="dots" size="md" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="mx-auto my-8 max-w-lg rounded-3xl border border-line bg-card p-8 text-center">
        <User size={40} className="mx-auto text-brand-hover" />
        <h1 className="mt-4 text-xl font-bold text-ink">Bạn chưa đăng nhập</h1>
        <p className="mt-2 text-sm text-muted">
          Đăng nhập bằng tài khoản Google để xem hồ sơ và cấu hình trải nghiệm học tập của bạn.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover"
        >
          Đi tới trang Đăng nhập
        </Link>
      </div>
    );
  }

  const currentName = nameDraft ?? me.profile.full_name ?? "";
  const currentAvatar = avatarDraft === undefined ? me.profile.avatar_url : avatarDraft;
  const activePreset = parsePresetAvatar(currentAvatar);
  const hasProfileChanges =
    currentName.trim() !== (me.profile.full_name || "").trim() ||
    (currentAvatar ?? null) !== (me.profile.avatar_url ?? null);

  const aiLimit = me.isAdmin ? null : me.aiUsage.limit ?? me.profile.daily_ai_limit;
  const aiPct =
    aiLimit && aiLimit > 0 ? Math.min(100, Math.round((me.aiUsage.usedToday / aiLimit) * 100)) : 0;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProfile) return;
    const trimmedName = currentName.trim();
    if (!trimmedName) {
      setProfileMsg({ type: "err", text: "Vui lòng nhập tên hiển thị." });
      return;
    }

    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: trimmedName,
          avatar_url: currentAvatar,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Không lưu được hồ sơ.");
      }
      setCachedMe(data as MeInfo);
      setNameDraft(undefined);
      setAvatarDraft(undefined);
      setProfileMsg({ type: "ok", text: "Đã lưu thay đổi hồ sơ tài khoản." });
    } catch (err) {
      setProfileMsg({ type: "err", text: (err as Error).message });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingAvatar(true);
    setProfileMsg(null);
    try {
      const compressed = await compressAvatarFile(file);
      setAvatarDraft(compressed);
    } catch (err) {
      setProfileMsg({ type: "err", text: (err as Error).message });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleApplyUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed.startsWith("https://")) {
      setProfileMsg({ type: "err", text: "Link ảnh đại diện cần bắt đầu bằng https://." });
      return;
    }
    setProfileMsg(null);
    setAvatarDraft(trimmed);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daily_review_limit: settings.daily_review_limit,
          daily_new_limit: settings.daily_new_limit,
          session_size: settings.session_size,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Không lưu được cài đặt học tập.");
      }
      setSettings({
        daily_review_limit: Number(data.daily_review_limit ?? settings.daily_review_limit),
        daily_new_limit: Number(data.daily_new_limit ?? settings.daily_new_limit),
        session_size: Number(data.session_size ?? settings.session_size),
      });
      notifySettingsUpdated();
      setSettingsMsg({ type: "ok", text: "Đã cập nhật cài đặt học tập." });
    } catch (err) {
      setSettingsMsg({ type: "err", text: (err as Error).message });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // Vẫn chuyển về /login nếu session local đã hết hạn
    } finally {
      clearMe();
      setSigningOut(false);
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Cấu hình tài khoản</h1>
          <p className="mt-1 text-sm text-muted">
            Quản lý hồ sơ cá nhân, theo dõi tổng quan học tập và tuỳ chỉnh trải nghiệm của bạn.
          </p>
        </div>
        {me.isAdmin && (
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink transition hover:border-brand-hover"
          >
            <Shield size={14} className="text-brand dark:text-brand-hover" />
            Quản trị hệ thống
          </Link>
        )}
      </div>

      {/* 1. Hồ sơ cá nhân */}
      <section className="rounded-2xl border border-line bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <UserAvatar
            avatarUrl={currentAvatar}
            name={currentName || me.profile.full_name}
            email={me.profile.email}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-bold text-ink">
                {currentName || me.profile.email.split("@")[0]}
              </h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  me.isAdmin
                    ? "bg-brand/15 text-brand dark:text-brand-hover"
                    : "bg-bg text-muted"
                }`}
              >
                {me.isAdmin ? "Admin" : "Thành viên"}
              </span>
            </div>
            <div className="mt-0.5 truncate text-sm text-muted">{me.profile.email}</div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={14} />
                Tham gia: <strong className="text-ink">{formatJoinedDate(me.profile.created_at)}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles size={14} />
                {me.isAdmin ? (
                  <>
                    AI hôm nay: <strong className="text-ink">{me.aiUsage.usedToday} lượt</strong> ·
                    Không giới hạn
                  </>
                ) : (
                  <>
                    AI hôm nay:{" "}
                    <strong className="text-ink">
                      {me.aiUsage.usedToday}/{aiLimit}
                    </strong>{" "}
                    lượt
                  </>
                )}
              </span>
            </div>

            {!me.isAdmin && aiLimit !== null && (
              <div className="mt-2.5 max-w-xs">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
                  <div
                    className={`h-full rounded-full transition-all ${
                      aiPct >= 90 ? "bg-rose-500" : "bg-brand"
                    }`}
                    style={{ width: `${aiPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="mt-6 space-y-5 border-t border-line pt-5">
          <div>
            <label htmlFor="display-name" className="block text-xs font-bold uppercase tracking-wider text-muted">
              Tên hiển thị
            </label>
            <input
              id="display-name"
              type="text"
              maxLength={80}
              value={currentName}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setProfileMsg(null);
              }}
              placeholder="Nhập tên hiển thị của bạn"
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm font-medium text-ink outline-none transition focus:border-brand"
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                Ảnh đại diện
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {me.googleAvatarUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarDraft(me.googleAvatarUrl ?? null);
                      setProfileMsg(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-line bg-bg px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-brand-hover hover:text-ink"
                  >
                    <RotateCcw size={12} />
                    Dùng ảnh Google
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAvatarDraft(null);
                    setProfileMsg(null);
                  }}
                  className="rounded-lg border border-line bg-bg px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-brand-hover hover:text-ink"
                >
                  Chữ cái đầu
                </button>
              </div>
            </div>

            {/* Tabs chọn kiểu avatar */}
            <div className="mt-2.5 flex gap-1.5 rounded-xl bg-bg p-1">
              {(
                [
                  { id: "preset", label: "Biểu tượng có sẵn", icon: Sparkles },
                  { id: "upload", label: "Tải ảnh lên", icon: Upload },
                  { id: "url", label: "Dán link ảnh", icon: Link2 },
                ] as const
              ).map((tab) => {
                const TabIcon = tab.icon;
                const active = avatarTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAvatarTab(tab.id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
                      active ? "bg-card text-ink shadow-xs dark:shadow-none" : "text-muted hover:text-ink"
                    }`}
                  >
                    <TabIcon size={14} />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {avatarTab === "preset" && (
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                {AVATAR_PRESETS.map((preset) => {
                  const selected = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.label}
                      aria-label={preset.label}
                      onClick={() => {
                        setAvatarDraft(toPresetAvatarUrl(preset.id));
                        setProfileMsg(null);
                      }}
                      className={`group relative flex flex-col items-center gap-1 rounded-xl border p-2 transition ${
                        selected
                          ? "border-brand bg-brand/10"
                          : "border-line/70 bg-bg/60 hover:border-brand-hover"
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${preset.gradient} text-white`}
                      >
                        <PresetAvatarIcon id={preset.id} size={18} />
                      </div>
                      {selected && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white">
                          <Check size={10} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {avatarTab === "upload" && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line bg-bg/60 p-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-hover disabled:opacity-50"
                >
                  {uploadingAvatar ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                  {uploadingAvatar ? "Đang xử lý ảnh..." : "Chọn ảnh từ thiết bị"}
                </button>
                <span className="text-xs text-muted">
                  Hỗ trợ PNG, JPG, WebP (tự động cắt vuông &amp; nén gọn 256×256).
                </span>
              </div>
            )}

            {avatarTab === "url" && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="flex-1 rounded-xl border border-line bg-bg px-3.5 py-2 text-sm text-ink outline-none transition focus:border-brand"
                />
                <button
                  type="button"
                  onClick={handleApplyUrl}
                  className="rounded-xl border border-line bg-bg px-4 py-2 text-xs font-bold text-ink transition hover:border-brand-hover"
                >
                  Áp dụng ảnh
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="min-h-5 text-xs font-medium">
              {profileMsg && (
                <span
                  className={
                    profileMsg.type === "ok"
                      ? "text-emerald-600 dark:text-emerald-300"
                      : "text-rose-600 dark:text-rose-400"
                  }
                >
                  {profileMsg.text}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasProfileChanges && (
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(undefined);
                    setAvatarDraft(undefined);
                    setProfileMsg(null);
                  }}
                  className="rounded-full border border-line bg-bg px-4 py-2 text-xs font-semibold text-muted transition hover:text-ink"
                >
                  Huỷ
                </button>
              )}
              <button
                type="submit"
                disabled={savingProfile || !hasProfileChanges}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-xs font-bold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {savingProfile ? "Đang lưu..." : "Lưu hồ sơ"}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* 2. Tổng quan học tập */}
      <section className="rounded-2xl border border-line bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <BarChart3 size={18} className="text-brand dark:text-brand-hover" />
            Tổng quan học tập
          </h2>
          <Link
            href="/vocab/stats"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand transition hover:underline dark:text-brand-hover"
          >
            Xem chi tiết
            <ChevronRight size={14} />
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-line/70 bg-bg/60 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Library size={14} className="text-brand dark:text-brand-hover" />
              Từ trong kho
            </div>
            <div className="mt-2 text-2xl font-bold text-ink">
              {overview ? overview.totalWords : "—"}
            </div>
          </div>

          <div className="rounded-xl border border-line/70 bg-bg/60 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Layers size={14} className="text-brand dark:text-brand-hover" />
              Bộ thẻ học
            </div>
            <div className="mt-2 text-2xl font-bold text-ink">{studySets.length}</div>
          </div>

          <div className="rounded-xl border border-line/70 bg-bg/60 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Award size={14} className="text-emerald-500" />
              Đã thành thạo
            </div>
            <div className="mt-2 text-2xl font-bold text-ink">
              {overview ? overview.masteredCount : "—"}
            </div>
          </div>

          <div className="rounded-xl border border-line/70 bg-bg/60 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Repeat size={14} className="text-amber-500" />
              Ôn hôm nay
            </div>
            <div className="mt-2 text-2xl font-bold text-ink">
              {overview ? overview.reviewedToday : "—"}
              {overview && overview.dueNowCount > 0 && (
                <span className="ml-1.5 text-xs font-semibold text-amber-600 dark:text-amber-300">
                  ({overview.dueNowCount} chờ)
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Cài đặt học tập & trải nghiệm */}
      <section className="rounded-2xl border border-line bg-card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <Sliders size={18} className="text-brand dark:text-brand-hover" />
          Cài đặt học tập
        </h2>
        <p className="mt-1 text-xs text-muted">
          Tuỳ chỉnh cường độ ôn tập SRS phù hợp với lịch học hằng ngày của bạn.
        </p>

        <form onSubmit={handleSaveSettings} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block rounded-xl border border-line/70 bg-bg/60 p-3.5">
              <span className="block text-xs font-bold text-ink">Giới hạn ôn / ngày</span>
              <span className="block text-[11px] text-muted">5 – 500 từ</span>
              <input
                type="number"
                min={5}
                max={500}
                disabled={!settingsLoaded}
                value={settings.daily_review_limit}
                onChange={(e) => {
                  setSettings((prev) => ({
                    ...prev,
                    daily_review_limit: Number(e.target.value) || 0,
                  }));
                  setSettingsMsg(null);
                }}
                className="mt-2 w-full rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-bold text-ink outline-none focus:border-brand"
              />
            </label>

            <label className="block rounded-xl border border-line/70 bg-bg/60 p-3.5">
              <span className="block text-xs font-bold text-ink">Từ mới / ngày</span>
              <span className="block text-[11px] text-muted">0 – 200 từ</span>
              <input
                type="number"
                min={0}
                max={200}
                disabled={!settingsLoaded}
                value={settings.daily_new_limit}
                onChange={(e) => {
                  setSettings((prev) => ({
                    ...prev,
                    daily_new_limit: Number(e.target.value) || 0,
                  }));
                  setSettingsMsg(null);
                }}
                className="mt-2 w-full rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-bold text-ink outline-none focus:border-brand"
              />
            </label>

            <label className="block rounded-xl border border-line/70 bg-bg/60 p-3.5">
              <span className="block text-xs font-bold text-ink">Số từ / phiên ôn</span>
              <span className="block text-[11px] text-muted">5 – 50 từ</span>
              <input
                type="number"
                min={5}
                max={50}
                disabled={!settingsLoaded}
                value={settings.session_size}
                onChange={(e) => {
                  setSettings((prev) => ({
                    ...prev,
                    session_size: Number(e.target.value) || 0,
                  }));
                  setSettingsMsg(null);
                }}
                className="mt-2 w-full rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-bold text-ink outline-none focus:border-brand"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-h-5 text-xs font-medium">
              {settingsMsg && (
                <span
                  className={
                    settingsMsg.type === "ok"
                      ? "text-emerald-600 dark:text-emerald-300"
                      : "text-rose-600 dark:text-rose-400"
                  }
                >
                  {settingsMsg.text}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={savingSettings || !settingsLoaded}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-xs font-bold text-white transition hover:bg-brand-hover disabled:opacity-50"
            >
              {savingSettings ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {savingSettings ? "Đang lưu..." : "Lưu cài đặt"}
            </button>
          </div>
        </form>

        <div className="mt-6 space-y-3 border-t border-line pt-5">
          <div className="text-xs font-bold uppercase tracking-wider text-muted">
            Giao diện, giọng đọc &amp; thông báo
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ThemeToggle variant="switch" />
            <VoiceSettingsButton className="w-full justify-center" />
          </div>
          <Link
            href="/notifications"
            className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-bg/60 px-4 py-3 text-sm font-semibold text-ink transition hover:border-brand-hover"
          >
            <span className="flex items-center gap-2.5">
              <Bell size={16} className="text-brand dark:text-brand-hover" />
              Quản lý thông báo &amp; Web Push
            </span>
            <ChevronRight size={16} className="text-muted" />
          </Link>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-bg px-4 py-2.5 text-xs font-bold text-muted transition hover:border-rose-400/50 hover:text-rose-500 disabled:opacity-50"
          >
            <LogOut size={14} />
            {signingOut ? "Đang đăng xuất..." : "Đăng xuất tài khoản"}
          </button>
        </div>
      </section>
    </div>
  );
}
