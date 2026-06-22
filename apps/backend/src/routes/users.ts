// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as followsService from "@/services/follows.ts";
import * as postsService from "@/services/posts.ts";
import * as usersService from "@/services/users.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { enrichPosts } from "@/services/engagement.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { requireUser } from "@/routes/middleware.ts";
import { publicUser } from "@/routes/serializers.ts";
import { notFound } from "@/lib/http.ts";
import type { AppEnv } from "@/routes/types.ts";

export const userRoutes = new Hono<AppEnv>();

// Update the signed-in user's own profile (display name, bio). Registered
// before "/:username" so the literal "me" segment wins.
userRoutes.patch("/me", async (c) => {
  const viewer = requireUser(c);
  const body = await c.req.json();
  const user = await usersService.updateProfile(viewer.id, {
    displayName: body.displayName,
    bio: body.bio,
  });
  return c.json({ user: publicUser(user) });
});

// Upload a new avatar (raw image body; content-type identifies the format).
userRoutes.post("/me/avatar", async (c) => {
  const viewer = requireUser(c);
  const contentType = (c.req.header("content-type") ?? "").split(";")[0].trim();
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const user = await usersService.setAvatar(viewer.id, bytes, contentType);
  return c.json({ user: publicUser(user) });
});

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
  const viewer = c.get("user");
  const user = await usersRepo.findByUsername(c.req.param("username"));
  if (!user) throw notFound("User not found.");
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = await postsService.listByAuthor(user.id, cursor);
  return c.json({ items: await enrichPosts(items, viewer?.id ?? null), nextCursor });
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