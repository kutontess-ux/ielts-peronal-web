"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push-client";

function playNotificationChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    // Chuông 2 nốt nhẹ nhàng (C6 -> E6)
    playTone(1046.5, now, 0.16);
    playTone(1318.5, now + 0.12, 0.24);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 600);
  } catch {
    // Trình duyệt chặn autoplay audio nếu chưa tương tác
  }
}

export default function SwRegistrar() {
  useEffect(() => {
    registerServiceWorker().catch(() => {});

    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_RECEIVED") {
        playNotificationChime();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
