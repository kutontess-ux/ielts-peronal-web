import { NextResponse } from "next/server";
import { requireAuth, type UserProfile } from "@/lib/supabase-server";
import { getAiUsageToday } from "@/lib/ai-quota";
import { parsePresetAvatar } from "@/lib/avatar-presets";

const MAX_DATA_URL_LENGTH = 260_000;
const MAX_HTTP_URL_LENGTH = 500;

function getGoogleAvatarUrl(userMetadata: unknown): string | null {
  const meta = (userMetadata ?? {}) as Record<string, unknown>;
  const raw = meta.avatar_url ?? meta.picture;
  return typeof raw === "string" && raw.trim().startsWith("https://") ? raw.trim() : null;
}

function validateAvatarUrl(
  raw: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "Định dạng ảnh đại diện không hợp lệ." };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (parsePresetAvatar(trimmed)) {
    return { ok: true, value: trimmed };
  }
  if (trimmed.startsWith("https://")) {
    if (trimmed.length > MAX_HTTP_URL_LENGTH) {
      return { ok: false, error: "Link ảnh đại diện quá dài (tối đa 500 ký tự)." };
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "https:") {
        return { ok: false, error: "Link ảnh đại diện phải dùng giao thức https://." };
      }
      return { ok: true, value: trimmed };
    } catch {
      return { ok: false, error: "Link ảnh đại diện không hợp lệ." };
    }
  }
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    if (trimmed.length > MAX_DATA_URL_LENGTH) {
      return { ok: false, error: "Ảnh tải lên quá lớn. Vui lòng chọn ảnh nhỏ hơn." };
    }
    return { ok: true, value: trimmed };
  }
  return {
    ok: false,
    error: "Ảnh đại diện chỉ hỗ trợ preset có sẵn, link https:// hoặc ảnh PNG/JPG/WebP.",
  };
}

export async function GET() {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  const { ctx } = auth;
  const aiUsage = await getAiUsageToday(ctx);

  return NextResponse.json({
    profile: ctx.profile,
    isAdmin: ctx.isAdmin,
    aiUsage,
    googleAvatarUrl: getGoogleAvatarUrl(ctx.user.user_metadata),
  });
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;

    const { ctx } = auth;
    const body = (await req.json().catch(() => ({}))) as {
      full_name?: unknown;
      avatar_url?: unknown;
    };

    const patch: {
      full_name?: string;
      avatar_url?: string | null;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (body.full_name !== undefined) {
      if (typeof body.full_name !== "string") {
        return NextResponse.json({ error: "Tên hiển thị không hợp lệ." }, { status: 400 });
      }
      const cleanedName = body.full_name.trim().replace(/\s+/g, " ");
      if (cleanedName.length < 1 || cleanedName.length > 80) {
        return NextResponse.json(
          { error: "Tên hiển thị phải từ 1 đến 80 ký tự." },
          { status: 400 }
        );
      }
      patch.full_name = cleanedName;
    }

    if (body.avatar_url !== undefined) {
      const checked = validateAvatarUrl(body.avatar_url);
      if (!checked.ok) {
        return NextResponse.json({ error: checked.error }, { status: 400 });
      }
      patch.avatar_url = checked.value;
    }

    if (patch.full_name === undefined && patch.avatar_url === undefined) {
      return NextResponse.json({ error: "Không có thay đổi nào để lưu." }, { status: 400 });
    }

    const { data: updated, error } = await ctx.db
      .from("profiles")
      .update(patch)
      .eq("id", ctx.user.id)
      .select("id,email,full_name,avatar_url,role,is_active,daily_ai_limit,created_at")
      .single();

    if (error || !updated) {
      throw new Error(error?.message || "Không cập nhật được hồ sơ tài khoản.");
    }

    const aiUsage = await getAiUsageToday(ctx);

    return NextResponse.json({
      profile: updated as UserProfile,
      isAdmin: ctx.isAdmin,
      aiUsage,
      googleAvatarUrl: getGoogleAvatarUrl(ctx.user.user_metadata),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
