import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
// SPDX-License-Identifier: AGPL-3.0-or-later
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import type { RemoteActor } from "@/db/schema.ts";
import { negativeCached, setNegativeCached, singleFlight } from "@/federation/outboundGuard.ts";
import { fetchOutboxPosts, resolveActor } from "@/federation/remote.ts";
import { forbidden, notFound } from "@/lib/http.ts";
import { type Cursor, DEFAULT_PAGE_SIZE, encodeCursor } from "@/lib/pagination.ts";
import { queue } from "@/queue/queue.ts";

// Read-side federation: resolve `user@host`, cache the actor + their outbox,
// and serve both from our DB. Cached data is refreshed when older than the TTL
// so repeat views are cheap and don't hammer the origin instance.

const STALE_AFTER_MS = 15 * 60 * 1000;

function isFresh(actor: RemoteActor): boolean {
  return Date.now() - actor.fetchedAt.getTime() < STALE_AFTER_MS;
}

// Returns the cached actor, resolving (or refreshing) it as needed.
//
// Resolution is coalesced per normalized handle (single-flight) so concurrent
// requests for the same uncached handle share one lookup, and failures are
// negatively cached for a short window so a missing/slow handle isn't re-resolved
// on every request.
export async function getProfile(handle: string): Promise<RemoteActor> {
  const cached = await remoteActorsRepo.findByHandle(handle);
  if (cached && isFresh(cached)) return cached;

  // A recent failed resolution: serve stale data if we have it, otherwise fail
  // fast without burning another outbound lookup.
  if (negativeCached(handle)) {
    if (cached) return cached;
    throw notFound("Remote user not found.");
  }

  const resolved = await singleFlight(handle, () => resolveActor(handle));
  if (resolved) return resolved;
  if (cached) return cached; // serve stale data rather than fail
  setNegativeCached(handle);
  throw notFound("Remote user not found.");
}

// Profile plus whether `viewerId` follows this remote actor.
export async function getProfileView(handle: string, viewerId: string | null) {
  const actor = await getProfile(handle);
  // A blocked remote actor is invisible to the viewer, same as a blocked local
  // user — the profile reads as not-found. Unblock from Connections settings.
  if (viewerId && (await relationsRepo.hasRemote("block", viewerId, actor.id))) {
    throw notFound("Remote user not found.");
  }
  const isFollowing = viewerId ? await followsRepo.isFollowingRemote(viewerId, actor.id) : false;
  const isMuted = viewerId ? await relationsRepo.hasRemote("mute", viewerId, actor.id) : false;
  const tags = await tagsRepo.tagsForRemoteActor(actor.id);
  // isBlocked is always false here — a blocked actor 404s above; kept in the
  // shape so the serializer's block/mute menu state stays uniform with local.
  return { actor, isFollowing, isMuted, isBlocked: false, tags };
}

// Follow a remote actor: record the edge, crawl their recent posts so the
// viewer's feed isn't empty until the first delivery, and send a signed Follow.
export async function follow(viewerId: string, handle: string): Promise<void> {
  const actor = await getProfile(handle);
  if (await relationsRepo.hasRemote("block", viewerId, actor.id)) {
    throw forbidden("You cannot follow an account you have blocked.");
  }
  await followsRepo.createRemoteFollowing(viewerId, actor.id);
  await fetchOutboxPosts(handle, actor.id);
  queue.add("send_follow", { followerId: viewerId, targetActor: actor.apId });
}

export async function unfollow(viewerId: string, handle: string): Promise<void> {
  const actor = await remoteActorsRepo.findByHandle(handle);
  if (!actor) throw notFound("Remote user not found.");
  await followsRepo.removeRemoteFollowing(viewerId, actor.id);
  queue.add("send_unfollow", { followerId: viewerId, targetActor: actor.apId });
}

export async function getPosts(handle: string, cursor: Cursor | null, viewerId: string | null = null) {
  const actor = await getProfile(handle);
  // Only re-crawl the outbox on the first page, and only when stale, so
  // pagination stays cheap and stable.
  if (!cursor && !isFresh(actor)) {
    await fetchOutboxPosts(handle, actor.id);
  } else if (!cursor) {
    // Fresh-but-empty (e.g. first ever view in the same TTL window): ensure we
    // have at least crawled once.
    const existing = await postsRepo.listByRemoteActor(actor.id, null, null, 1);
    if (existing.length === 0) await fetchOutboxPosts(handle, actor.id);
  }

  const rows = await postsRepo.listByRemoteActor(actor.id, viewerId, cursor, DEFAULT_PAGE_SIZE);
  const hasMore = rows.length > DEFAULT_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, DEFAULT_PAGE_SIZE) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last ? encodeCursor({ createdAt: last.post.createdAt.toISOString(), id: last.post.id }) : null,
  };
}
