// SPDX-License-Identifier: AGPL-3.0-or-later
import { browser } from "$app/environment";
import { page } from "$app/stores";
import { derived, type Readable, writable } from "svelte/store";

// Dates are rendered twice — once on the server, once again when the page
// hydrates — and both renders must agree, or the reader watches the timestamp
// jump a few hours a fraction of a second after the page appears. The server
// has no idea what zone the reader is in, so we tell it: the browser writes its
// IANA zone to a cookie, the root layout load reads it back, and both renders
// format in that zone. See `formatDate` for the matching locale pinning.
export const TZ_COOKIE = "tz";

// A year: the zone is a rendering hint, not account data, so it only has to
// outlive the gap between visits.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Only set once the page has hydrated, so the first client render still matches
// the server's HTML exactly. From then on it wins over the cookie value the
// server used, which is how a reader who has travelled since their last visit
// gets the right time (once, on the next paint) instead of their old zone.
const localZone = writable<string | null>(null);

/**
 * The zone every date on the page is formatted in. `"UTC"` is the fallback for
 * a reader's very first pageview, before any cookie exists — deliberately a
 * fixed zone rather than the runtime default, so server and client agree.
 */
export const timeZone: Readable<string> = derived(
  [page, localZone],
  ([$page, $local]) => $local ?? ($page.data as { timeZone?: string | null }).timeZone ?? "UTC",
);

/** Publish the browser's zone to the cookie and to `timeZone`. Call once, on mount. */
export function rememberTimeZone(): void {
  if (!browser) return;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!zone) return;
  localZone.set(zone);
  // Rewritten on every load rather than only when absent, so both the expiry
  // and the zone itself stay current for a reader who moves.
  document.cookie = `${TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * A cookie is reader-controlled input, and an unknown zone makes
 * `toLocaleDateString` throw mid-render. Anything Intl doesn't recognise is
 * dropped and the caller falls back to UTC.
 */
export function validTimeZone(value: string | undefined): string | null {
  if (!value) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}
