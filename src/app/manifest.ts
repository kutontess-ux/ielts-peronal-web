import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IELTS Personal",
    short_name: "IELTS App",
    description: "Học từ vựng và phân tích Reading IELTS Academic cá nhân",
    start_url: "/",
    display: "standalone",
    background_color: "#0a092d",
    theme_color: "#4255ff",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
