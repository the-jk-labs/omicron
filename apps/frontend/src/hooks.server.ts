// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Handle } from "@sveltejs/kit";
import { canonicalOrigin, instanceDomain, isNonCanonicalHost } from "$lib/canonical";

// Page loads asked for on a non-canonical hostname (`www.` when the instance is
// the apex, or vice versa) are sent to the canonical one, so every article has
// exactly one indexable URL. See $lib/canonical for why that matters.
//
// Only navigations are redirected. `/api` is left alone because session cookies
// are scoped to the host that set them: bouncing an in-flight request from an
// already-loaded page to the other hostname would strip its cookie and log the
// reader out mid-action. Those readers are on the canonical host within one
// navigation anyway.
const CANONICAL_METHODS = new Set(["GET", "HEAD"]);

async function canonicalRedirect(event: Parameters<Handle>[0]["event"]): Promise<Response | null> {
  if (!CANONICAL_METHODS.has(event.request.method)) return null;
  if (event.url.pathname.startsWith("/api/")) return null;

  const domain = await instanceDomain(event.fetch);
  if (!isNonCanonicalHost(event.url, domain)) return null;

  const target = `${canonicalOrigin(domain)}${event.url.pathname}${event.url.search}`;
  // 308 rather than 301: permanent (so engines transfer ranking to the canonical
  // URL) without the legacy licence to rewrite the method.
  return new Response(null, { status: 308, headers: { location: target } });
}

// `<html lang>` for this response. app.html carries a `%omicron.lang%`
// placeholder; a page that knows the language of its main content parks the
// subtag on `locals` during load, and this substitutes it on the way out.
//
// Getting it right matters more here than on a single-language site: a post is
// tagged with the language its author wrote it in and federates that way, but
// every page was served as `lang="en"` regardless. A search engine takes the
// declaration over its own guess, so a Turkish post was being offered to
// English searchers and withheld from Turkish ones — the language field was
// collected, stored and federated, then discarded at the last step.
//
// The value reaches us from a federated post, i.e. from another instance, and
// is about to be interpolated into an HTML attribute. Anything that is not
// plainly a BCP-47 tag is dropped rather than escaped: the shape is narrow
// enough to state exactly, so there is no reason to accept anything else.
const BCP47 = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const DEFAULT_LANG = "en";
// Global, so every occurrence goes. A string pattern would replace only the
// first one, which is silent and wrong the moment the token appears twice —
// the page then ships a literal `%omicron.lang%` as its language.
const LANG_PLACEHOLDER = /%omicron\.lang%/g;

function pageLang(locals: App.Locals): string {
  const tag = locals.lang?.trim();
  return tag && BCP47.test(tag) ? tag : DEFAULT_LANG;
}

// Security response headers applied to every response (pages, API proxy, and
// proxied media alike). The Content-Security-Policy itself is configured in
// svelte.config.js (`kit.csp`) so SvelteKit can nonce its own inline scripts;
// the headers below are the ones it doesn't manage.
export const handle: Handle = async ({ event, resolve }) => {
  const redirectResponse = await canonicalRedirect(event);
  const response = redirectResponse ??
    // Load runs inside resolve(), so `locals.lang` is already set by the time
    // the rendered chunks come back through the transform.
    await resolve(event, {
      transformPageChunk: ({ html }) => html.replace(LANG_PLACEHOLDER, pageLang(event.locals)),
    });

  // State the encoding in the header, not only in the document.
  //
  // SvelteKit sends a bare `text/html`, which leaves `<meta charset>` as the
  // only declaration — and that is a declaration a *parser* honours, several
  // kilobytes into the document. A link-preview fetcher reading only the head,
  // or anything that trusts the header over the markup, is left guessing, and
  // its guess is Latin-1. On an instance writing Azerbaijani, Turkish or Greek
  // that turns a title into mojibake in the share card while the page itself
  // renders perfectly. Set once, here, where every HTML response passes.
  const contentType = response.headers.get("content-type");
  if (contentType?.startsWith("text/html") && !contentType.includes("charset")) {
    response.headers.set("Content-Type", `${contentType}; charset=utf-8`);
  }

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
