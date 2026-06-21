import { Hono } from "hono";
import * as feedService from "@/services/feed.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { requireUser } from "@/routes/middleware.ts";
import { postWithAuthor } from "@/routes/serializers.ts";
import type { AppEnv } from "@/routes/types.ts";

export const feedRoutes = new Hono<AppEnv>();

// Personalized home timeline (auth required).
feedRoutes.get("/", async (c) => {
  const user = requireUser(c);
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = await feedService.homeFeed(user.id, cursor);
  return c.json({ items: items.map(postWithAuthor), nextCursor });
});
