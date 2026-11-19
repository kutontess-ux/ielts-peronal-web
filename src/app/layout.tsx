import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import ActivityMonitor from "@/components/ActivityMonitor";
import SwRegistrar from "@/components/SwRegistrar";

// Outfit: font hình học miễn phí, gần giống Hurme Geometric Sans No.2 của Quizlet
const outfit = Outfit({
  variable: "--font-main",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "LonTonVocab – Học IELTS cá nhân hoá",
  description: "Web học IELTS Academic cá nhân hoá: từ vựng, reading, writing",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LonTonVocab",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f0f2f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a092d" },
  ],
  width: "device-width",
  initialScale: 1,
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("ielts_theme_v1");var d=t==="light"?"light":"dark";var r=document.documentElement;r.classList.toggle("dark",d==="dark");r.classList.toggle("light",d==="light");r.setAttribute("data-theme",d);r.style.colorScheme=d;var c=d==="light"?"#f0f2f8":"#0a092d";document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",c);});}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" data-theme="dark" className={`${outfit.variable} dark min-h-dvh antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col overflow-x-clip md:flex-row">
        <Suspense fallback={<aside className="hidden w-64 shrink-0 border-r border-line bg-bg md:flex" />}>
          <Sidebar />
        </Suspense>
        <main className="w-full min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 md:px-10 md:py-8">
          <div className="mx-auto w-full min-w-0 max-w-5xl">{children}</div>
        </main>
        <ActivityMonitor />
        <SwRegistrar />
      </body>
    </html>
  );
}
