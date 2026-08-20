// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";

// Universal reverse-proxy to the backend. The browser only ever talks to this
// SvelteKit origin (no CORS); cookies — including the backend's Set-Cookie on
// login/logout — flow through transparently. SSR load functions hit the same
// path via SvelteKit's `fetch`, so there is a single, consistent API surface.

const BACKEND = env.INTERNAL_API_URL ?? "http://localhost:8000";

const proxy: RequestHandler = async ({ request, params, url, getClientAddress }) => {
  const target = `${BACKEND}/api/${params.path}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");

  // The browser talks only to this proxy, so the backend would otherwise see the
  // proxy's address for every request. Forward the real client IP so backend
  // per-IP rate limiting works. Set (not append) it: clients can't be trusted to
  // supply their own x-forwarded-for.
  try {
    headers.set("x-forwarded-for", getClientAddress());
  } catch {
    // getClientAddress throws when no adapter address is available (e.g. some
    // dev/test contexts); the backend falls back to the connection address.
    headers.delete("x-forwarded-for");
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    // Hand a backend redirect back to the caller instead of chasing it here.
    // `fetch` follows by default, and the one place the backend redirects — a
    // post's generated share card falling back to the brand image — points at
    // the instance's *public* origin, which a container reaching out to itself
    // may not resolve at all. The caller is a link-preview scraper on the open
    // internet; following it is its job, not ours.
    redirect: "manual",
  };
  if (!["GET", "HEAD"].includes(request.method)) {
    // Forward the body as raw bytes so binary uploads (e.g. avatar images) pass
    // through untouched; JSON bodies are equally preserved.
    init.body = await request.arrayBuffer();
  }

  const res = await fetch(target, init);

  // Pass the body back along with the response headers the browser needs:
  // content-type, Set-Cookie, and the caching/validation headers the backend
  // sets on static media (cache-control etc.) — without forwarding these,
  // uploaded images re-download on every visit.
  const out = new Headers();
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) out.set("set-cookie", setCookie);
  for (const h of [
    "content-type",
    "cache-control",
    "etag",
    "last-modified",
    "expires",
    "vary",
    "content-disposition",
    // Without this a redirect arrives as a bodyless 3xx with nowhere to go.
    "location",
    // Throttling feedback. Machine callers (the content webhook, scripted API
    // clients) need these to back off correctly — without them a 429 arrives
    // with no indication of when to retry.
    "retry-after",
    "ratelimit-limit",
    "ratelimit-remaining",
    "ratelimit-reset",
  ]) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }

  return new Response(res.body, { status: res.status, headers: out });
};

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
