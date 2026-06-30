// SPDX-License-Identifier: AGPL-3.0-or-later

// Privacy-preserving helpers for on-instance view counting. The guiding rule:
// we count what happened, we never persist who. See ANALYTICS.md.

// Today's date as a UTC YYYY-MM-DD bucket. We never bucket finer than a day, so
// a count can't hint at when an individual visited.
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// The daily de-duplication salt. Held only in memory and regenerated whenever
// the UTC day rolls over (and on restart), so yesterday's visitor hashes can
// never be reconstructed or linked to anyone once the day ends.
let saltDay = "";
let salt = "";
function currentSalt(): string {
  const day = today();
  if (day !== saltDay) {
    saltDay = day;
    salt = crypto.randomUUID() + crypto.randomUUID();
  }
  return salt;
}

// One-way hash of a visitor for *today only*, used purely to dedupe unique views
// within the day. Combines the rotating salt with coarse request signals; the
// raw IP and user-agent are never stored, only this digest.
export async function visitorHash(ip: string, userAgent: string): Promise<string> {
  const data = new TextEncoder().encode(`${currentSalt()}|${ip}|${userAgent}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Respect Do Not Track and Global Privacy Control: a request asking not to be
// tracked is never counted, even when on-instance views are enabled.
export function readerOptedOut(headers: Headers): boolean {
  return headers.get("dnt") === "1" || headers.get("sec-gpc") === "1";
}

// Coarse bot filter so counts reflect people, not crawlers. Not exhaustive by
// design — over-counting a human is worse than missing a bot for our purposes.
const BOT_RE = /bot|crawl|spider|slurp|fetch|monitor|preview|scan|curl|wget|headless/i;
export function isBot(userAgent: string): boolean {
  return userAgent === "" || BOT_RE.test(userAgent);
}

// Best-effort client IP from proxy headers (Omicron sits behind Caddy). Used
// only as hash input and immediately discarded — never written anywhere.
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "";
}
