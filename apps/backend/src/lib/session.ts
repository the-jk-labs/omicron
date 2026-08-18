// SPDX-License-Identifier: AGPL-3.0-or-later
// Session token generation + cookie name/attributes in one place.
import type { Context } from "hono";

export const SESSION_COOKIE = "omicron_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// Whether a cookie set on this response should carry the `Secure` attribute.
//
// The authoritative signal is the actual request scheme, which Caddy terminates
// TLS for and forwards as `x-forwarded-proto` (through the SvelteKit proxy for
// the /api surface). Deriving `Secure` from that — rather than from the
// boot-time `APP_DOMAIN` — is what keeps the flag correct on the zero-config
// path: an instance configured entirely through the setup wizard is served over
// HTTPS while `APP_DOMAIN` still holds its `localhost:5173` default, and the old
// `!APP_DOMAIN.startsWith("localhost")` heuristic would then ship the session
// cookie without `Secure` on a production site. When no forwarded scheme is
// present (bare local dev, no proxy) we fall back to that domain heuristic, so
// localhost stays cookie-friendly over plain HTTP.
export function cookieSecure(c: Context, appDomain: string): boolean {
  const proto = c.req.header("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim().toLowerCase() === "https";
  return !appDomain.startsWith("localhost");
}

export function newSessionToken(): string {
  return crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}
