// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";

// Universal reverse-proxy to the backend. The browser only ever talks to this
// SvelteKit origin (no CORS); cookies — including the backend's Set-Cookie on
// login/logout — flow through transparently. SSR load functions hit the same
// path via SvelteKit's `fetch`, so there is a single, consistent API surface.

const BACKEND = env.INTERNAL_API_URL ?? "http://localhost:8000";

const proxy: RequestHandler = async ({ request, params, url }) => {
  const target = `${BACKEND}/api/${params.path}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");

  const init: RequestInit = { method: request.method, headers };
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
  for (
    const h of [
      "content-type",
      "cache-control",
      "etag",
      "last-modified",
      "expires",
      "vary",
      "content-disposition",
    ]
  ) {
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