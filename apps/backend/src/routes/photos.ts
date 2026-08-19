// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as stockPhotos from "@/services/stockPhotos.ts";
import { requireUser } from "@/routes/middleware.ts";
import { rateLimit } from "@/lib/rateLimit.ts";
import { jsonBody } from "@/lib/validate.ts";
import { z } from "zod";
import type { AppEnv } from "@/routes/types.ts";

// Free-photo search for the editor's banner picker. Every route is
// signed-in-only: an anonymous visitor has no post to put a banner on, and one
// of the providers spends an instance-wide quota that shouldn't be open to the
// internet.
export const photoRoutes = new Hono<AppEnv>();

// Search is a GET, so the app-wide write throttle doesn't cover it. Both
// providers are shared resources — Unsplash bills a per-instance quota (50/hour
// on their demo tier) and Openverse rate-limits anonymous callers by IP, so
// this instance is one caller to them however many writers it has. One author
// refining a search must not be able to exhaust either for everyone else.
const searchLimiter = rateLimit({
  name: "photo-search",
  windowMs: 60_000,
  max: 20,
  key: (c) => `u:${c.get("user")?.id ?? "anon"}`,
});

// Which providers the picker should offer, in order. Never empty: Openverse
// needs no configuration, so the picker always has something behind it.
photoRoutes.get("/providers", async (c) => {
  requireUser(c);
  return c.json({ providers: await stockPhotos.available() });
});

photoRoutes.get("/search", searchLimiter, async (c) => {
  requireUser(c);
  const provider = stockPhotos.requireProvider(c.req.query("provider"));
  const page = Number(c.req.query("page") ?? "1");
  const items = await stockPhotos.search(
    provider,
    c.req.query("q") ?? "",
    Number.isFinite(page) ? page : 1,
  );
  return c.json({ items });
});

// Called once, when an author picks a photo, for providers that ask to be told.
// Unsplash's API terms require it — it is what keeps a photographer's download
// count honest when we hotlink their image. Best-effort inside the service, so
// this always answers ok.
photoRoutes.post(
  "/use",
  // `provider` stays a plain string here rather than an enum: the set of
  // providers lives in services/stockPhotos.ts, and `requireProvider` is what
  // decides membership. A second list here would be one to keep in step.
  jsonBody(z.object({ provider: z.string(), token: z.string().min(1) })),
  async (c) => {
    requireUser(c);
    const { provider, token } = c.req.valid("json");
    await stockPhotos.recordUse(stockPhotos.requireProvider(provider), token);
    return c.json({ ok: true });
  },
);
