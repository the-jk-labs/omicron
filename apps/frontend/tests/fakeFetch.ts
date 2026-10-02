// SPDX-License-Identifier: AGPL-3.0-or-later
// A `fetch` that answers `/api/*` from a route table instead of the network,
// and records every call. Loaders, endpoints and the API client all take a
// fetch, so this is the boundary they are tested at.
import { vi } from "vitest";

type Handler = (req: Request) => Response | Promise<Response>;
// No bare `unknown` in the union: it would swallow Handler and untype inline handlers.
type Reply = Handler | Response | string | number | boolean | null | readonly unknown[] | { [key: string]: unknown };

export type Routes = Record<string, Reply>;

export type Call = { method: string; path: string; body: unknown; headers: Headers };

/** A JSON error the way the backend sends one. */
export function apiError(status: number, error = "Nope"): Response {
  return Response.json({ error }, { status });
}

/**
 * Routes are keyed `"GET /api/posts"` (the query string is part of the key
 * when given, and ignored when not). A value is the JSON body to answer with,
 * a Response, or a function of the request. A `"*"` route answers anything
 * else; without one, unrouted calls answer 404.
 */
export function fakeFetch(routes: Routes = {}) {
  const calls: Call[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    // jsdom's Blob/File can't be handed to Node's Request; pass the bytes instead.
    const raw = init?.body as { arrayBuffer?: () => Promise<ArrayBuffer> } | null | undefined;
    if (raw && typeof raw.arrayBuffer === "function") {
      init = { ...init, body: new Uint8Array(await raw.arrayBuffer()) };
    }
    const req = new Request(new URL(input instanceof Request ? input.url : input, "http://app.test"), init);
    const url = new URL(req.url);
    const text = req.method === "GET" || req.method === "HEAD" ? "" : await req.clone().text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      // A raw (non-JSON) body is recorded as text.
    }
    calls.push({ method: req.method, path: url.pathname + url.search, body, headers: req.headers });
    const reply =
      routes[`${req.method} ${url.pathname}${url.search}`] ?? routes[`${req.method} ${url.pathname}`] ?? routes["*"];
    if (reply === undefined) return apiError(404, "Not found");
    if (typeof reply === "function") return await reply(req);
    if (reply instanceof Response) return reply.clone();
    return Response.json(reply);
  });
  return { fetch, calls };
}
