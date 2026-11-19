import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/web-push";

export const dynamic = "force-dynamic";

type SubscribeBody = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

function isMissingTableError(msg: string | undefined): boolean {
  const m = (msg ?? "").toLowerCase();
  return m.includes("push_subscriptions") && (m.includes("does not exist") || m.includes("schema cache"));
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const configured = isWebPushConfigured();
    const publicKey = getVapidPublicKey();

    const { count, error } = await ctx.db
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.user.id);

    if (error) {
      if (isMissingTableError(error.message)) {
        return NextResponse.json({
          configured,
          publicKey,
          subscriptionCount: 0,
          tableMissing: true,
        });
      }
      throw new Error(error.message);
    }

    return NextResponse.json({
      configured,
      publicKey,
      subscriptionCount: count ?? 0,
      tableMissing: false,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const body = (await req.json().catch(() => ({}))) as SubscribeBody;
    const endpoint = String(body.endpoint ?? "").trim();
    const p256dh = String(body.keys?.p256dh ?? "").trim();
    const authKey = String(body.keys?.auth ?? "").trim();

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json(
        { error: "Thiếu thông tin PushSubscription (endpoint / keys)." },
        { status: 400 }
      );
    }

    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 300) || null;
    const { error } = await ctx.db.from("push_subscriptions").upsert(
      {
        user_id: ctx.user.id,
        endpoint,
        p256dh,
        auth: authKey,
        user_agent: userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      if (isMissingTableError(error.message)) {
        return NextResponse.json(
          {
            error:
              "Chưa có bảng push_subscriptions trên Supabase. Hãy chạy file migration 20261123_push_subscriptions.sql trong SQL Editor.",
          },
          { status: 500 }
        );
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
    const endpoint = String(body.endpoint ?? "").trim();

    let q = ctx.db.from("push_subscriptions").delete().eq("user_id", ctx.user.id);
    if (endpoint) {
      q = q.eq("endpoint", endpoint);
    }
    const { error } = await q;
    if (error && !isMissingTableError(error.message)) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
