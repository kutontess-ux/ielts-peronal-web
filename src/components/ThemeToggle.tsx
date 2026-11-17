"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

export default function ThemeToggle({ variant = "switch" }: { variant?: "icon" | "switch" }) {
  const { theme, setTheme, toggleTheme } = useTheme();

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className="rounded-xl border border-line bg-card p-2 text-muted transition hover:text-ink"
        aria-label={theme === "dark" ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
        title={theme === "dark" ? "Chế độ sáng" : "Chế độ tối"}
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Chế độ giao diện"
      className="flex items-center gap-1 rounded-xl border border-line bg-card p-1 text-xs font-semibold"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 transition ${
          theme === "light" ? "bg-brand text-white shadow-sm" : "text-muted hover:text-ink"
        }`}
      >
        <Sun size={14} strokeWidth={1.8} /> Sáng
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 transition ${
          theme === "dark" ? "bg-brand text-white shadow-sm" : "text-muted hover:text-ink"
        }`}
      >
        <Moon size={14} strokeWidth={1.8} /> Tối
      </button>
    </div>
  );
}
