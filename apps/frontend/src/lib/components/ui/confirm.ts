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
  // Opt-in mail notification: renders a checkbox with this label
  // (moderation actions), checked by default — uncheck to stay silent. The
  // choice rides back in the result.
  notify?: { label: string; checked?: boolean };
};

export type ConfirmResult = {
  ok: boolean;
  // The notify checkbox state. Always false when no `notify` option was given.
  notify: boolean;
};

export type ConfirmRequest = ConfirmOptions & {
  resolve: (value: ConfirmResult) => void;
};

export const confirmRequest = writable<ConfirmRequest | null>(null);

// Opens the global confirm dialog and resolves to the user's choice. Drop-in
// for `if ((await confirm({ description })).ok) { … }`.
export function confirm(options: ConfirmOptions): Promise<ConfirmResult> {
  return new Promise((resolve) => {
    confirmRequest.set({ ...options, resolve });
  });
}
