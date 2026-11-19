"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Bell, BookOpen, Eye, Home, Layers, LogIn, LogOut, Menu, Newspaper, Package, PenLine, Repeat, Shield, Target, X,
  type LucideIcon,
} from "lucide-react";
import {
  DUE_EVENT,
  isNotifSeenToday,
  markNotifSeenToday,
  NOTIF_SEEN_EVENT,
  SETTINGS_EVENT,
} from "@/lib/due-events";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useMe, type MeInfo } from "@/lib/use-me";
import ThemeToggle from "@/components/ThemeToggle";
import { VoiceSettingsButton } from "@/components/VoiceSettingsModal";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: number; soon?: boolean };

const SKILLS: Item[] = [
  { href: "/reading", label: "Reading", icon: BookOpen },
  { href: "/writing", label: "Writing", icon: PenLine },
  { href: "/writing/stats", label: "Thống kê Writing", icon: BarChart3 },
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
  const active = item.exact
    ? path === item.href
    : item.href === "/writing"
    ? path === "/writing" || (path.startsWith("/writing/") && !path.startsWith("/writing/stats"))
    : path.startsWith(item.href);
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
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold leading-none text-white">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      ) : null}
      {item.soon && <span className="rounded bg-line px-1.5 py-0.5 text-[10px] uppercase">sắp có</span>}
    </Link>
  );
}

