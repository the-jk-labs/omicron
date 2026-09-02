// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono, type Context } from "hono";
import { config } from "@/config.ts";
import { notFound } from "@/lib/http.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { clientIp, rateLimit } from "@/lib/rateLimit.ts";
import { requireUser } from "@/routes/middleware.ts";
import { remoteProfile } from "@/routes/serializers.ts";
import type { AppEnv } from "@/routes/types.ts";
import { enrichPosts } from "@/services/engagement.ts";
import { federationRunning } from "@/services/federationState.ts";
import * as recommendationsService from "@/services/recommendations.ts";
import * as relationsService from "@/services/relations.ts";
import * as remoteProfilesService from "@/services/remoteProfiles.ts";

// Read-only browsing of remote fediverse actors and their posts. Mounted under
// /api/remote. Returns 404 entirely when federation is disabled so the
// standalone blog exposes no ActivityPub surface.
export const remoteRoutes = new Hono<AppEnv>();

remoteRoutes.use("*", async (_c, next) => {
  if (!federationRunning()) throw notFound("Federation is disabled.");
  await next();
});

// The three GET discovery routes below can reach out to remote servers and write
// rows on a cache miss, so unlike the general READ_METHODS bypass (which assumes
// reads are cheap) anonymous callers to them get a per-IP budget. Auth-gated
// mutation routes (follow/mute/block) already ride the general write limiter.
const discoveryLimiter = rateLimit({
  name: "remote-discovery",
  windowMs: 60_000,
  max: config.RL_REMOTE_MAX,
  key: (c) => `ip:${clientIp(c)}`,
});

remoteRoutes.use("/users/:handle", (c, next) =>
  c.req.method === "GET" && !c.get("user") ? discoveryLimiter(c, next) : next(),
);

// A stable per-caller key for the stricter cache-miss budget: signed-in users
// keyed by id, anonymous callers by IP — the same convention as the general
// write limiter, so a signed-in user and an anonymous browser never share a
// bucket.
function callerKey(c: Context): string {
  const user = c.get("user");
  return user ? `u:${user.id}` : `ip:${clientIp(c)}`;
}

remoteRoutes.get("/users/:handle", async (c) => {
  const viewer = c.get("user");
  const handle = c.req.param("handle");
  const { actor, isFollowing, isMuted, isBlocked, tags } = await remoteProfilesService.getProfileView(
    handle,
    viewer?.id ?? null,
    callerKey(c),
  );
  return c.json(remoteProfile(actor, isFollowing, { isMuted, isBlocked }, tags));
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
  const { items, nextCursor } = await remoteProfilesService.getPosts(handle, cursor, viewer?.id ?? null, callerKey(c));
  return c.json({ items: await enrichPosts(items, viewer?.id ?? null), nextCursor });
});

// A remote actor's "Recommendations" tab: posts they've boosted (recorded from
// an inbound Announce), newest-recommended first.
remoteRoutes.get("/users/:handle/recommendations", async (c) => {
  const viewer = c.get("user");
  const handle = c.req.param("handle");
  const cursor = decodeCursor(c.req.query("cursor"));
  const actor = await remoteProfilesService.getProfile(handle, callerKey(c));
  const { items, nextCursor } = await recommendationsService.listByRemoteActor(actor.id, viewer?.id ?? null, cursor);
  return c.json({ items: await enrichPosts(items, viewer?.id ?? null), nextCursor });
});
