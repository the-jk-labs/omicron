// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { logger } from "hono/logger";
import { config } from "@/config.ts";
import { handleError } from "@/lib/http.ts";
import { sessionMiddleware } from "@/routes/middleware.ts";
import { healthRoutes } from "@/routes/health.ts";
import { apiRoutes } from "@/routes/index.ts";
import { registerJobHandlers } from "@/queue/handlers.ts";
import { checkRateLimit, clientIp, rateLimit } from "@/lib/rateLimit.ts";
import type { AppEnv } from "@/routes/types.ts";

// Read-only requests are cheap and safe; the general limiter targets mutations.
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Broad backstop on API writes: per signed-in user, or per IP for anonymous
// callers. Endpoint-specific limiters (e.g. auth) layer stricter caps on top.
const apiWriteLimiter = rateLimit({
  name: "api-write",
  windowMs: 60_000,
  max: 120,
  key: (c) => {
    const user = c.get("user");
    return user ? `u:${user.id}` : `ip:${clientIp(c)}`;
  },
});

// The federation inbox accepts unauthenticated POSTs from arbitrary instances;
// cap per source IP so a hostile peer can't flood it. Generous, since a busy
// instance legitimately delivers many activities.
const INBOX_LIMIT = { name: "inbox", windowMs: 60_000, max: 300 };

// Builds the fully-composed Hono app. Federation is mounted only when enabled,
// keeping the standalone blog free of any ActivityPub code paths.
export async function buildApp() {
  registerJobHandlers();

  const app = new Hono<AppEnv>();
  app.use("*", logger());
  app.onError(handleError);

  // Mount ActivityPub (WebFinger, actor, inbox/outbox) before app routes.
  // Federation paths are delegated to Fedify's fetch handler; everything else
  // falls through to the app's own routes.
  if (config.FEDERATION_ENABLED) {
    const { getFederation } = await import("@/federation/mod.ts");
    const fed = getFederation();
    const fedPrefixes = ["/.well-known/", "/users/", "/inbox", "/nodeinfo"];
    app.use("*", async (c, next) => {
      const path = new URL(c.req.url).pathname;
      if (fedPrefixes.some((p) => path === p || path.startsWith(p))) {
        // Throttle inbound activity delivery (POST); GET dispatchers (actor,
        // WebFinger, outbox) are cheap reads and left unthrottled here.
        if (c.req.method === "POST") {
          const { allowed, retryAfter } = checkRateLimit(c, INBOX_LIMIT);
          if (!allowed) {
            return new Response("Too Many Requests", {
              status: 429,
              headers: { "retry-after": String(retryAfter) },
            });
          }
        }
        return await fed.fetch(c.req.raw, { contextData: undefined });
      }
      await next();
    });
    console.log("✔ Federation enabled (ActivityPub).");
  }

  app.route("/", healthRoutes);

  // Session resolution applies to the JSON API.
  app.use("/api/*", sessionMiddleware);
  // General write throttle, after session resolution so it can key by user.
  app.use("/api/*", (c, next) =>
    READ_METHODS.has(c.req.method) ? next() : apiWriteLimiter(c, next));
  app.route("/api", apiRoutes);

  return app;
}
