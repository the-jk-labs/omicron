// SPDX-License-Identifier: AGPL-3.0-or-later
import { readStorage, writeStorage } from "#lib/storage.js";

// The "add a passkey" offer is shown once per sign-in: declining it parks a flag
// in this browser, and signing in or out clears it so the next session asks again.
const DISMISSED_KEY = "omicron:passkey-prompt-dismissed";

export const passkeyPromptDismissed = () => readStorage(DISMISSED_KEY) === "1";
export const dismissPasskeyPrompt = () => writeStorage(DISMISSED_KEY, "1");
export const resetPasskeyPrompt = () => writeStorage(DISMISSED_KEY, null);

const SESSION_CHANGE = /\/(sign-in\/[^/]+|sign-up\/[^/]+|sign-out|verify-email|passkey\/verify-authentication)$/;

/** Whether a Better Auth endpoint URL starts or ends a session. */
export function changesSession(url: string | URL): boolean {
  return SESSION_CHANGE.test(new URL(url, "http://localhost").pathname);
}
