// Sự kiện đồng bộ số từ cần ôn giữa các trang và Sidebar
export const DUE_EVENT = "ielts-due-updated";

export function notifyDueUpdated(dueCount?: number) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DUE_EVENT, { detail: { dueCount } }));
  }
}
