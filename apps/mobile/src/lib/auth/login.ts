export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The login field takes a username or an email. Fediverse habit: "@ada" is the username ada. */
export function parseLoginId(input: string): { kind: "email" | "username"; value: string } {
  const value = input.trim().replace(/^@/, "");
  return value.includes("@") ? { kind: "email", value: value.toLowerCase() } : { kind: "username", value };
}

/** Better Auth refuses sign-in for an unconfirmed address with this code (and re-sends the link). */
export function isUnverifiedError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "EMAIL_NOT_VERIFIED" || /verif|confirm/i.test(error?.message ?? "");
}
