// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { z } from "zod";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { badRequest, notFound } from "@/lib/http.ts";
import { renderMarkdown } from "@/lib/markdown.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { jsonBody } from "@/lib/validate.ts";
import { requireUser } from "@/routes/middleware.ts";
import { profileLinkView, publicUser } from "@/routes/serializers.ts";
import type { AppEnv } from "@/routes/types.ts";
import { enrichPosts } from "@/services/engagement.ts";
import * as followRequestsService from "@/services/followRequests.ts";
import * as followsService from "@/services/follows.ts";
import * as postsService from "@/services/posts.ts";
import * as recommendationsService from "@/services/recommendations.ts";
import * as relationsService from "@/services/relations.ts";
import * as usersService from "@/services/users.ts";
import { MAX_CUSTOM_SECTION_LEN } from "@/services/users.ts";

export const userRoutes = new Hono<AppEnv>();

// Every field optional: the profile form patches only what the user touched.
// Length limits, the email format, and the link/tag caps stay in
// services/users.ts, which is the one place they are enforced.
const updateProfileSchema = z.object({
  displayName: z.string().optional(),
  bio: z.string().optional(),
  publicEmail: z.string().optional(),
  customSection: z.string().optional(),
  tags: z.array(z.string()).optional(),
  links: z
    .array(
      z.object({
        platform: z.string().optional(),
        url: z.string().optional(),
        label: z.string().optional(),
      }),
    )
    .optional(),
});

// Update the signed-in user's own profile (display name, bio). Registered
// before "/:username" so the literal "me" segment wins.
userRoutes.patch("/me", jsonBody(updateProfileSchema), async (c) => {
  const viewer = requireUser(c);
  const { user, tags, links } = await usersService.updateProfile(viewer.id, c.req.valid("json"));
  return c.json({ user: publicUser(user, tags, links.map(profileLinkView)) });
});

// Live preview for the profile's custom Markdown section. Goes through the very
// same render + sanitize path as saving, so what the editor shows is exactly
// what will be stored — no second Markdown implementation in the frontend.
userRoutes.post("/me/custom-section/preview", jsonBody(z.object({ customSection: z.string() })), (c) => {
  requireUser(c);
  const source = c.req.valid("json").customSection;
  if (source.length > MAX_CUSTOM_SECTION_LEN) {
    throw badRequest(`Custom section must be ${MAX_CUSTOM_SECTION_LEN.toLocaleString("en-US")} characters or fewer.`);
  }
  return c.json({ html: renderMarkdown(source) });
});

// Toggle the signed-in user's private/public account state. Going public
// auto-approves pending follow requests (handled in the service).
userRoutes.patch("/me/privacy", jsonBody(z.object({ isPrivate: z.boolean() })), async (c) => {
  const viewer = requireUser(c);
  const user = await usersService.setPrivacy(viewer.id, c.req.valid("json").isPrivate);
  return c.json({ user: publicUser(user) });
});

// Pending follow requests to the signed-in (private) user, and approve/reject.
userRoutes.get("/me/follow-requests", async (c) => {
  const viewer = requireUser(c);
  return c.json({ items: await followRequestsService.list(viewer.id) });
});

userRoutes.post("/me/follow-requests/:id/approve", async (c) => {
  const viewer = requireUser(c);
  await followRequestsService.approve(viewer.id, c.req.param("id"));
  return c.json({ ok: true });
});

userRoutes.post("/me/follow-requests/:id/reject", async (c) => {
  const viewer = requireUser(c);
  await followRequestsService.reject(viewer.id, c.req.param("id"));
  return c.json({ ok: true });
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

// Remove a follower — force someone to stop following you without blocking them
// (Instagram/Mastodon "Remove follower"). `:identifier` is a local username or a
// remote user@host handle, as returned by the followers list.
userRoutes.delete("/me/followers/:identifier", async (c) => {
  const viewer = requireUser(c);
  await followsService.removeFollower(viewer.id, c.req.param("identifier"));
  return c.json({ ok: true });
});

// "Who to follow" suggestions (public). Registered before "/:username" so the
// literal "suggested" segment isn't captured as a username.
userRoutes.get("/suggested", async (c) => {
  const viewer = c.get("user");
  return c.json({ items: await usersService.suggestedFollows(viewer?.id ?? null) });
});

// Public profile + the viewer's follow/mute/block state.
userRoutes.get("/:username", async (c) => {
  const viewer = c.get("user");
  const { user, counts, followState, isFollowing, isMuted, isBlocked, locked } = await followsService.profile(
    c.req.param("username"),
    viewer?.id ?? null,
  );
  const tags = await tagsRepo.tagsForUser(user.id);
  const links = await usersService.profileLinks(user.id);
  return c.json({
    user: publicUser(user, tags, links.map(profileLinkView), { locked }),
    counts,
    followState,
    isFollowing,
    isMuted,
    isBlocked,
    locked,
  });
});

// Public follower / following lists for a profile (local + cached remote).
userRoutes.get("/:username/followers", async (c) => {
  const viewer = c.get("user");
  return c.json({
    items: await followsService.followersOf(c.req.param("username"), viewer?.id ?? null),
  });
});

userRoutes.get("/:username/following", async (c) => {
  const viewer = c.get("user");
  return c.json({
    items: await followsService.followingOf(c.req.param("username"), viewer?.id ?? null),
  });
});

// A user's posts (public, cursor-paginated). Filtered by the viewer's mutes/blocks.
userRoutes.get("/:username/posts", async (c) => {
  const viewer = c.get("user");
  const user = await usersRepo.findByUsername(c.req.param("username"));
  if (!user) throw notFound("User not found.");
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = await postsService.listByAuthor(user.id, cursor, viewer?.id ?? null);
  return c.json({ items: await enrichPosts(items, viewer?.id ?? null), nextCursor });
});

// A user's "Recommendations" tab (public, cursor-paginated): posts they've
// recommended, newest-recommended first. Filtered by the viewer's mutes/blocks
// and the recommended posts' own visibility, same as /:username/posts.
userRoutes.get("/:username/recommendations", async (c) => {
  const viewer = c.get("user");
  const user = await usersRepo.findByUsername(c.req.param("username"));
  if (!user) throw notFound("User not found.");
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = await recommendationsService.listByUser(user.id, viewer?.id ?? null, cursor);
  return c.json({ items: await enrichPosts(items, viewer?.id ?? null), nextCursor });
});

// Follow / unfollow (auth required).
userRoutes.post("/:username/follow", async (c) => {
  const viewer = requireUser(c);
  const { state } = await followsService.follow(viewer.id, c.req.param("username"));
  return c.json({ ok: true, state }, 201);
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
