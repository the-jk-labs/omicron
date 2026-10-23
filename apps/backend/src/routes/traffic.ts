// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { z } from "zod";
import { readCappedBody } from "@/lib/inboxBody.ts";
import { clientIp, rateLimit } from "@/lib/rateLimit.ts";
import type { AppEnv } from "@/routes/types.ts";
import * as traffic from "@/services/traffic.ts";

export const trafficRoutes = new Hono<AppEnv>();
const schema = z.object({ path: z.string().max(512), referrer: z.string().max(2048).default("") });
const limiter = rateLimit({ name: "traffic", windowMs: 60_000, max: 120 });

trafficRoutes.post("/pageview", limiter, async (c) => {
  c.header("cache-control", "no-store");
  const user = c.get("user");
  if (user?.isAdmin || user?.isModerator || !(await traffic.acceptsTraffic(c.req.raw.headers)))
    return c.body(null, 204);
  const bytes = await readCappedBody(c.req.raw, 4096);
  if (!bytes) return c.body(null, 413);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return c.body(null, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.body(null, 400);
  try {
    await traffic.recordPageview({
      ...parsed.data,
      userAgent: c.req.header("user-agent") ?? "",
      ip: clientIp(c),
    });
  } catch {
    console.error("traffic: pageview aggregation failed; no request details retained.");
  }
  return c.body(null, 204);
});
