// SPDX-License-Identifier: AGPL-3.0-or-later

// The one edit the AI-scraper-shield toggle makes to the operator's Caddyfile.
//
// Kept here, free of config and database imports, so it can be tested on its
// own — the wiring that reads the file and pushes it to Caddy's admin API is in
// services/anubisProtection.ts. Same split as lib/shareImage.ts.

// By default the app branch proxies the app directly; enabling protection
// re-points it at the Anubis sidecar, which forwards to the same app. Keep both
// strings in step with the Caddyfile.
export const DIRECT_UPSTREAM = "reverse_proxy frontend:3000";
export const ANUBIS_UPSTREAM = "reverse_proxy anubis:8080";

/**
 * The Caddyfile with the app upstream re-pointed at the Anubis sidecar.
 *
 * Exactly one occurrence, not at least one. `String.replace` with a string
 * pattern rewrites the *first* one, so a second — a mention in a comment above
 * the directive, say — would be rewritten in its place and the real upstream
 * left pointing at the app. Caddy would accept that config, the admin page would
 * report success, and the shield would simply not be in the request path.
 * Refuse rather than guess.
 */
export function routeThroughAnubis(caddyfile: string): string {
  const found = caddyfile.split(DIRECT_UPSTREAM).length - 1;
  if (found !== 1) {
    throw new Error(
      `Caddyfile must contain "${DIRECT_UPSTREAM}" exactly once to route through ` +
        `Anubis; found ${found}.`,
    );
  }
  return caddyfile.replace(DIRECT_UPSTREAM, ANUBIS_UPSTREAM);
}
