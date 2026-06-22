// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { logger } from "hono/logger";
import { config } from "@/config.ts";
import { handleError } from "@/lib/http.ts";
import { sessionMiddleware } from "@/routes/middleware.ts";
import { healthRoutes } from "@/routes/health.ts";
import { apiRoutes } from "@/routes/index.ts";
import { registerJobHandlers } from "@/queue/handlers.ts";
import type { AppEnv } from "@/routes/types.ts";

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
        return await fed.fetch(c.req.raw, { contextData: undefined });
      }
      await next();
    });
    console.log("✔ Federation enabled (ActivityPub).");
  }

  app.route("/", healthRoutes);

  // Session resolution applies to the JSON API.
  app.use("/api/*", sessionMiddleware);
  app.route("/api", apiRoutes);

  return app;
}