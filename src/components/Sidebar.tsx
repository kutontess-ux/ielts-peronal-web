"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell, BookOpen, Home, Layers, Menu, Newspaper, Package, PenLine, Repeat, Target, X,
  type LucideIcon,
} from "lucide-react";
import { DUE_EVENT } from "@/lib/due-events";
import ThemeToggle from "@/components/ThemeToggle";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: number; soon?: boolean };

const SKILLS: Item[] = [
  { href: "/reading", label: "Reading", icon: BookOpen },
  { href: "/writing", label: "Writing", icon: PenLine, soon: true },
];

function NavLink({
  item,
  path,
  onClick,
}: {
  item: Item;
  path: string;
  onClick?: () => void;
}) {
  const active = item.exact ? path === item.href : path.startsWith(item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-card text-ink shadow-xs dark:shadow-none" : "text-muted hover:bg-card/60 hover:text-ink"
      } ${item.soon ? "opacity-60" : ""}`}
    >
      <Icon size={19} strokeWidth={1.6} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && item.badge > 0 ? (
        <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">{item.badge}</span>
      ) : null}
      {item.soon && <span className="rounded bg-line px-1.5 py-0.5 text-[10px] uppercase">sắp có</span>}
    </Link>
  );
}

export default function Sidebar() {
  const path = usePathname();
  const [dueCount, setDueCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchDue = async () => {
      try {
        const r = await fetch("/api/reviews", { cache: "no-store" });
        if (r.ok && active) {
          const j = await r.json();
          setDueCount(j.dueCount ?? 0);
        }
      } catch {
        // bỏ qua lỗi mạng tạm thời
      }
    };
    fetchDue();
    const onDueEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ dueCount?: number }>).detail;
      if (typeof detail?.dueCount === "number") {
        setDueCount(detail.dueCount);
        return;
      }
      void fetchDue();
    };
    window.addEventListener(DUE_EVENT, onDueEvent);
    return () => {
      active = false;
      window.removeEventListener(DUE_EVENT, onDueEvent);
    };
  }, [path]);

  const MAIN: Item[] = [
    { href: "/", label: "Trang chủ", icon: Home, exact: true },
    { href: "/notifications", label: "Thông báo", icon: Bell, badge: dueCount },
  ];

  const LIBRARY: Item[] = [
    { href: "/vocab", label: "Thẻ ghi nhớ", icon: Layers, exact: true },
    { href: "/vocab/review", label: "Ôn tập ngắt quãng", icon: Repeat, badge: dueCount },
    { href: "/vocab/bank", label: "Kho từ vựng", icon: Package },
    { href: "/vocab/daily", label: "Từ hằng ngày", icon: Newspaper },
  ];

  const MOBILE_TABS: Item[] = [
    { href: "/", label: "Trang chủ", icon: Home, exact: true },
    { href: "/vocab", label: "Thẻ nhớ", icon: Layers, exact: true },
    { href: "/vocab/review", label: "Ôn tập", icon: Repeat, badge: dueCount },
    { href: "/vocab/bank", label: "Kho từ", icon: Package },
    { href: "/reading", label: "Reading", icon: BookOpen },
  ];

  return (
    <>
      {/* Header trên điện thoại */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/" className="text-lg font-bold tracking-tight">
          IELTS <span className="text-brand-hover">Personal</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle variant="icon" />
          <Link
            href="/notifications"
            className="relative rounded-xl border border-line bg-card p-2 text-muted hover:text-ink"
            aria-label="Thông báo"
          >
            <Bell size={18} />
            {dueCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-brand px-1.5 py-0.2 text-[10px] font-bold text-white">
                {dueCount}
              </span>
            )}
          </Link>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-xl border border-line bg-card p-2 text-muted hover:text-ink"
            aria-label="Mở menu"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* Drawer menu đầy đủ trên điện thoại */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/70" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative z-10 flex h-full w-72 flex-col gap-1 overflow-y-auto border-r border-line bg-bg p-4">
            <div className="mb-3 flex items-center justify-between px-2">
              <span className="text-lg font-bold">
                IELTS <span className="text-brand-hover">Personal</span>
              </span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-card hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            {MAIN.map((i) => (
              <NavLink key={i.href} item={i} path={path} onClick={() => setMobileMenuOpen(false)} />
            ))}
            <div className="my-2 border-t border-line" />
            <div className="px-3 pb-1 text-xs font-semibold text-muted">Từ vựng</div>
            {LIBRARY.map((i) => (
              <NavLink key={i.href} item={i} path={path} onClick={() => setMobileMenuOpen(false)} />
            ))}
            <div className="my-2 border-t border-line" />
            <div className="px-3 pb-1 text-xs font-semibold text-muted">Kỹ năng</div>
            {SKILLS.map((i) => (
              <NavLink key={i.href} item={i} path={path} onClick={() => setMobileMenuOpen(false)} />
            ))}
            <div className="mt-auto space-y-2 pt-3">
              <ThemeToggle variant="switch" />
            </div>
          </div>
        </div>
      )}

      {/* Thanh điều hướng dưới cùng trên điện thoại */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg/95 px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        {MOBILE_TABS.map((tab) => {
          const active = tab.exact ? path === tab.href : path.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1 text-[11px] font-semibold transition ${
                active ? "text-brand-hover" : "text-muted"
              }`}
            >
              <div className="relative">
                <Icon size={19} strokeWidth={active ? 2 : 1.6} />
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -right-2.5 -top-1 rounded-full bg-brand px-1.5 text-[9px] font-bold text-white">
                    {tab.badge}
                  </span>
                ) : null}
              </div>
              <span className="max-w-full truncate">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Sidebar cố định trên PC */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-bg p-3 md:flex">
        <Link href="/" className="mb-3 px-3 py-2 text-xl font-bold tracking-tight">
          IELTS <span className="text-brand-hover">Personal</span>
        </Link>
        {MAIN.map((i) => <NavLink key={i.href} item={i} path={path} />)}

        <div className="my-3 border-t border-line" />
        <div className="px-3 pb-1 text-xs font-semibold text-muted">Từ vựng</div>
        {LIBRARY.map((i) => <NavLink key={i.href} item={i} path={path} />)}

        <div className="my-3 border-t border-line" />
        <div className="px-3 pb-1 text-xs font-semibold text-muted">Kỹ năng</div>
        {SKILLS.map((i) => <NavLink key={i.href} item={i} path={path} />)}

        <div className="mt-auto space-y-2.5 pt-3">
          <ThemeToggle variant="switch" />
          <div className="rounded-xl border border-line/60 bg-card p-3 text-xs text-muted dark:border-transparent">
            <div className="mb-1 flex items-center gap-2 font-bold text-ink">
              <Target size={16} strokeWidth={1.75} /> Mục tiêu: Band 6.5
            </div>
            IELTS Academic
          </div>
        </div>
      </aside>
    </>
  );
}
