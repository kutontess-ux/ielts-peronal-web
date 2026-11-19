import "server-only";
import webpush from "web-push";

export type StoredPushSubscription = {
  id?: string;
  user_id?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

function getVapidConfig() {
  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = (process.env.VAPID_SUBJECT ?? "mailto:admin@lontonvocab.app").trim();
  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured(): boolean {
  const { publicKey, privateKey } = getVapidConfig();
  return Boolean(publicKey && privateKey);
}

export function getVapidPublicKey(): string | null {
  const { publicKey } = getVapidConfig();
  return publicKey || null;
}

export async function sendPushNotification(
  sub: StoredPushSubscription,
  payload: PushPayload
): Promise<{ ok: true } | { ok: false; expired: boolean; statusCode?: number; error: string }> {
  const { publicKey, privateKey, subject } = getVapidConfig();
  if (!publicKey || !privateKey) {
    return {
      ok: false,
      expired: false,
      error: "Chưa cấu hình NEXT_PUBLIC_VAPID_PUBLIC_KEY hoặc VAPID_PRIVATE_KEY trên server.",
    };
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 12 }
    );
    return { ok: true };
  } catch (err) {
    const e = err as { statusCode?: number; message?: string; body?: string };
    const statusCode = e?.statusCode;
    const expired = statusCode === 404 || statusCode === 410;
    return {
      ok: false,
      expired,
      statusCode,
      error: e?.body || e?.message || "Gửi Web Push thất bại",
    };
  }
}
