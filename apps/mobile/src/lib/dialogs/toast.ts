import { createStore } from "@/lib/store";

export type Toast = { id: number; message: string; tone: "default" | "error" };

export const toasts = createStore<Toast[]>([]);
let nextId = 1;
const DURATION_MS = 3200;

function dismiss(id: number) {
  toasts.set((current) => current.filter((item) => item.id !== id));
}

/** Shows a short message above the tab bar. Errors stay a little longer. */
export function toast(message: string, tone: Toast["tone"] = "default") {
  const id = nextId++;
  toasts.set((current) => [...current.slice(-2), { id, message, tone }]);
  setTimeout(() => dismiss(id), tone === "error" ? DURATION_MS * 1.5 : DURATION_MS);
}
