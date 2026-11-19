export type SpeechAccent = "en-US" | "en-GB" | "en-AU" | "en-CA" | "en-IN";
export type SpeechLang = SpeechAccent | "vi" | "vi-VN";

export const GOOGLE_VI_VOICE_ID = "__google__";

export interface TtsSettings {
  accent: SpeechAccent;
  voiceURI: string;
  rate: number; // 0.6x - 1.4x (default: 0.95)
  pitch: number; // 0.8 - 1.2 (default: 1.0)
  volume: number; // 0.5 - 1.0 (chuẩn) hoặc 0.5 - 3.0 (khi bật Boost)
  boostEnabled: boolean; // false = giọng gốc trình duyệt; true = MP3 + Web Audio Boost
  viVoiceURI: string; // "" = tự động (ưu tiên giọng vi-VN của máy, dự phòng Google), "__google__" = Google TTS
  autoplayReadVi: boolean; // false = chỉ đọc tiếng Anh; true = lật thẻ đọc thêm tiếng Việt khi Tự phát
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
  boostEnabled: false,
  viVoiceURI: "",
  autoplayReadVi: false,
};

const STORAGE_KEY = "ielts_tts_settings_v1";
export const TTS_SETTINGS_CHANGED_EVENT = "ielts_tts_settings_changed";

let audioCtx: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let activeAbort: AbortController | null = null;
const bufferCache = new Map<string, AudioBuffer>();

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function getTtsSettings(): TtsSettings {
  if (typeof window === "undefined") return DEFAULT_TTS_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TTS_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TtsSettings>;
    const boostEnabled = typeof parsed.boostEnabled === "boolean" ? parsed.boostEnabled : false;
    const maxVol = boostEnabled ? 3.0 : 1.0;
    const rawVol = typeof parsed.volume === "number" && parsed.volume > 0 ? parsed.volume : 1.0;
    return {
      accent: parsed.accent ?? DEFAULT_TTS_SETTINGS.accent,
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : "",
      rate: typeof parsed.rate === "number" && parsed.rate > 0 ? parsed.rate : DEFAULT_TTS_SETTINGS.rate,
      pitch: typeof parsed.pitch === "number" && parsed.pitch > 0 ? parsed.pitch : DEFAULT_TTS_SETTINGS.pitch,
      volume: Math.min(maxVol, Math.max(0.5, rawVol)),
      boostEnabled,
      viVoiceURI: typeof parsed.viVoiceURI === "string" ? parsed.viVoiceURI : "",
      autoplayReadVi: typeof parsed.autoplayReadVi === "boolean" ? parsed.autoplayReadVi : false,
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

function loadBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve([]);
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    const onVoicesChanged = () => {
      const v = window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = null;
      resolve(v);
    };
    window.speechSynthesis.onvoiceschanged = onVoicesChanged;

    setTimeout(() => {
      resolve(window.speechSynthesis.getVoices());
    }, 1000);
  });
}

/**
 * Lấy danh sách giọng đọc tiếng Anh hỗ trợ từ trình duyệt
 */
export async function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = await loadBrowserVoices();
  return filterEnglishVoices(voices);
}

/**
 * Lấy danh sách giọng đọc tiếng Việt hỗ trợ từ trình duyệt
 */
export async function getAvailableVietnameseVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = await loadBrowserVoices();
  return filterVietnameseVoices(voices);
}

function filterEnglishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => {
    const lang = (v.lang || "").toLowerCase();
    return lang.startsWith("en") || lang.includes("-en") || lang.includes("_en");
  });
}

function filterVietnameseVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    return lang === "vi" || lang.startsWith("vi-");
  });
}

/**
 * Tìm giọng tiếng Anh phù hợp theo voiceURI hoặc accent đã chọn
 */
export function findMatchingVoice(
  voices: SpeechSynthesisVoice[],
  settings: TtsSettings
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  if (settings.voiceURI) {
    const found = voices.find((v) => v.voiceURI === settings.voiceURI);
    if (found) return found;
  }

  const normAccent = settings.accent.toLowerCase().replace("_", "-");
  const matchingAccent = voices.filter((v) => {
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    return lang === normAccent || lang.startsWith(normAccent);
  });

  if (matchingAccent.length > 0) {
    const preferred = matchingAccent.find((v) => v.default || !v.localService) || matchingAccent[0];
    return preferred;
  }

  return voices[0] || null;
}

/**
 * Tìm giọng tiếng Việt phù hợp từ trình duyệt
 */
export function findMatchingVietnameseVoice(
  voices: SpeechSynthesisVoice[],
  viVoiceURI: string
): SpeechSynthesisVoice | null {
  const viVoices = filterVietnameseVoices(voices);
  if (viVoices.length === 0) return null;

  if (viVoiceURI && viVoiceURI !== GOOGLE_VI_VOICE_ID) {
    const found = viVoices.find((v) => v.voiceURI === viVoiceURI);
    if (found) return found;
  }

  return viVoices.find((v) => !v.localService || v.default) || viVoices[0];
}

