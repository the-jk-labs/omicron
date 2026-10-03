// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test, vi } from "vitest";
import {
  addPasskeyError,
  confirmPassword,
  needsFreshSignIn,
  passkeyAutofill,
  passkeySignInError,
} from "#lib/passkeys.js";

type Res = { data?: unknown; error?: { code?: string; message?: string } | null };
const signIn = vi.hoisted(() => vi.fn<(a: unknown) => Promise<Res>>());
const auth = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<Res>>(),
  username: vi.fn<(a: unknown) => Promise<Res>>(),
  revoke: vi.fn<(a: unknown) => Promise<Res>>(),
}));
vi.mock("#lib/auth-client.js", () => ({
  authClient: {
    signIn: { passkey: signIn, username: auth.username },
    getSession: auth.getSession,
    revokeSession: auth.revoke,
  },
}));

function stubWebAuthn(conditional: boolean) {
  vi.stubGlobal(
    "PublicKeyCredential",
    Object.assign(function PublicKeyCredential() {}, {
      isConditionalMediationAvailable: () => Promise.resolve(conditional),
    }),
  );
}

test("a cancelled sign-in says nothing; a server refusal is explained", () => {
  expect(passkeySignInError({ code: "AUTH_CANCELLED" })).toBeNull();
  expect(passkeySignInError({ code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY" })).toBeNull();
  expect(passkeySignInError({ code: "PASSKEY_NOT_FOUND" })).toMatch(/isn't registered here/);
  expect(passkeySignInError({ message: "This account has been suspended." })).toBe("This account has been suspended.");
  expect(passkeySignInError(null)).toBe("Passkey sign-in failed.");
});

test("registration errors read as plain English", () => {
  expect(addPasskeyError({ code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" })).toBe(
    "This device already has a passkey for your account.",
  );
  expect(addPasskeyError({ code: "ERROR_CEREMONY_ABORTED" })).toBe("Passkey setup was cancelled or timed out.");
  expect(addPasskeyError({ message: "Boom" })).toBe("Boom");
  expect(needsFreshSignIn({ code: "SESSION_NOT_FRESH" })).toBe(true);
});

test("autofill is skipped where the browser has no passkeys", async () => {
  expect(await passkeyAutofill()).toBe(false);
  stubWebAuthn(false);
  expect(await passkeyAutofill()).toBe(false);
  expect(signIn).not.toHaveBeenCalled();
});

test("autofill resolves true once the reader picks a passkey", async () => {
  stubWebAuthn(true);
  signIn.mockResolvedValue({ data: { user: {} }, error: null });
  expect(await passkeyAutofill()).toBe(true);
  expect(signIn).toHaveBeenCalledWith({ autoFill: true });

  signIn.mockResolvedValue({ data: null, error: { code: "AUTH_CANCELLED" } });
  expect(await passkeyAutofill()).toBe(false);
});

describe("confirmPassword", () => {
  test("signs in again, then revokes the session it replaced", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { token: "old" } }, error: null });
    auth.username.mockResolvedValue({ data: {}, error: null });
    auth.revoke.mockResolvedValue({ data: {}, error: null });
    expect(await confirmPassword("ada", "secret")).toBeNull();
    expect(auth.username).toHaveBeenCalledWith({ username: "ada", password: "secret" });
    expect(auth.revoke).toHaveBeenCalledWith({ token: "old" });
  });

  test("a wrong password keeps the current session", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { token: "old" } }, error: null });
    auth.username.mockResolvedValue({
      data: null,
      error: { code: "INVALID_USERNAME_OR_PASSWORD", message: "Invalid" },
    });
    expect(await confirmPassword("ada", "nope")).toBe("Incorrect password.");
    expect(auth.revoke).not.toHaveBeenCalled();
  });

  test("other refusals pass their message through", async () => {
    auth.getSession.mockResolvedValue({ data: null, error: null });
    auth.username.mockResolvedValue({ data: null, error: { message: "Too many requests." } });
    expect(await confirmPassword("ada", "secret")).toBe("Too many requests.");
  });

  test("a failed revoke doesn't undo the confirmation", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { token: "old" } }, error: null });
    auth.username.mockResolvedValue({ data: {}, error: null });
    auth.revoke.mockRejectedValue(new Error("offline"));
    expect(await confirmPassword("ada", "secret")).toBeNull();
  });
});
