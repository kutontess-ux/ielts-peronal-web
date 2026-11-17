import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase";
import { autoClaimLegacyIfAny } from "@/lib/legacy-claim";

let legacyCheckedForAdmin = false;

export type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: "admin" | "member";
  is_active: boolean;
  daily_ai_limit: number;
  created_at: string;
};

export type AuthContext = {
  user: User;
  profile: UserProfile;
  isAdmin: boolean;
  db: ReturnType<typeof supabaseAdmin>;
};

export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, anonKey };
}

function getAdminEmailSet(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function createSupabaseServerClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  if (!url || !anonKey) {
    throw new Error(
      "Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Có thể bỏ qua khi gọi từ Server Component chỉ đọc
        }
      },
    },
  });
}

async function ensureProfile(
  db: ReturnType<typeof supabaseAdmin>,
  user: User
): Promise<UserProfile> {
  const email = (user.email ?? "").trim().toLowerCase();
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = String(meta.full_name ?? meta.name ?? email.split("@")[0] ?? "User").trim();
  const avatarUrl = typeof meta.avatar_url === "string" ? meta.avatar_url : null;

  const { data: existing, error: readErr } = await db
    .from("profiles")
    .select("id,email,full_name,avatar_url,role,is_active,daily_ai_limit,created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (readErr) {
    throw new Error(`Lỗi đọc bảng public.profiles: ${readErr.message}`);
  }

  const adminEmails = getAdminEmailSet();
  const isListedAdmin = Boolean(email && adminEmails.has(email));

  if (existing) {
    // Nếu email mới được thêm vào ADMIN_EMAILS hoặc tên/avatar thay đổi thì đồng bộ nhẹ
    const needsAdminSync = isListedAdmin && existing.role !== "admin";
    if (needsAdminSync || existing.full_name !== fullName || existing.avatar_url !== avatarUrl) {
      const nextRole = needsAdminSync ? "admin" : (existing.role as "admin" | "member");
      const { data: updated } = await db
        .from("profiles")
        .update({
          email,
          full_name: fullName,
          avatar_url: avatarUrl,
          role: nextRole,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .select("id,email,full_name,avatar_url,role,is_active,daily_ai_limit,created_at")
        .single();
      if (updated) return updated as UserProfile;
    }
    return existing as UserProfile;
  }

  // Nếu chưa cấu hình ADMIN_EMAILS và chưa có hồ sơ nào trong DB, tài khoản đầu tiên tự làm admin
  let defaultRole: "admin" | "member" = isListedAdmin ? "admin" : "member";
  if (!isListedAdmin && adminEmails.size === 0) {
    const { count } = await db
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) === 0) {
      defaultRole = "admin";
    }
  }

  const { data: inserted, error: insErr } = await db
    .from("profiles")
    .insert({
      id: user.id,
      email,
      full_name: fullName,
      avatar_url: avatarUrl,
      role: defaultRole,
      is_active: true,
      daily_ai_limit: 10,
    })
    .select("id,email,full_name,avatar_url,role,is_active,daily_ai_limit,created_at")
    .single();

  if (insErr || !inserted) {
    throw new Error(insErr?.message || "Không tạo được hồ sơ người dùng");
  }
  return inserted as UserProfile;
}

export async function requireAuth(): Promise<
  | { ctx: AuthContext; errorResponse?: never }
  | { ctx?: never; errorResponse: NextResponse }
> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        errorResponse: NextResponse.json(
          { error: "Bạn chưa đăng nhập. Vui lòng đăng nhập bằng Google để tiếp tục." },
          { status: 401 }
        ),
      };
    }

    const db = supabaseAdmin();
    const profile = await ensureProfile(db, user);

    if (!profile.is_active) {
      return {
        errorResponse: NextResponse.json(
          { error: "Tài khoản của bạn đang bị tạm khoá. Hãy liên hệ quản trị viên." },
          { status: 403 }
        ),
      };
    }

    const isAdmin = profile.role === "admin";
    if (isAdmin && !legacyCheckedForAdmin) {
      await autoClaimLegacyIfAny(db, user.id);
      legacyCheckedForAdmin = true;
    }

    return {
      ctx: {
        user,
        profile,
        isAdmin,
        db,
      },
    };
  } catch (e) {
    return {
      errorResponse: NextResponse.json({ error: (e as Error).message }, { status: 500 }),
    };
  }
}

export async function requireAdmin(): Promise<
  | { ctx: AuthContext; errorResponse?: never }
  | { ctx?: never; errorResponse: NextResponse }
> {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth;
  if (!auth.ctx.isAdmin) {
    return {
      errorResponse: NextResponse.json(
        { error: "Chỉ quản trị viên (Admin) mới có quyền thực hiện thao tác này." },
        { status: 403 }
      ),
    };
  }
  return auth;
}
