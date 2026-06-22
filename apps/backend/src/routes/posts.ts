import { Hono } from "hono";
import * as postsService from "@/services/posts.ts";
import * as likesService from "@/services/likes.ts";
import * as commentsService from "@/services/comments.ts";
import { enrichPost, enrichPosts } from "@/services/engagement.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { requireUser } from "@/routes/middleware.ts";
import { barePost, commentView } from "@/routes/serializers.ts";
import type { AppEnv } from "@/routes/types.ts";

export const postRoutes = new Hono<AppEnv>();

// Timeline (public). `?scope=local` returns only posts from this instance;
// otherwise the global blog feed across the fediverse.
postRoutes.get("/", async (c) => {
  const viewer = c.get("user");
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = c.req.query("scope") === "local"
    ? await postsService.localTimeline(cursor)
    : await postsService.globalTimeline(cursor);
  return c.json({ items: await enrichPosts(items, viewer?.id ?? null), nextCursor });
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
  const viewer = c.get("user");
  const row = await postsService.getPost(c.req.param("id"));
  return c.json({ post: await enrichPost(row, viewer?.id ?? null) });
});

// Like / unlike a post (auth required). Returns fresh like stats.
postRoutes.post("/:id/like", async (c) => {
  const user = requireUser(c);
  const stats = await likesService.like(user.id, c.req.param("id"));
  return c.json({ likeCount: stats.count, liked: stats.liked });
});

postRoutes.delete("/:id/like", async (c) => {
  const user = requireUser(c);
  const stats = await likesService.unlike(user.id, c.req.param("id"));
  return c.json({ likeCount: stats.count, liked: stats.liked });
});

// Comments (list public, create requires auth).
postRoutes.get("/:id/comments", async (c) => {
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = await commentsService.list(c.req.param("id"), cursor);
  return c.json({ items: items.map(commentView), nextCursor });
});

postRoutes.post("/:id/comments", async (c) => {
  const user = requireUser(c);
  const body = await c.req.json();
  const comment = await commentsService.create(user.id, c.req.param("id"), body.content);
  return c.json({
    comment: commentView({
      comment,
      author: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl },
    }),
  }, 201);
});
