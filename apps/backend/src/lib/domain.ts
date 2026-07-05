// SPDX-License-Identifier: AGPL-3.0-or-later

// Domain helpers for the defederation blocklist.

// Reduces free-form admin input to a bare, lowercased hostname, or null if it
// can't be read as one. Accepts a plain host, a URL, or an `@user@host` handle.
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  // A full URL -> its host. Do this BEFORE the `@`-handling below, so a Mastodon
  // profile URL like `https://host/@user` resolves to `host` instead of being
  // mistaken for an `@user@host` handle and mangled to `user`.
  if (s.includes("://")) {
    try {
      s = new URL(s).host;
    } catch {
      return null;
    }
  } else if (s.includes("@")) {
    // `@user@host` or `user@host` -> keep the part after the last `@`.
    s = s.slice(s.lastIndexOf("@") + 1);
  }
  // Strip any leftover path and port.
  s = s.split("/")[0].split(":")[0];
  // A real hostname: labels of letters/digits/hyphens, at least one dot, and a
  // 2+ letter TLD. Rejects spaces, schemes, IPs-with-ports, etc.
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(s)) return null;
  return s;
}

// Whether `host` falls under `domain` — an exact match or a subdomain. Blocking
// `example.com` therefore also blocks `mastodon.example.com`.
export function hostMatchesDomain(host: string, domain: string): boolean {
  host = host.trim().toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}
