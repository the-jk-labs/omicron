// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal SvelteKit load / request events: just the fields the app's loaders
// and endpoints read. `fetch` is a fakeFetch, so the backend is a route table.
import type { User } from "#lib/types.js";
import { fakeFetch } from "../fakeFetch";

type Routes = Parameters<typeof fakeFetch>[0];

export function event(
  opts: {
    url?: string;
    params?: Record<string, string>;
    routes?: Routes;
    user?: Partial<User> | null;
    routeId?: string | null;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    method?: string;
  } = {},
) {
  const { fetch, calls } = fakeFetch(opts.routes ?? {});
  const url = new URL(opts.url ?? "https://blog.example/");
  const locals: { lang?: string | null } = {};
  return {
    calls,
    locals,
    event: {
      fetch,
      url,
      params: opts.params ?? {},
      locals,
      route: { id: opts.routeId ?? null },
      request: new Request(url, { method: opts.method ?? "GET", headers: opts.headers }),
      cookies: { get: (name: string) => opts.cookies?.[name] },
      parent: async () => ({ user: opts.user ?? null }),
    } as never,
  };
}

/** A signed-in user as the root layout hands it to child loads. */
export function user(overrides: Partial<User> = {}): Partial<User> {
  return { id: "u1", username: "ada", isAdmin: false, isModerator: false, ...overrides };
}
