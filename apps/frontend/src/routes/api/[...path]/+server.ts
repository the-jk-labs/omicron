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
    init.body = await request.text();
  }

  const res = await fetch(target, init);

  // Pass the body + content-type + any Set-Cookie back to the browser.
  const out = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) out.set("content-type", ct);
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) out.set("set-cookie", setCookie);

  return new Response(res.body, { status: res.status, headers: out });
};

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
