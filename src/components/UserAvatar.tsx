/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import {
  BookOpen,
  Compass,
  Feather,
  Flame,
  GraduationCap,
  Leaf,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  parsePresetAvatar,
  type AvatarPresetId,
} from "@/lib/avatar-presets";

export type AvatarPresetMeta = {
  id: AvatarPresetId;
  label: string;
  gradient: string;
  icon: LucideIcon;
};

export const AVATAR_PRESETS: AvatarPresetMeta[] = [
  { id: "ocean", label: "Đại dương", gradient: "from-sky-500 to-blue-600", icon: Compass },
  { id: "sunset", label: "Hoàng hôn", gradient: "from-orange-500 to-rose-500", icon: Flame },
  { id: "emerald", label: "Lục bảo", gradient: "from-emerald-500 to-teal-600", icon: Leaf },
  { id: "violet", label: "Tím mộng", gradient: "from-violet-500 to-purple-600", icon: Sparkles },
  { id: "amber", label: "Năng lượng", gradient: "from-amber-400 to-orange-500", icon: Zap },
  { id: "rose", label: "Hồng phấn", gradient: "from-pink-500 to-rose-600", icon: Feather },
  { id: "indigo", label: "Học thuật", gradient: "from-indigo-500 to-blue-700", icon: GraduationCap },
  { id: "teal", label: "Đọc sách", gradient: "from-teal-500 to-cyan-600", icon: BookOpen },
];

const PRESET_MAP = new Map<AvatarPresetId, AvatarPresetMeta>(
  AVATAR_PRESETS.map((p) => [p.id, p])
);

const SIZE_STYLES = {
  sm: { box: "h-9 w-9 text-xs", icon: 17 },
  md: { box: "h-11 w-11 text-sm", icon: 20 },
  lg: { box: "h-20 w-20 text-2xl", icon: 34 },
} as const;

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name || email || "U").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function PresetAvatarIcon({ id, size }: { id: AvatarPresetId; size: number }) {
  switch (id) {
    case "ocean":
      return <Compass size={size} strokeWidth={1.9} />;
    case "sunset":
      return <Flame size={size} strokeWidth={1.9} />;
    case "emerald":
      return <Leaf size={size} strokeWidth={1.9} />;
    case "violet":
      return <Sparkles size={size} strokeWidth={1.9} />;
    case "amber":
      return <Zap size={size} strokeWidth={1.9} />;
    case "rose":
      return <Feather size={size} strokeWidth={1.9} />;
    case "indigo":
      return <GraduationCap size={size} strokeWidth={1.9} />;
    case "teal":
      return <BookOpen size={size} strokeWidth={1.9} />;
  }
}

export function UserAvatar({
  avatarUrl,
  name,
  email,
  size = "sm",
  className = "",
}: {
  avatarUrl?: string | null;
  name?: string | null;
  email?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { box, icon: iconSize } = SIZE_STYLES[size];
  const presetId = parsePresetAvatar(avatarUrl);

  if (presetId) {
    const preset = PRESET_MAP.get(presetId);
    if (preset) {
      return (
        <div
          className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${preset.gradient} text-white shadow-xs ${box} ${className}`}
        >
          <PresetAvatarIcon id={preset.id} size={iconSize} />
        </div>
      );
    }
  }

  const trimmed = avatarUrl?.trim() || "";
  const isImage =
    Boolean(trimmed) &&
    failedUrl !== trimmed &&
    (trimmed.startsWith("https://") || trimmed.startsWith("data:image/"));

  if (isImage) {
    return (
      <img
        src={trimmed}
        alt={name || email || "Avatar"}
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(trimmed)}
        className={`shrink-0 rounded-full border border-line/60 object-cover ${box} ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand/15 font-bold text-brand dark:text-brand-hover ${box} ${className}`}
    >
      {getInitials(name, email)}
    </div>
  );
}
