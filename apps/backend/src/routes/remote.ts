// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { config } from "@/config.ts";
import * as remoteProfilesService from "@/services/remoteProfiles.ts";
import * as relationsService from "@/services/relations.ts";
import { enrichPosts } from "@/services/engagement.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { remoteProfile } from "@/routes/serializers.ts";
import { notFound } from "@/lib/http.ts";
import { requireUser } from "@/routes/middleware.ts";
import type { AppEnv } from "@/routes/types.ts";

// Read-only browsing of remote fediverse actors and their posts. Mounted under
// /api/remote. Returns 404 entirely when federation is disabled so the
// standalone blog exposes no ActivityPub surface.
export const remoteRoutes = new Hono<AppEnv>();

remoteRoutes.use("*", async (_c, next) => {
  if (!config.FEDERATION_ENABLED) throw notFound("Federation is disabled.");
  await next();
});

// Remote profile by `user@host` handle (includes follow/mute/block state).
remoteRoutes.get("/users/:handle", async (c) => {
  const viewer = c.get("user");
  const handle = c.req.param("handle");
  const { actor, isFollowing, isMuted, isBlocked } = await remoteProfilesService.getProfileView(
    handle,
    viewer?.id ?? null,
  );
  return c.json(remoteProfile(actor, isFollowing, { isMuted, isBlocked }));
});

// Follow / unfollow a remote actor (auth required).
remoteRoutes.post("/users/:handle/follow", async (c) => {
  const viewer = requireUser(c);
  await remoteProfilesService.follow(viewer.id, c.req.param("handle"));
  return c.json({ ok: true }, 201);
});

remoteRoutes.delete("/users/:handle/follow", async (c) => {
  const viewer = requireUser(c);
  await remoteProfilesService.unfollow(viewer.id, c.req.param("handle"));
  return c.json({ ok: true });
});

// Mute / unmute a remote actor (auth required). Local-only hiding.
remoteRoutes.post("/users/:handle/mute", async (c) => {
  const viewer = requireUser(c);
  await relationsService.setRemote("mute", viewer.id, c.req.param("handle"), true);
  return c.json({ ok: true }, 201);
});

remoteRoutes.delete("/users/:handle/mute", async (c) => {
  const viewer = requireUser(c);
  await relationsService.setRemote("mute", viewer.id, c.req.param("handle"), false);
  return c.json({ ok: true });
});

// Block / unblock a remote actor (auth required). Local-only, not federated.
remoteRoutes.post("/users/:handle/block", async (c) => {
  const viewer = requireUser(c);
  await relationsService.setRemote("block", viewer.id, c.req.param("handle"), true);
  return c.json({ ok: true }, 201);
});

remoteRoutes.delete("/users/:handle/block", async (c) => {
  const viewer = requireUser(c);
  await relationsService.setRemote("block", viewer.id, c.req.param("handle"), false);
  return c.json({ ok: true });
});

// A remote actor's posts (their cached outbox), cursor-paginated.
remoteRoutes.get("/users/:handle/posts", async (c) => {
  const viewer = c.get("user");
  const handle = c.req.param("handle");
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = await remoteProfilesService.getPosts(
    handle,
    cursor,
    viewer?.id ?? null,
  );
  return c.json({ items: await enrichPosts(items, viewer?.id ?? null), nextCursor });
});
