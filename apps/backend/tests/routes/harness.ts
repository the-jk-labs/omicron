// SPDX-License-Identifier: AGPL-3.0-or-later
// Mounts one router the way app.ts does — under its /api prefix, behind the
// real error handler — with the session reduced to "whoever the test says is
// signed in". The routes' own guards (requireUser/requireModerator/requireAdmin)
// still run, so auth is exercised, not assumed.
import { Hono } from "hono";
import type { User } from "@/db/schema.ts";
import { handleError } from "@/lib/http.ts";
import type { AppEnv } from "@/routes/types.ts";
import { userRow } from "../fixtures.ts";

export type Session = { user: User | null };

export function mount(prefix: string, router: Hono<AppEnv>) {
  const session: Session = { user: null };
  const app = new Hono<AppEnv>();
  app.onError(handleError);
  app.use("*", async (c, next) => {
    c.set("user", session.user);
    await next();
  });
  app.route(prefix, router);

  return {
    session,
    signIn(overrides: Partial<User> = {}) {
      session.user = userRow({ id: "me", username: "me", ...overrides });
      return session.user;
    },
    signOut() {
      session.user = null;
    },
    request(path: string, init?: RequestInit) {
      return app.request(path, init);
    },
    json(path: string, method: string, body: unknown, headers: Record<string, string> = {}) {
      return app.request(path, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    },
  };
}
