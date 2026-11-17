"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpenCheck, Loader2, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

function LoginCard() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const initialError = searchParams.get("error") || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const safeNext = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { prompt: "select_account" },
        },
      });
      if (oauthErr) throw oauthErr;
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[75vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-line bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15 text-brand-hover">
          <BookOpenCheck size={28} strokeWidth={1.7} />
        </div>

        <h1 className="mt-5 text-2xl font-bold tracking-tight">
          IELTS <span className="text-brand-hover">Personal</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          Đăng nhập bằng tài khoản Google để lưu tiến độ ôn tập Leitner, học phần Flashcard và bài đọc Reading riêng của bạn.
        </p>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-500/15 px-3.5 py-2.5 text-left text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-line bg-bg px-5 py-3.5 text-sm font-bold text-ink transition hover:border-brand hover:bg-card-hover disabled:opacity-60"
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
          )}
          {loading ? "Đang chuyển hướng tới Google..." : "Tiếp tục với Google"}
        </button>

        <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted">
          <ShieldCheck size={14} className="text-emerald-500" />
          Dữ liệu học tập được tách riêng an toàn cho từng tài khoản
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center text-sm text-muted">
          <Loader2 size={18} className="mr-2 animate-spin" /> Đang tải trang đăng nhập...
        </div>
      }
    >
      <LoginCard />
    </Suspense>
  );
}
