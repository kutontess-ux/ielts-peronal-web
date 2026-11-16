"use client";

import { useEffect, useState } from "react";
import {
  BookMarked, Brain, Building2, Compass, Cpu, Flame, Globe, GraduationCap,
  HeartPulse, Image as ImageIcon, Landmark, Layers, Leaf, Newspaper, Pencil,
  RotateCcw, Scale, Sparkles, Target, TrendingUp, Trophy, Upload, X, type LucideIcon,
} from "lucide-react";

export type CardBadgeValue =
  | { type: "icon"; name: string }
  | { type: "image"; src: string };

const ICON_OPTIONS: [string, LucideIcon][] = [
  ["book", BookMarked],
  ["grad", GraduationCap],
  ["leaf", Leaf],
  ["globe", Globe],
  ["cpu", Cpu],
  ["health", HeartPulse],
  ["landmark", Landmark],
  ["trend", TrendingUp],
  ["scale", Scale],
  ["building", Building2],
  ["sparkles", Sparkles],
  ["flame", Flame],
  ["trophy", Trophy],
  ["target", Target],
  ["brain", Brain],
  ["news", Newspaper],
  ["layers", Layers],
  ["compass", Compass],
];

const ICON_MAP = new Map<string, LucideIcon>(ICON_OPTIONS);
const STORAGE_KEY = "ielts_card_badges_v1";

export function useCardBadges() {
  const [badges, setBadges] = useState<Record<string, CardBadgeValue>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setBadges(JSON.parse(raw));
    } catch {
      // bỏ qua
    }
  }, []);

  const saveBadge = (key: string, val: CardBadgeValue | null) => {
    setBadges((prev) => {
      const next = { ...prev };
      if (val) next[key] = val;
      else delete next[key];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // bỏ qua nếu vượt quá bộ nhớ localStorage
      }
      return next;
    });
  };

  return { badges, saveBadge };
}

export function CardBadge({
  custom,
  FallbackIcon,
  size = 30,
}: {
  custom?: CardBadgeValue;
  FallbackIcon: LucideIcon;
  size?: number;
}) {
  if (custom?.type === "image" && custom.src) {
    return (
      <img
        src={custom.src}
        alt=""
        className="h-11 w-11 rounded-xl object-cover border border-line"
      />
    );
  }
  const Icon = (custom?.type === "icon" && ICON_MAP.get(custom.name)) || FallbackIcon;
  return <Icon size={size} strokeWidth={1.4} className="text-brand-hover" />;
}

export function BadgePickerModal({
  title,
  current,
  onSelect,
  onClose,
}: {
  title: string;
  current?: CardBadgeValue;
  onSelect: (val: CardBadgeValue | null) => void;
  onClose: () => void;
}) {
  const [imgUrl, setImgUrl] = useState(current?.type === "image" ? current.src : "");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Thu nhỏ ảnh về tối đa 160px để lưu localStorage nhẹ nhàng
        const canvas = document.createElement("canvas");
        const max = 160;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        onSelect({ type: "image", src: canvas.toDataURL("image/webp", 0.85) });
        onClose();
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-line bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="font-bold">Đổi icon / ảnh: {title}</div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-line hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="mb-2 text-xs font-semibold text-muted">Chọn icon nét mảnh</div>
        <div className="grid grid-cols-6 gap-2">
          {ICON_OPTIONS.map(([name, Ic]) => {
            const active = current?.type === "icon" && current.name === name;
            return (
              <button
                key={name}
                onClick={() => { onSelect({ type: "icon", name }); onClose(); }}
                className={`flex h-11 items-center justify-center rounded-xl border transition ${
                  active ? "border-brand-hover bg-brand/20 text-white" : "border-line bg-bg text-muted hover:text-white"
                }`}
              >
                <Ic size={20} strokeWidth={1.5} />
              </button>
            );
          })}
        </div>

        <div className="mt-5 mb-2 text-xs font-semibold text-muted">Hoặc dùng ảnh riêng</div>
        <div className="flex gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand px-4 py-2 text-xs font-bold hover:bg-brand-hover hover:text-bg">
            <Upload size={14} /> Tải ảnh từ máy
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
          </label>
          {current && (
            <button
              onClick={() => { onSelect(null); onClose(); }}
              className="inline-flex items-center gap-1.5 rounded-full bg-line px-4 py-2 text-xs font-semibold hover:bg-card-hover"
            >
              <RotateCcw size={13} /> Mặc định
            </button>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <ImageIcon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={imgUrl}
              onChange={(e) => setImgUrl(e.target.value)}
              placeholder="Hoặc dán link ảnh (https://...)"
              className="w-full rounded-full border border-line py-2 pl-9 pr-3 text-xs outline-none focus:border-brand-hover"
            />
          </div>
          <button
            disabled={!imgUrl.trim()}
            onClick={() => { onSelect({ type: "image", src: imgUrl.trim() }); onClose(); }}
            className="rounded-full bg-line px-4 py-2 text-xs font-bold hover:bg-brand disabled:opacity-40"
          >
            Dùng
          </button>
        </div>
      </div>
    </div>
  );
}

export function EditBadgeButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      title="Đổi icon hoặc ảnh"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(e as unknown as React.MouseEvent); }}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-bg/80 text-muted opacity-0 transition hover:bg-brand hover:text-white group-hover:opacity-100"
    >
      <Pencil size={13} />
    </span>
  );
}