function UserFooter({
  me,
  meLoaded,
  signingOut,
  previewAsUser,
  onTogglePreview,
  onSignOut,
}: {
  me: MeInfo | null;
  meLoaded: boolean;
  signingOut: boolean;
  previewAsUser: boolean;
  onTogglePreview: () => void;
  onSignOut: () => void;
}) {
  if (!me) {
    if (!meLoaded) return null;
    return (
      <Link
        href="/login"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2.5 text-xs font-bold text-white transition hover:bg-brand-hover hover:text-bg"
      >
        <LogIn size={14} />
        Đăng nhập Google
      </Link>
    );
  }
  const displayName = me.profile.full_name || me.profile.email.split("@")[0] || "Người dùng";
  const quotaText = me.isAdmin
    ? `AI hôm nay: ${me.aiUsage.usedToday} lượt · Không giới hạn`
    : `AI hôm nay: ${me.aiUsage.usedToday}/${me.aiUsage.limit ?? me.profile.daily_ai_limit}`;

  return (
    <div className="rounded-xl border border-line/60 bg-card p-3 text-xs dark:border-transparent">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-bold text-ink">{displayName}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            me.isAdmin
              ? "bg-brand/15 text-brand-hover"
              : "bg-line text-muted"
          }`}
        >
          {me.isAdmin ? "Admin" : "Thành viên"}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-muted">{me.profile.email}</div>
      <div className="mt-1.5 text-[11px] font-medium text-muted">{quotaText}</div>
      {me.isAdmin && (
        <button
          type="button"
          onClick={onTogglePreview}
          className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
            previewAsUser
              ? "border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-300"
              : "border-line bg-bg text-muted hover:border-brand-hover hover:text-ink"
          }`}
        >
          <Eye size={13} />
          {previewAsUser ? "Đang xem kiểu User · Bật lại Admin" : "Xem thử giao diện User"}
        </button>
      )}
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-rose-400/50 hover:text-rose-500 disabled:opacity-50"
      >
        <LogOut size={13} />
        {signingOut ? "Đang đăng xuất..." : "Đăng xuất"}
      </button>
    </div>
  );
}

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const isAuthPage = path.startsWith("/login") || path.startsWith("/auth");
  const [dueCount, setDueCount] = useState(0);
  const [notifSeen, setNotifSeen] = useState(true);
  const [notifyReviewDue, setNotifyReviewDue] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { me, meLoaded, previewAsUser, togglePreviewAsUser, clearMe } = useMe({ skip: isAuthPage });

  // Chỉ cập nhật trạng thái đã xem thông báo khi đổi route
  useEffect(() => {
    if (isAuthPage) return;
    const raf = requestAnimationFrame(() => {
      if (path.startsWith("/notifications")) {
        markNotifSeenToday();
        setNotifSeen(true);
      } else {
        setNotifSeen(isNotifSeenToday());
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [path, isAuthPage]);

  // Fetch số từ đến hạn & cài đặt thông báo (và cập nhật khi có DUE_EVENT / SETTINGS_EVENT)
  useEffect(() => {
    if (isAuthPage) return;
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

    const fetchNotifSetting = async () => {
      try {
        const r = await fetch("/api/settings", { cache: "no-store" });
        if (r.ok && active) {
          const j = await r.json();
          if (typeof j.notify_review_due === "boolean") {
            setNotifyReviewDue(j.notify_review_due);
          }
        }
      } catch {
        // bỏ qua lỗi mạng tạm thời
      }
    };

    void fetchDue();
    void fetchNotifSetting();

    const onDueEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ dueCount?: number }>).detail;
      if (typeof detail?.dueCount === "number") {
        setDueCount(detail.dueCount);
        return;
      }
      void fetchDue();
    };
    const onNotifSeen = () => setNotifSeen(true);
    const onSettingsEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ notify_review_due?: boolean } | undefined>).detail;
      if (typeof detail?.notify_review_due === "boolean") {
        setNotifyReviewDue(detail.notify_review_due);
        return;
      }
      void fetchNotifSetting();
    };

    window.addEventListener(DUE_EVENT, onDueEvent);
    window.addEventListener(NOTIF_SEEN_EVENT, onNotifSeen);
    window.addEventListener(SETTINGS_EVENT, onSettingsEvent);
    return () => {
      active = false;
      window.removeEventListener(DUE_EVENT, onDueEvent);
      window.removeEventListener(NOTIF_SEEN_EVENT, onNotifSeen);
      window.removeEventListener(SETTINGS_EVENT, onSettingsEvent);
    };
  }, [isAuthPage]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // Vẫn điều hướng về /login nếu session local đã hết hạn
    } finally {
      clearMe();
      setDueCount(0);
      setSigningOut(false);
      router.replace("/login");
      router.refresh();
    }
  };

  if (isAuthPage) return null;

  const notifBadge = notifyReviewDue && dueCount > 0 && !notifSeen ? 1 : 0;

  const MAIN: Item[] = [
    { href: "/", label: "Trang chủ", icon: Home, exact: true },
    { href: "/notifications", label: "Thông báo", icon: Bell, badge: notifBadge },
    ...(me?.isAdmin ? [{ href: "/admin", label: "Quản trị", icon: Shield }] : []),
  ];

  const LIBRARY: Item[] = [
    { href: "/vocab", label: "Thẻ ghi nhớ", icon: Layers, exact: true },
    { href: "/vocab/review", label: "Ôn tập", icon: Repeat, badge: dueCount },
    { href: "/vocab/bank", label: "Kho từ vựng", icon: Package },
    { href: "/vocab/daily", label: "Từ hằng ngày", icon: Newspaper },
    { href: "/vocab/stats", label: "Thống kê", icon: BarChart3 },
  ];

  const MOBILE_TABS: Item[] = [
    { href: "/", label: "Trang chủ", icon: Home, exact: true },
    { href: "/vocab", label: "Thẻ nhớ", icon: Layers, exact: true },
    { href: "/vocab/review", label: "Ôn tập", icon: Repeat, badge: dueCount },
    { href: "/reading", label: "Reading", icon: BookOpen },
    { href: "/writing", label: "Writing", icon: PenLine },
  ];

  return (
    <>
      {/* Header trên điện thoại */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/" className="text-lg font-bold tracking-tight">
          IELTS <span className="text-brand-hover">Personal</span>
        </Link>
        <div className="flex items-center gap-2">
          {meLoaded && !me && (
            <Link
              href="/login"
              className="inline-flex items-center gap-1 rounded-xl bg-brand px-2.5 py-1.5 text-xs font-bold text-white"
            >
              <LogIn size={14} /> Đăng nhập
            </Link>
          )}
          <ThemeToggle variant="icon" />
          <VoiceSettingsButton variant="icon" />
          <Link
            href="/notifications"
            className="relative rounded-xl border border-line bg-card p-2 text-muted hover:text-ink"
            aria-label="Thông báo"
          >
            <Bell size={18} />
            {notifBadge > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-bg">
                {notifBadge}
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
            <div className="mt-auto space-y-2.5 pt-3">
              <VoiceSettingsButton className="w-full justify-center" />
              <ThemeToggle variant="switch" />
              <UserFooter
                me={me}
                meLoaded={meLoaded}
                signingOut={signingOut}
                previewAsUser={previewAsUser}
                onTogglePreview={togglePreviewAsUser}
                onSignOut={handleSignOut}
              />
            </div>
          </div>
        </div>
      )}

      {/* Thanh điều hướng dưới cùng trên điện thoại */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid w-full max-w-[100vw] grid-cols-5 border-t border-line bg-bg/95 px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
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
          <VoiceSettingsButton className="w-full justify-center" />
          <ThemeToggle variant="switch" />
          <div className="rounded-xl border border-line/60 bg-card p-3 text-xs text-muted dark:border-transparent">
            <div className="mb-1 flex items-center gap-2 font-bold text-ink">
              <Target size={16} strokeWidth={1.75} /> Mục tiêu: Band 6.5
            </div>
            IELTS Academic
          </div>
          <UserFooter
            me={me}
            meLoaded={meLoaded}
            signingOut={signingOut}
            previewAsUser={previewAsUser}
            onTogglePreview={togglePreviewAsUser}
            onSignOut={handleSignOut}
          />
        </div>
      </aside>
    </>
  );
}
