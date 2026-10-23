// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { readCappedBody } from "@/lib/inboxBody.ts";
import { clientIp, rateLimit } from "@/lib/rateLimit.ts";
import { TRAFFIC_VISITOR_COOKIE, TRAFFIC_VISIT_COOKIE, VISITOR_MAX_AGE, VISIT_MAX_AGE } from "@/lib/traffic.ts";
import type { AppEnv } from "@/routes/types.ts";
import * as traffic from "@/services/traffic.ts";

export const trafficRoutes = new Hono<AppEnv>();
const schema = z.object({ path: z.string().max(512), referrer: z.string().max(2048).default("") });
const TOKEN = /^[0-9a-f]{32}$/;
const randomToken = () =>
  [...crypto.getRandomValues(new Uint8Array(16))].map((n) => n.toString(16).padStart(2, "0")).join("");
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
  const oldVisitor = getCookie(c, TRAFFIC_VISITOR_COOKIE);
  const oldVisit = getCookie(c, TRAFFIC_VISIT_COOKIE);
  const visitor = oldVisitor && TOKEN.test(oldVisitor) ? oldVisitor : randomToken();
  const visit = oldVisit && TOKEN.test(oldVisit) ? oldVisit : randomToken();
  try {
    if (
      await traffic.recordPageview({
        ...parsed.data,
        visitor,
        visit,
        userAgent: c.req.header("user-agent") ?? "",
        ip: clientIp(c),
      })
    ) {
      const secure = c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:";
      const options = { httpOnly: true, secure, sameSite: "Lax" as const, path: "/api/traffic" };
      if (visitor !== oldVisitor)
        setCookie(c, TRAFFIC_VISITOR_COOKIE, visitor, { ...options, maxAge: VISITOR_MAX_AGE });
      setCookie(c, TRAFFIC_VISIT_COOKIE, visit, { ...options, maxAge: VISIT_MAX_AGE });
    }
  } catch {
    console.error("traffic: pageview aggregation failed; no request details retained.");
  }
  return c.body(null, 204);
});
