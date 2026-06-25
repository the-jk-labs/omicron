// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as followsService from "@/services/follows.ts";
import * as postsService from "@/services/posts.ts";
import * as usersService from "@/services/users.ts";
import * as relationsService from "@/services/relations.ts";
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

// Remove the current avatar (revert to initials).
userRoutes.delete("/me/avatar", async (c) => {
  const viewer = requireUser(c);
  const user = await usersService.removeAvatar(viewer.id);
  return c.json({ user: publicUser(user) });
});

// Relation-management lists for the signed-in user (Settings → Connections).
userRoutes.get("/me/muted", async (c) => {
  const viewer = requireUser(c);
  return c.json({ items: await relationsService.listRelation("mute", viewer.id) });
});

userRoutes.get("/me/blocked", async (c) => {
  const viewer = requireUser(c);
  return c.json({ items: await relationsService.listRelation("block", viewer.id) });
});

// Public profile + the viewer's follow/mute/block state.
userRoutes.get("/:username", async (c) => {
  const viewer = c.get("user");
  const { user, counts, isFollowing, isMuted, isBlocked } = await followsService.profile(
    c.req.param("username"),
    viewer?.id ?? null,
  );
  return c.json({ user: publicUser(user), counts, isFollowing, isMuted, isBlocked });
});

// Public follower / following lists for a profile (local + cached remote).
userRoutes.get("/:username/followers", async (c) => {
  return c.json({ items: await followsService.followersOf(c.req.param("username")) });
});

userRoutes.get("/:username/following", async (c) => {
  return c.json({ items: await followsService.followingOf(c.req.param("username")) });
});

// A user's posts (public, cursor-paginated). Filtered by the viewer's mutes/blocks.
userRoutes.get("/:username/posts", async (c) => {
  const viewer = c.get("user");
  const user = await usersRepo.findByUsername(c.req.param("username"));
  if (!user) throw notFound("User not found.");
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = await postsService.listByAuthor(
    user.id,
    cursor,
    viewer?.id ?? null,
  );
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

// Mute / unmute a local user (auth required). Muting silently hides their posts
// from the viewer's feeds.
userRoutes.post("/:username/mute", async (c) => {
  const viewer = requireUser(c);
  await relationsService.setLocal("mute", viewer.id, c.req.param("username"), true);
  return c.json({ ok: true }, 201);
});

userRoutes.delete("/:username/mute", async (c) => {
  const viewer = requireUser(c);
  await relationsService.setLocal("mute", viewer.id, c.req.param("username"), false);
  return c.json({ ok: true });
});

// Block / unblock a local user (auth required). Blocking hides posts in both
// directions on this instance (not federated).
userRoutes.post("/:username/block", async (c) => {
  const viewer = requireUser(c);
  await relationsService.setLocal("block", viewer.id, c.req.param("username"), true);
  return c.json({ ok: true }, 201);
});

userRoutes.delete("/:username/block", async (c) => {
  const viewer = requireUser(c);
  await relationsService.setLocal("block", viewer.id, c.req.param("username"), false);
  return c.json({ ok: true });
});
