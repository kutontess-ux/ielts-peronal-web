export type SpeechAccent = "en-US" | "en-GB" | "en-AU" | "en-CA" | "en-IN";

export interface TtsSettings {
  accent: SpeechAccent;
  voiceURI: string;
  rate: number; // 0.6x - 1.4x (default: 0.95)
  pitch: number; // 0.7 - 1.3 (default: 1.0)
  volume: number; // 0 - 1 (default: 1.0)
}

export const ACCENT_OPTIONS: { id: SpeechAccent; label: string; desc: string; flag: string }[] = [
  { id: "en-US", label: "Anh - Mỹ", desc: "American English", flag: "🇺🇸" },
  { id: "en-GB", label: "Anh - Anh", desc: "British English (IELTS)", flag: "🇬🇧" },
  { id: "en-AU", label: "Anh - Úc", desc: "Australian English", flag: "🇦🇺" },
  { id: "en-CA", label: "Anh - Canada", desc: "Canadian English", flag: "🇨🇦" },
  { id: "en-IN", label: "Anh - Ấn", desc: "Indian English", flag: "🇮🇳" },
];

export const SPEED_PRESETS = [
  { label: "0.75x Chậm", value: 0.75 },
  { label: "0.9x Vừa", value: 0.9 },
  { label: "1.0x Chuẩn", value: 1.0 },
  { label: "1.15x Nhanh", value: 1.15 },
];

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  accent: "en-US",
  voiceURI: "",
  rate: 0.95,
  pitch: 1.0,
  volume: 1.0,
};

const STORAGE_KEY = "ielts_tts_settings_v1";
export const TTS_SETTINGS_CHANGED_EVENT = "ielts_tts_settings_changed";

export function getTtsSettings(): TtsSettings {
  if (typeof window === "undefined") return DEFAULT_TTS_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TTS_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TtsSettings>;
    return {
      accent: parsed.accent ?? DEFAULT_TTS_SETTINGS.accent,
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : "",
      rate: typeof parsed.rate === "number" && parsed.rate > 0 ? parsed.rate : DEFAULT_TTS_SETTINGS.rate,
      pitch: typeof parsed.pitch === "number" && parsed.pitch > 0 ? parsed.pitch : DEFAULT_TTS_SETTINGS.pitch,
      volume: typeof parsed.volume === "number" && parsed.volume >= 0 ? parsed.volume : DEFAULT_TTS_SETTINGS.volume,
    };
  } catch {
    return DEFAULT_TTS_SETTINGS;
  }
}

export function saveTtsSettings(patch: Partial<TtsSettings>): TtsSettings {
  const current = getTtsSettings();
  const next: TtsSettings = {
    ...current,
    ...patch,
  };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(TTS_SETTINGS_CHANGED_EVENT, { detail: next }));
    } catch {
      // ignore storage errors
    }
  }
  return next;
}

/**
 * Lấy danh sách giọng đọc tiếng Anh hỗ trợ từ trình duyệt
 */
export function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve([]);
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(filterEnglishVoices(voices));
      return;
    }

    // Một số trình duyệt tải voices không đồng bộ
    const onVoicesChanged = () => {
      const v = window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = null;
      resolve(filterEnglishVoices(v));
    };
    window.speechSynthesis.onvoiceschanged = onVoicesChanged;

    // Timeout dự phòng
    setTimeout(() => {
      resolve(filterEnglishVoices(window.speechSynthesis.getVoices()));
    }, 1000);
  });
}

function filterEnglishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => {
    const lang = (v.lang || "").toLowerCase();
    return lang.startsWith("en") || lang.includes("-en") || lang.includes("_en");
  });
}

/**
 * Tìm giọng phù hợp theo voiceURI hoặc accent đã chọn
 */
export function findMatchingVoice(
  voices: SpeechSynthesisVoice[],
  settings: TtsSettings
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  // 1. Nếu có voiceURI cụ thể đã chọn
  if (settings.voiceURI) {
    const found = voices.find((v) => v.voiceURI === settings.voiceURI);
    if (found) return found;
  }

  // 2. Tìm giọng theo mã accent (ví dụ en-US, en-GB, en-AU)
  const normAccent = settings.accent.toLowerCase().replace("_", "-");
  const matchingAccent = voices.filter((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    return lang === normAccent || lang.startsWith(normAccent);
  });

  if (matchingAccent.length > 0) {
    // Ưu tiên các giọng tự nhiên / default nếu có
    const preferred = matchingAccent.find((v) => v.default || !v.localService) || matchingAccent[0];
    return preferred;
  }

  // 3. Fallback: Bất kỳ giọng tiếng Anh nào
  return voices[0] || null;
}

/**
 * Phát âm một từ hoặc đoạn văn bản với cài đặt hiện tại
 */
export function speakWord(text: string, customOptions?: Partial<TtsSettings>): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const cleanText = text.trim();
  if (!cleanText) return;

  try {
    window.speechSynthesis.cancel();

    const settings = {
      ...getTtsSettings(),
      ...customOptions,
    };

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = settings.accent;
    utterance.rate = Math.min(2.0, Math.max(0.4, settings.rate));
    utterance.pitch = Math.min(2.0, Math.max(0.5, settings.pitch));
    utterance.volume = Math.min(1.0, Math.max(0.0, settings.volume));

    const allVoices = window.speechSynthesis.getVoices();
    const matchingVoice = findMatchingVoice(allVoices, settings);
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    // Tránh crash nếu SpeechSynthesis gặp lỗi trên trình duyệt lạ
    console.warn("TTS speak failed:", err);
  }
}

/**
 * Dừng phát âm ngay lập tức
 */
export function stopSpeaking(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}
