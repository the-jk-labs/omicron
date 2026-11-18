// SPDX-License-Identifier: AGPL-3.0-or-later
import { renderSVG } from "uqr";

// Authenticator-app (TOTP) setup helpers shared by Settings and the moderation gate.

/** The setup URI as a QR code, always dark on light so every camera can read it. */
export function totpQrSvg(totpURI: string): string {
  return renderSVG(totpURI, { border: 2, whiteColor: "#ffffff", blackColor: "#000000" });
}

/** The key inside the setup URI, in groups of four, for typing into an app by hand. */
export function totpKey(totpURI: string): string {
  const secret = URL.canParse(totpURI) ? (new URL(totpURI).searchParams.get("secret") ?? "") : "";
  return (
    secret
      .replace(/=+$/, "")
      .match(/.{1,4}/g)
      ?.join(" ") ?? ""
  );
}

/** What a typed code becomes: digits only, at most six. */
export const totpDigits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

/** A backup code as typed: letters, digits and its dash, nothing else. */
export const backupCodeInput = (value: string) => value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 32);

type AuthError = { code?: string; message?: string; status?: number };

/** A refused second step, in words. */
export function twoFactorError(error: AuthError | null | undefined): string {
  switch (error?.code) {
    case "INVALID_CODE":
      return "That code didn't work. Check your authenticator app and try again.";
    case "INVALID_BACKUP_CODE":
      return "That backup code didn't work, or it was already used.";
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "Too many wrong codes. Wait a few minutes, then sign in again.";
    case "INVALID_TWO_FACTOR_COOKIE":
      return "This sign-in took too long. Enter your password again.";
    case "INVALID_PASSWORD":
      return "That password isn't right.";
    case "BACKUP_CODES_NOT_FOR_STAFF":
      return "Moderators and admins can't use backup codes. Ask an admin to reset your two-factor authentication.";
    default:
      return error?.message || "Something went wrong. Try again.";
  }
}
