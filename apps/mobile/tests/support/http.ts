import { vi } from "vitest";
import type { Fetcher } from "@/lib/api/client";

export const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** A fetch stand-in that answers every request with the given response. */
export function fetcherReturning(body: unknown, status = 200) {
  return vi.fn<Fetcher>(async () => jsonResponse(body, status));
}

/** A fetch stand-in routing by URL suffix; unknown URLs reject like a network failure. */
export function routeFetch(routes: Record<string, () => Response>) {
  return vi.fn<Fetcher>(async (url) => {
    const match = Object.keys(routes).find((suffix) => url.endsWith(suffix));
    if (!match) throw new TypeError("Network request failed");
    return routes[match]();
  });
}
