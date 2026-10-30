import type { InstanceAuthClient } from "./auth-client";

// Ported from apps/frontend/src/lib/passkeys.ts and emailChange.ts (the parts that aren't about passkeys).

type AuthError = { code?: string; message?: string } | null | undefined;

/** Email change and password-confirmed actions need a recent password check. */
export const needsPassword = (error: AuthError) =>
  error?.code === "PASSWORD_REQUIRED" || error?.code === "SESSION_NOT_FRESH";

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
 * Re-checks the password by signing in again (a fresh session), then revokes the old session so it doesn't
 * linger beside it. Resolves to an error message, or null on success.
 */
export async function confirmPassword(
  auth: InstanceAuthClient,
  username: string,
  password: string,
): Promise<string | null> {
  const previous = (await auth.getSession().catch(() => null))?.data?.session.token;
  const res = await auth.signIn.username({ username, password });
  if (res.error) {
    return res.error.code === "INVALID_USERNAME_OR_PASSWORD"
      ? "Incorrect password."
      : res.error.message || "Incorrect password.";
  }
  if (previous) await auth.revokeSession({ token: previous }).catch(() => undefined);
  return null;
}

/** A short, readable device name from a session's user agent ("Firefox on Android"). */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent.toLowerCase();
  const os = ua.includes("android")
    ? "Android"
    : /iphone|ipad|ios/.test(ua)
      ? "iOS"
      : ua.includes("mac os")
        ? "macOS"
        : ua.includes("windows")
          ? "Windows"
          : ua.includes("linux")
            ? "Linux"
            : null;
  const app =
    ua.startsWith("omicron/") ||
    ua.includes("okhttp") ||
    ua.includes("cfnetwork") ||
    ua.includes("expo") ||
    ua.includes("cronet")
      ? "Omicron app"
      : ua.includes("firefox")
        ? "Firefox"
        : ua.includes("edg/")
          ? "Edge"
          : ua.includes("chrome")
            ? "Chrome"
            : ua.includes("safari")
              ? "Safari"
              : "Browser";
  return os ? `${app} on ${os}` : app;
}
