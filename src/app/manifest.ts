import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LonTonVocab",
    short_name: "LonTonVocab",
    description: "Học từ vựng và phân tích Reading IELTS Academic cá nhân",
    start_url: "/",
    display: "standalone",
    background_color: "#0a092d",
    theme_color: "#4255ff",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
