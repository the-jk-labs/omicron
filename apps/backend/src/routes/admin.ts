// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { z } from "zod";
import * as settings from "@/services/settings.ts";
import { requireAdmin } from "@/routes/middleware.ts";
import { badRequest } from "@/lib/http.ts";
import type { AppEnv } from "@/routes/types.ts";

export const adminRoutes = new Hono<AppEnv>();

// Instance settings a moderator can read/change at runtime (moderator-only).
adminRoutes.get("/settings", async (c) => {
  requireAdmin(c);
  return c.json({ onInstanceViews: await settings.onInstanceViewsEnabled() });
});

const analyticsSchema = z.object({ onInstanceViews: z.boolean() });

// Toggle the on-instance view-counting opt-out (see ANALYTICS.md). When turned
// off, no view counters are incremented and the writer dashboard hides the
// views panel; fediverse engagement is unaffected.
adminRoutes.put("/settings/analytics", async (c) => {
  requireAdmin(c);
  const parsed = analyticsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Expected { onInstanceViews: boolean }.");
  await settings.setOnInstanceViewsEnabled(parsed.data.onInstanceViews);
  return c.json({ onInstanceViews: parsed.data.onInstanceViews });
});
