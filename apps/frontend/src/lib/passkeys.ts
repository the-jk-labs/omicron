// SPDX-License-Identifier: AGPL-3.0-or-later
import { authClient } from "#lib/auth-client.js";

type AuthError = { code?: string; message?: string } | null | undefined;

export const passkeysSupported = () =>
  typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";

/** The message for a failed passkey sign-in, or null when the reader just cancelled it. */
export function passkeySignInError(error: AuthError): string | null {
  const code = error?.code ?? "";
  if (code === "AUTH_CANCELLED" || code.startsWith("ERROR_")) return null;
  if (code === "PASSKEY_NOT_FOUND") return "That passkey isn't registered here. It may have been removed.";
  if (code === "AUTHENTICATION_FAILED") return "That passkey couldn't be verified. Try again.";
  return error?.message || "Passkey sign-in failed.";
}

/** The message for a failed passkey registration. */
export function addPasskeyError(error: AuthError): string {
  const code = error?.code ?? "";
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED")
    return "This device already has a passkey for your account.";
  if (code === "ERROR_CEREMONY_ABORTED" || code === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY") {
    return "Passkey setup was cancelled or timed out.";
  }
  return error?.message || "Could not add the passkey.";
}

/** Adding a sign-in method needs a session started within the last day. */
export const needsFreshSignIn = (error: AuthError) => error?.code === "SESSION_NOT_FRESH";

/**
 * Re-checks the reader's password by signing in again, which starts a fresh
 * session, then revokes the old one so it doesn't linger beside it. Resolves to
 * an error message, or null on success.
 */
export async function confirmPassword(username: string, password: string): Promise<string | null> {
  const previous = (await authClient.getSession().catch(() => null))?.data?.session.token;
  const res = await authClient.signIn.username({ username, password });
  if (res.error) {
    const code = (res.error as { code?: string }).code;
    return code === "INVALID_USERNAME_OR_PASSWORD" ? "Incorrect password." : res.error.message || "Incorrect password.";
  }
  if (previous) await authClient.revokeSession({ token: previous }).catch(() => {});
  return null;
}

/**
 * Tells the reader's password manager that a passkey no longer exists here, so
 * it can hide or delete its copy (WebAuthn Signal API, Chromium 132+). The
 * manager decides what to do with it; elsewhere this does nothing.
 */
export async function signalPasskeyGone(credentialId: string): Promise<void> {
  if (typeof globalThis.PublicKeyCredential?.signalUnknownCredential !== "function") return;
  try {
    // The server binds passkeys to the domain the page is on (see auth/auth.ts).
    await PublicKeyCredential.signalUnknownCredential({ rpId: location.hostname, credentialId });
  } catch {
    // Best effort: the passkey is gone on the server either way.
  }
}

/**
 * Passkey sign-in. When the server no longer knows the passkey the reader picked
 * (removed in Settings, or by an email-change undo), their password manager is
 * told so it stops offering it.
 */
export async function passkeySignIn(options: { autoFill?: boolean } = {}) {
  const res = await authClient.signIn.passkey({ ...options, returnWebAuthnResponse: true });
  const used = (res as { webauthn?: { response?: { id?: string } } } | undefined)?.webauthn?.response?.id;
  const code = (res?.error as { code?: string } | null | undefined)?.code;
  if (code === "PASSKEY_NOT_FOUND" && used) await signalPasskeyGone(used);
  return res;
}

/**
 * Arms browser autofill (conditional UI): the password manager offers saved
 * passkeys on any `autocomplete="… webauthn"` field. Resolves true once the
 * reader signed in with one; a new passkey ceremony anywhere aborts this one.
 */
export async function passkeyAutofill(): Promise<boolean> {
  if (!passkeysSupported() || !(await PublicKeyCredential.isConditionalMediationAvailable?.())) return false;
  const res = await passkeySignIn({ autoFill: true });
  return !!res?.data && !res.error;
}
