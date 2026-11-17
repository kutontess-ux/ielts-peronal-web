// Sự kiện đồng bộ số từ cần ôn & trạng thái đã xem thông báo giữa các trang và Sidebar
export const DUE_EVENT = "ielts-due-updated";
export const NOTIF_SEEN_EVENT = "ielts-notif-seen";
const NOTIF_SEEN_KEY = "ielts_notif_seen_date_v1";

export function notifyDueUpdated(dueCount?: number) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DUE_EVENT, { detail: { dueCount } }));
  }
}

function getLocalDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isNotifSeenToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(NOTIF_SEEN_KEY) === getLocalDateKey();
  } catch {
    return false;
  }
}

export function markNotifSeenToday(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIF_SEEN_KEY, getLocalDateKey());
  } catch {
    // bỏ qua nếu trình duyệt chặn storage
  }
  window.dispatchEvent(new CustomEvent(NOTIF_SEEN_EVENT));
}
