// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as tagsService from "@/services/tags.ts";
import { enrichPosts } from "@/services/engagement.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { requireUser } from "@/routes/middleware.ts";
import type { AppEnv } from "@/routes/types.ts";

export const tagRoutes = new Hono<AppEnv>();

// Trending tags (public) — the discovery index.
tagRoutes.get("/", async (c) => {
  return c.json({ tags: await tagsService.trending() });
});

// The signed-in user's followed tags. Registered before "/:slug" so "following"
// isn't captured as a tag slug.
tagRoutes.get("/following", async (c) => {
  const user = requireUser(c);
  return c.json({ tags: await tagsService.followed(user.id) });
});

// Tag meta: counts + viewer's follow state (public).
tagRoutes.get("/:slug", async (c) => {
  const viewer = c.get("user");
  const detail = await tagsService.getTag(c.req.param("slug"), viewer?.id ?? null);
  return c.json(detail);
});

// A tag's posts (public, paginated).
tagRoutes.get("/:slug/posts", async (c) => {
  const viewer = c.get("user");
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = await tagsService.tagPosts(
    c.req.param("slug"),
    cursor,
    viewer?.id ?? null,
  );
  return c.json({ items: await enrichPosts(items, viewer?.id ?? null), nextCursor });
});

// Follow / unfollow a tag (auth required).
tagRoutes.post("/:slug/follow", async (c) => {
  const user = requireUser(c);
  await tagsService.follow(user.id, c.req.param("slug"));
  return c.json({ ok: true });
});

tagRoutes.delete("/:slug/follow", async (c) => {
  const user = requireUser(c);
  await tagsService.unfollow(user.id, c.req.param("slug"));
  return c.json({ ok: true });
});
