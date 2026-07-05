// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Handle } from "@sveltejs/kit";

// Security response headers applied to every response (pages, API proxy, and
// proxied media alike). The Content-Security-Policy itself is configured in
// svelte.config.js (`kit.csp`) so SvelteKit can nonce its own inline scripts;
// the headers below are the ones it doesn't manage.
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Never MIME-sniff a response into a more dangerous type. Belt-and-suspenders
  // for /api/uploads (which is proxied through here, so the backend's own header
  // would otherwise be dropped by the proxy's header allowlist).
  response.headers.set("X-Content-Type-Options", "nosniff");
  // Clickjacking: this app is never meant to be framed. `frame-ancestors 'none'`
  // in the CSP covers modern browsers; X-Frame-Options covers older ones.
  response.headers.set("X-Frame-Options", "DENY");
  // Don't leak full URLs (which can carry handles/slugs) to third-party origins.
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Isolate our browsing context from cross-origin openers.
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");

  // HSTS only when the request actually arrived over HTTPS (Caddy terminates TLS
  // and forwards x-forwarded-proto). Sent over plain HTTP it would be ignored by
  // browsers anyway, but gating keeps localhost dev clean.
  const proto = event.request.headers.get("x-forwarded-proto") ??
    event.url.protocol.replace(":", "");
  if (proto === "https") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains",
    );
  }

  return response;
};
