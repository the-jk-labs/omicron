import { renderSVG } from "uqr";
import type { InstanceAuthClient } from "./auth-client";

// Authenticator-app (TOTP) helpers. Ported from apps/frontend/src/lib/twoFactor.ts; keep the wording identical.

/** The setup URI as a QR code, always dark on light so every camera can read it. */
export function totpQrSvg(totpURI: string): string {
  return renderSVG(totpURI, { border: 2, whiteColor: "#ffffff", blackColor: "#000000" });
}

/** The key inside the setup URI, in groups of four, for typing into an app by hand. */
export function totpKey(totpURI: string): string {
  const secret = /[?&]secret=([^&]+)/.exec(totpURI)?.[1] ?? "";
  return (
    decodeURIComponent(secret)
      .replace(/=+$/, "")
      .match(/.{1,4}/g)
      ?.join(" ") ?? ""
  );
}

/** What a typed code becomes: digits only, at most six. */
export const totpDigits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

/** A backup code as typed: letters, digits and its dash, nothing else. */
export const backupCodeInput = (value: string) => value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 32);

type AuthError = { code?: string; message?: string };

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

/** Whether a sign-in answered with the second step instead of a session. */
export function needsSecondStep(data: unknown): boolean {
  return typeof data === "object" && data !== null && "twoFactorRedirect" in data && data.twoFactorRedirect === true;
}

export type SecondStepResult = "signed-in" | { message: string; expired: boolean };

// Outside components: the React Compiler can't optimise a try/catch holding conditionals.
export async function verifySecondStep(
  auth: InstanceAuthClient,
  code: string,
  backup: boolean,
  onSignedIn: () => Promise<void>,
): Promise<SecondStepResult> {
  try {
    const res = backup ? await auth.twoFactor.verifyBackupCode({ code }) : await auth.twoFactor.verifyTotp({ code });
    if (res.error) {
      return { message: twoFactorError(res.error), expired: res.error.code === "INVALID_TWO_FACTOR_COOKIE" };
    }
    await onSignedIn();
    return "signed-in";
  } catch (err) {
    return { message: err instanceof Error ? err.message : "Something went wrong.", expired: false };
  }
}

export type SetupStart = { totpURI: string; backupCodes: string[] } | { message: string };

/** Starts setup after re-checking the password; the account isn't protected until a code is confirmed. */
export async function startSetup(auth: InstanceAuthClient, password: string): Promise<SetupStart> {
  try {
    const res = await auth.twoFactor.enable({ password });
    if (res.error) return { message: twoFactorError(res.error) };
    if (res.data.method !== "totp") return { message: "Something went wrong. Try again." };
    return { totpURI: res.data.totpURI, backupCodes: res.data.backupCodes };
  } catch (err) {
    return { message: err instanceof Error ? err.message : "Something went wrong." };
  }
}

/** Confirms the first code from the app, which turns two-factor on. Null on success. */
export async function confirmSetup(auth: InstanceAuthClient, code: string): Promise<string | null> {
  try {
    const res = await auth.twoFactor.verifyTotp({ code });
    return res.error ? twoFactorError(res.error) : null;
  } catch (err) {
    return err instanceof Error ? err.message : "Something went wrong.";
  }
}
