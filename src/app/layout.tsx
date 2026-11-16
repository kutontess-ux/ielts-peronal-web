import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import ActivityMonitor from "@/components/ActivityMonitor";

// Outfit: font hình học miễn phí, gần giống Hurme Geometric Sans No.2 của Quizlet
const outfit = Outfit({
  variable: "--font-main",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "IELTS Personal – Học IELTS cá nhân hoá",
  description: "Web học IELTS Academic cá nhân hoá: từ vựng, reading, writing",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "IELTS Personal",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a092d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${outfit.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col md:flex-row">
        <Suspense fallback={<aside className="hidden w-64 shrink-0 border-r border-line bg-bg md:flex" />}>
          <Sidebar />
        </Suspense>
        <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 md:px-10 md:py-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
        <ActivityMonitor />
      </body>
    </html>
  );
}
