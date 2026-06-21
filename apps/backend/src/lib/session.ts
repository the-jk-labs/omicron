// Session token generation + cookie name/attributes in one place.
export const SESSION_COOKIE = "omicron_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function newSessionToken(): string {
  return crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}
