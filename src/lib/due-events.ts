// Sự kiện đồng bộ số từ cần ôn giữa các trang và Sidebar
export const DUE_EVENT = "ielts-due-updated";

export function notifyDueUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DUE_EVENT));
  }
}
