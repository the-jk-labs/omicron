// SPDX-License-Identifier: AGPL-3.0-or-later

type AuthError = { code?: string; message?: string } | null | undefined;

/** The server wants the password re-checked first (the session is too old). */
export const needsPassword = (error: AuthError) => error?.code === "PASSWORD_REQUIRED";

/** Plain-English text for a refused change-email step. */
export function emailChangeError(error: AuthError): string {
  switch (error?.code) {
    case "INVALID_OTP":
      return "That code isn't right. Check it and try again.";
    case "OTP_EXPIRED":
      return "That code has expired. Send a new one.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many wrong tries. Send a new code.";
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
    default:
      return error?.message || "Something went wrong. Try again.";
  }
}

/**
 * Tells the browser's own password manager that the saved login for this site
 * now uses the new email. Chromium only (the Credential Management API); other
 * managers pick it up from the dialog's form instead.
 */
export async function rememberNewLogin(email: string, password: string, name: string): Promise<void> {
  const Credential = (globalThis as { PasswordCredential?: new (data: object) => Credential }).PasswordCredential;
  if (!Credential || !navigator.credentials?.store) return;
  try {
    await navigator.credentials.store(new Credential({ id: email, password, name }));
  } catch {
    // The browser may refuse (no user gesture, setting off); the change itself is done.
  }
}
