import { Hono } from "hono";
import * as postsService from "@/services/posts.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { requireUser } from "@/routes/middleware.ts";
import { barePost, postWithAuthor } from "@/routes/serializers.ts";
import type { AppEnv } from "@/routes/types.ts";

export const postRoutes = new Hono<AppEnv>();

// Timeline (public). `?scope=local` returns only posts from this instance;
// otherwise the global blog feed across the fediverse.
postRoutes.get("/", async (c) => {
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = c.req.query("scope") === "local"
    ? await postsService.localTimeline(cursor)
    : await postsService.globalTimeline(cursor);
  return c.json({ items: items.map(postWithAuthor), nextCursor });
});

// Create a post (auth required).
postRoutes.post("/", async (c) => {
  const user = requireUser(c);
  const body = await c.req.json();
  const post = await postsService.createPost(user.id, body);
  return c.json({ post: barePost(post) }, 201);
});

// Single post (public).
postRoutes.get("/:id", async (c) => {
  const row = await postsService.getPost(c.req.param("id"));
  return c.json({ post: postWithAuthor(row) });
});
