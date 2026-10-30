// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { badRequest, payloadTooLarge } from "@/lib/http.ts";
import { readCappedBody } from "@/lib/inboxBody.ts";
import { clientIp, rateLimit } from "@/lib/rateLimit.ts";
import type { Reply } from "@/lib/reply.ts";
import type { AppEnv } from "@/routes/types.ts";
import * as umami from "@/services/umami.ts";

export const siteRoutes = new Hono<AppEnv>();
const MAX_BODY_BYTES = 16_384;

siteRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

siteRoutes.get("/", async (c) => c.json({ websiteId: await umami.websiteId() } satisfies Reply<"SiteStatistics">));

siteRoutes.get("/script.js", async (c) => {
  if (!(await umami.websiteId())) return c.notFound();
  try {
    const script = await umami.trackerScript();
    c.header("Content-Type", "application/javascript; charset=utf-8");
    return c.body(script);
  } catch {
    return c.json({ error: "Site statistics unavailable." }, 502);
  }
});

siteRoutes.post("/api/send", rateLimit({ name: "site-pageview", windowMs: 60_000, max: 60 }), async (c) => {
  if (c.req.header("dnt") === "1" || c.req.header("sec-gpc") === "1") return c.body(null, 204);
  const id = await umami.websiteId();
  if (!id) return c.body(null, 204);
  if (c.req.header("sec-fetch-site") === "cross-site") return c.body(null, 403);
  if (c.req.header("content-type")?.split(";")[0].trim() !== "application/json") {
    throw badRequest("Expected JSON.");
  }
  if (Number(c.req.header("content-length")) > MAX_BODY_BYTES) throw payloadTooLarge("Pageview too large.");
  const bytes = await readCappedBody(c.req.raw, MAX_BODY_BYTES);
  if (!bytes) throw payloadTooLarge("Pageview too large.");
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw badRequest("Invalid JSON.");
  }
  const pageview = umami.pageview(body, id);
  const cache = c.req.header("x-umami-cache");
  if (cache && cache.length > 4096) throw badRequest("Invalid session cache.");
  try {
    return c.json(
      await umami.sendPageview(pageview, {
        userAgent: c.req.header("user-agent") ?? "",
        ip: clientIp(c),
        cache,
      }),
    );
  } catch {
    return c.json({ error: "Site statistics unavailable." }, 502);
  }
});
