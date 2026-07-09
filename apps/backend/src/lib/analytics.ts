// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";

// Privacy-preserving helpers for on-instance view counting. The guiding rule:
// we count what happened, we never persist who. See ANALYTICS.md.

// The anonymous reader cookie: a random, first-party token carrying no IP,
// user-agent, or fingerprinting signal. It exists purely so a repeat visit
// from the same browser can be recognised as "already counted" — a different
// browser or device is, by design, a different reader. Long-lived so a view
// stays deduplicated for as long as the count itself matters.
export const VIEW_COOKIE = "omicron_reader";
// 400 days — the longest lifetime browsers honour (RFC 6265bis / the Chrome cap
// Hono enforces); anything larger makes setCookie throw. This is only a hint for
// how long a returning reader stays recognised: de-duplication itself is
// permanent and stored server-side (see post_views), independent of this value.
export const VIEW_COOKIE_TTL_MS = 1000 * 60 * 60 * 24 * 400; // 400 days

// Today's date as a UTC YYYY-MM-DD bucket. Used only to place a *newly counted*
// view on the dashboard's views-over-time chart — it has no bearing on
// de-duplication, which is permanent regardless of when a reader returns.
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// One-way, keyed hash of a de-dup key. Keying with the instance's session
// secret means the digest can't be recomputed by anyone without server
// access, and even then it doesn't reverse back to the cookie or user id.
async function hashKey(value: string): Promise<string> {
  const data = new TextEncoder().encode(`${config.SESSION_SECRET}|${value}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Permanent de-dup key for a signed-in reader: their account already ties
// likes/comments to them, so re-reading a post — on any device, on any day —
// never recounts it.
export async function userVisitorKey(userId: string): Promise<string> {
  return `u:${await hashKey(userId)}`;
}

// Permanent de-dup key for an anonymous reader, derived only from the random
// cookie value above — never an IP address, user-agent, or fingerprint.
export async function anonVisitorKey(cookieValue: string): Promise<string> {
  return `a:${await hashKey(cookieValue)}`;
}

// Respect Do Not Track and Global Privacy Control: a request asking not to be
// tracked is never counted, even when on-instance views are enabled, and no
// reader cookie is issued to it either.
export function readerOptedOut(headers: Headers): boolean {
  return headers.get("dnt") === "1" || headers.get("sec-gpc") === "1";
}

// Coarse bot filter so counts reflect people, not crawlers. Not exhaustive by
// design — over-counting a human is worse than missing a bot for our purposes.
const BOT_RE = /bot|crawl|spider|slurp|fetch|monitor|preview|scan|curl|wget|headless/i;
export function isBot(userAgent: string): boolean {
  return userAgent === "" || BOT_RE.test(userAgent);
}
