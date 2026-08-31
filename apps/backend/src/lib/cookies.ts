// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from "hono";

// Whether a cookie set on this response should carry `Secure`. The authoritative
// signal is the forwarded scheme (Caddy terminates TLS and sends x-forwarded-proto);
// deriving it from that — not the boot-time APP_DOMAIN — keeps the flag correct on
// a wizard-configured HTTPS instance whose APP_DOMAIN still holds its localhost
// default. With no forwarded scheme (bare local dev) we fall back to the domain.
export function cookieSecure(c: Context, appDomain: string): boolean {
  const proto = c.req.header("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim().toLowerCase() === "https";
  return !appDomain.startsWith("localhost");
}
