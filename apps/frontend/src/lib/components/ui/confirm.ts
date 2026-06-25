// SPDX-License-Identifier: AGPL-3.0-or-later
import { writable } from "svelte/store";

// A promise-based replacement for the browser's blocking `confirm()`. A single
// ConfirmDialog host (mounted in the root layout) renders the Bits UI
// AlertDialog and resolves the pending promise when the user answers.

export type ConfirmOptions = {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  // Style the confirm button as a destructive action (delete, etc.).
  destructive?: boolean;
};

export type ConfirmRequest = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

export const confirmRequest = writable<ConfirmRequest | null>(null);

// Opens the global confirm dialog and resolves to the user's choice. Drop-in
// for `if (await confirm({ description })) { … }`.
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmRequest.set({ ...options, resolve });
  });
}
