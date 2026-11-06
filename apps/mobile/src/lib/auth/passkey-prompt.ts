import { storage } from "@/lib/storage";

// Ported from apps/frontend/src/lib/passkeyPrompt.ts: the offer shows once per sign-in, per instance.
const key = (origin: string) => `passkey-prompt-dismissed:${origin}`;

export const passkeyPromptDismissed = (origin: string) => storage.getString(key(origin)) === "1";
export const dismissPasskeyPrompt = (origin: string) => storage.set(key(origin), "1");
export const resetPasskeyPrompt = (origin: string) => storage.remove(key(origin));

const SESSION_CHANGE = /\/(sign-in\/[^/]+|sign-up\/[^/]+|sign-out|verify-email|passkey\/verify-authentication)$/;

/** Whether a Better Auth endpoint URL starts or ends a session. */
export function changesSession(url: string | URL): boolean {
  return SESSION_CHANGE.test(new URL(url, "http://localhost").pathname);
}
