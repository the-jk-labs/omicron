import { Hono } from "hono";
import * as followsService from "@/services/follows.ts";
import * as postsService from "@/services/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { requireUser } from "@/routes/middleware.ts";
import { postWithAuthor, publicUser } from "@/routes/serializers.ts";
import { notFound } from "@/lib/http.ts";
import type { AppEnv } from "@/routes/types.ts";

export const userRoutes = new Hono<AppEnv>();

// Public profile + follow state for the viewer.
userRoutes.get("/:username", async (c) => {
  const viewer = c.get("user");
  const { user, counts, isFollowing } = await followsService.profile(
    c.req.param("username"),
    viewer?.id ?? null,
  );
  return c.json({ user: publicUser(user), counts, isFollowing });
});

// A user's posts (public, cursor-paginated).
userRoutes.get("/:username/posts", async (c) => {
  const user = await usersRepo.findByUsername(c.req.param("username"));
  if (!user) throw notFound("User not found.");
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = await postsService.listByAuthor(user.id, cursor);
  return c.json({ items: items.map(postWithAuthor), nextCursor });
});

// Follow / unfollow (auth required).
userRoutes.post("/:username/follow", async (c) => {
  const viewer = requireUser(c);
  await followsService.follow(viewer.id, c.req.param("username"));
  return c.json({ ok: true }, 201);
});

userRoutes.delete("/:username/follow", async (c) => {
  const viewer = requireUser(c);
  await followsService.unfollow(viewer.id, c.req.param("username"));
  return c.json({ ok: true });
});