function speakWithBrowserTTS(
  text: string,
  settings: TtsSettings,
  langOverride?: SpeechLang
): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const isVi = langOverride?.toLowerCase().startsWith("vi") ?? false;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = isVi ? "vi-VN" : settings.accent;
    utterance.rate = Math.min(2.0, Math.max(0.4, settings.rate));
    utterance.pitch = Math.min(2.0, Math.max(0.5, settings.pitch));
    utterance.volume = Math.min(1.0, Math.max(0.0, settings.volume));

    const allVoices = window.speechSynthesis.getVoices();
    if (isVi) {
      const viVoice = findMatchingVietnameseVoice(allVoices, settings.viVoiceURI);
      if (viVoice) utterance.voice = viVoice;
    } else {
      const enVoices = filterEnglishVoices(allVoices);
      const matchingVoice = findMatchingVoice(enVoices, settings);
      if (matchingVoice) utterance.voice = matchingVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("TTS speak failed:", err);
  }
}

function playDecodedBuffer(ctx: AudioContext, buffer: AudioBuffer, settings: TtsSettings): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = Math.min(2.0, Math.max(0.5, settings.rate));

  const targetGain = settings.boostEnabled
    ? Math.min(3.0, Math.max(0.5, settings.volume))
    : Math.min(1.0, Math.max(0.5, settings.volume));

  const gainNode = ctx.createGain();
  gainNode.gain.value = targetGain;

  // Limiter nhẹ ở -1.5dB để bảo vệ loa khi bật Boost mà không làm méo phụ âm
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 6;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;

  source.connect(gainNode);
  gainNode.connect(limiter);
  limiter.connect(ctx.destination);

  source.onended = () => {
    if (activeSource === source) {
      activeSource = null;
    }
  };

  activeSource = source;
  source.start(0);
}

function playViaTtsApi(cleanText: string, targetLang: SpeechLang, settings: TtsSettings): void {
  const ctx = getAudioContext();
  if (!ctx) {
    speakWithBrowserTTS(cleanText, settings, targetLang);
    return;
  }

  const cacheKey = `${targetLang}:${cleanText.toLowerCase()}`;
  const cached = bufferCache.get(cacheKey);
  if (cached) {
    playDecodedBuffer(ctx, cached, settings);
    return;
  }

  const controller = new AbortController();
  activeAbort = controller;

  void (async () => {
    try {
      const res = await fetch(
        `/api/tts?text=${encodeURIComponent(cleanText)}&lang=${encodeURIComponent(targetLang)}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);

      const arrayBuffer = await res.arrayBuffer();
      if (controller.signal.aborted) return;

      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      if (controller.signal.aborted) return;

      if (bufferCache.size >= 100) {
        const oldestKey = bufferCache.keys().next().value;
        if (oldestKey) bufferCache.delete(oldestKey);
      }
      bufferCache.set(cacheKey, decoded);

      playDecodedBuffer(ctx, decoded, settings);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      speakWithBrowserTTS(cleanText, settings, targetLang);
    } finally {
      if (activeAbort === controller) {
        activeAbort = null;
      }
    }
  })();
}

/**
 * Phát âm tiếng Anh (mặc định dùng giọng gốc trình duyệt; dùng MP3 + Boost nếu người dùng bật boostEnabled)
 */
export function speakWord(
  text: string,
  customOptions?: Partial<TtsSettings> & { lang?: SpeechLang }
): void {
  if (typeof window === "undefined") return;
  const cleanText = text.trim();
  if (!cleanText) return;

  stopSpeaking();

  const settings = {
    ...getTtsSettings(),
    ...customOptions,
  };
  const targetLang: SpeechLang = customOptions?.lang ?? settings.accent;

  if (targetLang.toLowerCase().startsWith("vi")) {
    speakVietnamese(cleanText, customOptions);
    return;
  }

  // Mặc định dùng giọng gốc trình duyệt để giữ nguyên chất âm & accent đã chọn
  if (!settings.boostEnabled) {
    speakWithBrowserTTS(cleanText, settings, targetLang);
    return;
  }

  playViaTtsApi(cleanText, targetLang, settings);
}

/**
 * Phát âm nghĩa tiếng Việt (theo giọng vi-VN đã chọn hoặc Google Tiếng Việt)
 */
export function speakVietnamese(text: string, customOptions?: Partial<TtsSettings>): void {
  if (typeof window === "undefined") return;
  const cleanText = text.trim();
  if (!cleanText) return;

  stopSpeaking();

  const settings = {
    ...getTtsSettings(),
    ...customOptions,
  };

  if (settings.viVoiceURI === GOOGLE_VI_VOICE_ID) {
    playViaTtsApi(cleanText, "vi", settings);
    return;
  }

  const allVoices = "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
  const viVoice = findMatchingVietnameseVoice(allVoices, settings.viVoiceURI);

  // Nếu máy có giọng vi-VN và không ép dùng Boost MP3 -> đọc bằng giọng vi-VN tự nhiên của máy
  if (viVoice && !settings.boostEnabled) {
    speakWithBrowserTTS(cleanText, settings, "vi");
    return;
  }

  // Dự phòng hoặc khi bật Boost -> dùng Google Tiếng Việt qua /api/tts
  playViaTtsApi(cleanText, "vi", settings);
}

/**
 * Dừng phát âm ngay lập tức
 */
export function stopSpeaking(): void {
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
  if (activeSource) {
    try {
      activeSource.stop();
      activeSource.disconnect();
    } catch {
      // ignore
    }
    activeSource = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}
