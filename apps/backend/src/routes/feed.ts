// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as feedService from "@/services/feed.ts";
import { enrichPosts } from "@/services/engagement.ts";
import { requireUser } from "@/routes/middleware.ts";
import type { AppEnv } from "@/routes/types.ts";

export const feedRoutes = new Hono<AppEnv>();

// Personalized home timeline (auth required). Unlike every other paginated
// list, the cursor here is opaque to lib/pagination — it threads two merged
// streams' positions (see services/feed.ts) — so it's passed through raw
// rather than decoded with decodeCursor.
feedRoutes.get("/", async (c) => {
  const user = requireUser(c);
  const cursor = c.req.query("cursor") ?? null;
  const { items, nextCursor } = await feedService.homeFeed(user.id, cursor);
  return c.json({ items: await enrichPosts(items, user.id), nextCursor });
});
