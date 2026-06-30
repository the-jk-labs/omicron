// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as analyticsService from "@/services/analytics.ts";
import { requireUser } from "@/routes/middleware.ts";
import type { AppEnv } from "@/routes/types.ts";

export const dashboardRoutes = new Hono<AppEnv>();

// The signed-in writer's own analytics (auth required). Returns aggregate stats
// for *their* posts only — never another author's, never reader identities.
// `?days=` bounds the views-over-time series (default 30, clamped to a year).
dashboardRoutes.get("/", async (c) => {
  const user = requireUser(c);
  const days = Math.min(Math.max(Number(c.req.query("days")) || 30, 1), 365);
  const summary = await analyticsService.dashboardFor(user.id, days);
  return c.json(summary);
});
