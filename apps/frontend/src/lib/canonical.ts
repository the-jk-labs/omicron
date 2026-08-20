// SPDX-License-Identifier: AGPL-3.0-or-later
// The instance's one true origin.
//
// A page is reachable on every hostname that resolves to this server — the apex
// and its `www.` alias, a bare IP, a tunnel host — and each one serves the same
// article under a different URL. Search engines treat those as separate,
// competing pages and split the ranking between them, so an instance answering
// on two hostnames gets each article indexed weakly or not at all.
//
// The configured instance domain (setup wizard → APP_DOMAIN) is the single
// answer to "which URL is real". `<link rel="canonical">` declares it in every
// page's <head>, hooks.server.ts redirects page loads to it, and robots.txt +
// sitemap.xml advertise it, so all four agree no matter which host was asked.

import { instanceSnapshot } from "$lib/instance";

// Localhost has no certificate, so it is served over plain HTTP. Mirrors the
// backend's own scheme rule in config.ts — keep the two in step.
function schemeFor(host: string): string {
  return host.startsWith("localhost") ? "http" : "https";
}

/**
 * Absolute origin (`https://example.com`) for a configured instance domain, or
 * null when nothing is configured — callers then fall back to the request's own
 * origin, which is correct for an instance that has not been given a domain yet.
 */
export function canonicalOrigin(domain: string | null | undefined): string | null {
  // The domain is stored without a scheme, but tolerate an operator who typed
  // one (or a trailing slash) into the wizard rather than emitting a broken URL.
  const host = domain
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!host) return null;
  return `${schemeFor(host)}://${host}`;
}

/**
 * True when `url` was requested on a hostname other than the configured one and
 * a redirect to the canonical host is safe.
 *
 * Deliberately never true for a localhost-configured instance: that is the
 * zero-config default, and an operator reaching a dev box over its LAN IP must
 * not be bounced to a `localhost` that means their own machine.
 */
export function isNonCanonicalHost(url: URL, domain: string | null | undefined): boolean {
  const origin = canonicalOrigin(domain);
  if (!origin) return false;
  if (new URL(origin).hostname.startsWith("localhost")) return false;
  return url.host !== new URL(origin).host;
}

// Re-exported from $lib/instance, which owns the cached snapshot: the canonical
// origin is one of several things a request needs the instance's own identity
// for, and they should all read the same minute-old answer.
export async function instanceDomain(fetchFn: typeof fetch): Promise<string | null> {
  return (await instanceSnapshot(fetchFn)).domain;
}
