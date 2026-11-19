"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Volume2,
  X,
  RotateCcw,
  Check,
  Play,
} from "lucide-react";
import {
  ACCENT_OPTIONS,
  DEFAULT_TTS_SETTINGS,
  SPEED_PRESETS,
  SpeechAccent,
  TTS_SETTINGS_CHANGED_EVENT,
  TtsSettings,
  findMatchingVoice,
  getAvailableVoices,
  getTtsSettings,
  saveTtsSettings,
  speakWord,
  stopSpeaking,
} from "@/lib/tts";

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VoiceSettingsModal({ isOpen, onClose }: VoiceSettingsModalProps) {
  const [settings, setSettings] = useState<TtsSettings>(() => getTtsSettings());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [testPhrase, setTestPhrase] = useState("Comprehensive preparation is the key to IELTS success.");

  // Đồng bộ cài đặt và danh sách voices khi mở modal
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void getAvailableVoices().then((v) => {
      if (active) setVoices(v);
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    const onSettingsChanged = (e: Event) => {
      const custom = e as CustomEvent<TtsSettings>;
      if (custom.detail) {
        setSettings(custom.detail);
      } else {
        setSettings(getTtsSettings());
      }
    };
    window.addEventListener(TTS_SETTINGS_CHANGED_EVENT, onSettingsChanged);
    return () => window.removeEventListener(TTS_SETTINGS_CHANGED_EVENT, onSettingsChanged);
  }, []);

  // Khoá cuộn trang nền và lắng nghe phím ESC khi mở modal
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  const handleUpdate = (patch: Partial<TtsSettings>) => {
    const next = saveTtsSettings(patch);
    setSettings(next);
  };

  const handleSelectAccent = (accent: SpeechAccent) => {
    // Khi đổi accent, reset voiceURI về rỗng để hệ thống tự chọn voice tốt nhất cho accent đó
    handleUpdate({ accent, voiceURI: "" });
  };

  const handleTestVoice = () => {
    stopSpeaking();
    setIsPlayingTest(true);
    speakWord(testPhrase, settings);
    setTimeout(() => {
      setIsPlayingTest(false);
    }, 2500);
  };

  const handleReset = () => {
    stopSpeaking();
    const next = saveTtsSettings(DEFAULT_TTS_SETTINGS);
    setSettings(next);
  };

  // Lọc giọng theo accent hiện tại để người dùng dễ chọn
  const normAccent = settings.accent.toLowerCase().replace("_", "-");
  const filteredVoices = voices.filter((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    return lang === normAccent || lang.startsWith(normAccent);
  });
  const displayVoices = filteredVoices.length > 0 ? filteredVoices : voices;

  const currentMatchedVoice = findMatchingVoice(voices, settings);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cài đặt giọng đọc và phát âm"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative z-10 flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-card shadow-2xl transition-all sm:max-h-[90vh] sm:rounded-2xl">
        {/* Header cố định */}
        <div className="flex shrink-0 items-center justify-between border-b border-line/70 px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-hover sm:h-10 sm:w-10">
              <Volume2 size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-ink sm:text-base">
                Cài đặt giọng đọc &amp; phát âm
              </h3>
              <p className="truncate text-[11px] text-muted sm:text-xs">
                Tuỳ chỉnh giọng đọc (Accent), tốc độ và âm điệu
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-muted transition hover:bg-bg hover:text-ink"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nội dung cuộn được */}
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:space-y-6 sm:px-6 sm:py-5">
          {/* 1. Chọn Accent / Giọng đọc */}
          <div>
            <label className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs font-bold uppercase tracking-wider text-muted">
              <span>1. Vùng miền &amp; Accent</span>
              <span className="text-[11px] font-normal normal-case text-brand-hover">
                Ưu tiên IELTS: Anh - Anh hoặc Anh - Mỹ
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ACCENT_OPTIONS.map((opt) => {
                const active = settings.accent === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectAccent(opt.id)}
                    className={`flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition sm:gap-1 sm:p-3 ${
                      active
                        ? "border-brand bg-brand/10 text-brand-hover ring-2 ring-brand/30"
                        : "border-line bg-bg hover:border-line/80 hover:bg-card"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-base sm:text-lg">{opt.flag}</span>
                      {active && <Check size={14} className="text-brand-hover" />}
                    </div>
                    <span className="text-xs font-bold text-ink">{opt.label}</span>
                    <span className="text-[10px] text-muted line-clamp-1">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Chi tiết giọng đọc trong trình duyệt (Voice Engine) */}
          {displayVoices.length > 0 && (
            <div>
              <label className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs font-bold uppercase tracking-wider text-muted">
                <span>Giọng đọc trình duyệt ({displayVoices.length} giọng)</span>
                {currentMatchedVoice && (
                  <span className="max-w-full truncate text-[11px] font-normal normal-case text-muted sm:max-w-[200px]">
                    Đang dùng: {currentMatchedVoice.name}
                  </span>
                )}
              </label>
              <select
                value={settings.voiceURI}
                onChange={(e) => handleUpdate({ voiceURI: e.target.value })}
                className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs font-medium text-ink focus:border-brand focus:outline-none"
              >
                <option value="">-- Tự động chọn giọng chuẩn nhất cho {settings.accent} --</option>
                {displayVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang}){v.default ? " [Mặc định]" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 3. Tốc độ đọc (Reading Speed) */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted">
                2. Tốc độ đọc
              </label>
              <span className="rounded-md bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand-hover">
                {settings.rate.toFixed(2)}x
              </span>
            </div>

            {/* Quick buttons */}
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              {SPEED_PRESETS.map((p) => {
                const active = Math.abs(settings.rate - p.value) < 0.04;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => handleUpdate({ rate: p.value })}
                    className={`rounded-lg border px-1 py-1.5 text-[11px] font-semibold transition sm:text-xs ${
                      active
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-bg text-muted hover:text-ink"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Slider */}
            <input
              type="range"
              min="0.6"
              max="1.4"
              step="0.05"
              value={settings.rate}
              onChange={(e) => handleUpdate({ rate: parseFloat(e.target.value) })}
              className="w-full accent-brand"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted">
              <span>0.6x (Rất chậm)</span>
              <span>1.0x (Bình thường)</span>
              <span>1.4x (Nhanh)</span>
            </div>
          </div>

          {/* 4. Cao độ (Pitch) */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted">
                3. Cao độ giọng (Pitch)
              </label>
              <span className="rounded-md bg-bg px-2 py-0.5 text-xs font-medium text-muted">
                {settings.pitch === 1.0
                  ? "Tự nhiên (1.0)"
                  : settings.pitch < 1.0
                  ? "Trầm hơn"
                  : "Bổng hơn"}
              </span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.2"
              step="0.05"
              value={settings.pitch}
              onChange={(e) => handleUpdate({ pitch: parseFloat(e.target.value) })}
              className="w-full accent-brand"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted">
              <span>Trầm (0.8)</span>
              <span>Tự nhiên (1.0)</span>
              <span>Bổng (1.2)</span>
            </div>
          </div>

          {/* 4. Âm lượng (Boost) */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted">
                4. Âm lượng phát âm (Boost)
              </label>
              <span className="rounded-md bg-bg px-2 py-0.5 text-xs font-bold tabular-nums text-brand-hover">
                {Math.round(settings.volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.1"
              value={settings.volume}
              onChange={(e) => handleUpdate({ volume: parseFloat(e.target.value) })}
              className="w-full accent-brand"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted">
              <span>50%</span>
              <span>100% (Chuẩn)</span>
              <span>220% (Mặc định)</span>
              <span>300% (To nhất)</span>
            </div>
          </div>

          {/* 5. Thử giọng & Kiểm tra trực tiếp */}
          <div className="rounded-xl border border-line bg-bg p-3 sm:p-3.5">
            <label className="mb-1.5 block text-xs font-bold text-muted">
              Nghe thử trực tiếp:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={testPhrase}
                onChange={(e) => setTestPhrase(e.target.value)}
                placeholder="Nhập câu tiếng Anh để nghe thử..."
                className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                onClick={handleTestVoice}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg sm:px-3.5"
              >
                <Play size={13} fill="currentColor" />
                {isPlayingTest ? "Đang đọc..." : "Nghe thử"}
              </button>
            </div>
          </div>
        </div>

        {/* Footer cố định */}
        <div className="flex shrink-0 items-center justify-between border-t border-line/70 px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-ink"
          >
            <RotateCcw size={13} />
            Khôi phục mặc định
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-brand px-5 py-2 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg"
          >
            Xong
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Nút bật modal Cài đặt Giọng đọc tiện dụng
 */
export function VoiceSettingsButton({
  className = "",
  variant = "button",
}: {
  className?: string;
  variant?: "button" | "icon" | "compact";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`rounded-xl border border-line bg-card p-2 text-muted transition hover:text-ink ${className}`}
          aria-label="Cài đặt giọng đọc"
          title="Cài đặt giọng đọc & phát âm"
        >
          <Volume2 size={18} />
        </button>
      ) : variant === "compact" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2 py-1 text-[11px] font-medium text-muted transition hover:border-brand-hover hover:text-ink ${className}`}
          title="Cài đặt giọng đọc"
        >
          <Volume2 size={13} className="text-brand-hover" />
          <span>Giọng đọc</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-muted transition hover:border-brand-hover hover:text-ink ${className}`}
          title="Cài đặt giọng đọc & phát âm"
        >
          <Volume2 size={15} className="text-brand-hover" />
          <span>Giọng đọc</span>
        </button>
      )}

      <VoiceSettingsModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
