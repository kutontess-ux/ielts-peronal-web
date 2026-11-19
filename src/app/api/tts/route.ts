import { NextRequest, NextResponse } from "next/server";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDictionaryAudio(word: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetchWithTimeout(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
      2500
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      phonetics?: Array<{ audio?: string }>;
    }>;
    const audios = data
      .flatMap((entry) => entry.phonetics ?? [])
      .map((p) => p.audio?.trim() ?? "")
      .filter((u) => u.startsWith("http") || u.startsWith("//"));

    if (audios.length === 0) return null;

    // Prefer UK pronunciation if available
    const preferred =
      audios.find((u) => /-uk\.mp3/i.test(u)) ??
      audios.find((u) => /-gb\.mp3/i.test(u)) ??
      audios[0];

    const audioUrl = preferred.startsWith("//") ? `https:${preferred}` : preferred;
    const audioRes = await fetchWithTimeout(audioUrl, 3000);
    if (!audioRes.ok) return null;
    return await audioRes.arrayBuffer();
  } catch {
    return null;
  }
}

async function fetchGoogleTTS(text: string, lang: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
      text
    )}&tl=${encodeURIComponent(lang)}&client=tw-ob`;
    const res = await fetchWithTimeout(url, 3500, {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: "https://translate.google.com/",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("audio")) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const text = (req.nextUrl.searchParams.get("text") ?? "").trim();
  const rawLang = (req.nextUrl.searchParams.get("lang") ?? "en-GB").trim() || "en-GB";
  const lang = rawLang.toLowerCase().startsWith("vi") ? "vi" : rawLang;

  if (!text || text.length > 200) {
    return NextResponse.json({ error: "Invalid text" }, { status: 400 });
  }

  let buffer: ArrayBuffer | null = null;

  // Single English word -> try human dictionary audio first
  if (lang.toLowerCase().startsWith("en") && /^[a-zA-Z][a-zA-Z'-]{0,48}$/.test(text)) {
    buffer = await fetchDictionaryAudio(text);
  }

  // Google TTS supports both en-GB and vi
  if (!buffer) {
    buffer = await fetchGoogleTTS(text, lang);
  }

  if (!buffer || buffer.byteLength === 0) {
    return NextResponse.json({ error: "TTS unavailable" }, { status: 502 });
  }

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
