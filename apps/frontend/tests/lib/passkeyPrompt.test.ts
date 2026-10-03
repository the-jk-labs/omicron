// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test } from "vitest";
import {
  changesSession,
  dismissPasskeyPrompt,
  passkeyPromptDismissed,
  resetPasskeyPrompt,
} from "#lib/passkeyPrompt.js";

beforeEach(() => localStorage.clear());

test("dismissing is remembered in this browser until reset", () => {
  expect(passkeyPromptDismissed()).toBe(false);
  dismissPasskeyPrompt();
  expect(passkeyPromptDismissed()).toBe(true);
  resetPasskeyPrompt();
  expect(passkeyPromptDismissed()).toBe(false);
});

test.each([
  "/api/auth/sign-in/email",
  "/api/auth/sign-in/username",
  "/api/auth/sign-up/email",
  "/api/auth/sign-out",
  "/api/auth/verify-email?token=abc",
  "/api/auth/passkey/verify-authentication",
  "http://blog.example/api/auth/sign-out",
])("%s starts or ends a session", (url) => {
  expect(changesSession(url)).toBe(true);
});

test.each([
  "/api/auth/get-session",
  "/api/auth/passkey/list-user-passkeys",
  "/api/auth/passkey/verify-registration",
  "/api/auth/passkey/generate-authenticate-options",
  "/api/auth/sign-in",
])("%s does not", (url) => {
  expect(changesSession(url)).toBe(false);
});
