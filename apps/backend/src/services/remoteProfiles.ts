// SPDX-License-Identifier: AGPL-3.0-or-later
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import { fetchOutboxPosts, resolveActor } from "@/federation/remote.ts";
import { queue } from "@/queue/queue.ts";
import { type Cursor, DEFAULT_PAGE_SIZE, encodeCursor } from "@/lib/pagination.ts";
import { notFound } from "@/lib/http.ts";
import type { RemoteActor } from "@/db/schema.ts";

// Read-side federation: resolve `user@host`, cache the actor + their outbox,
// and serve both from our DB. Cached data is refreshed when older than the TTL
// so repeat views are cheap and don't hammer the origin instance.

const STALE_AFTER_MS = 15 * 60 * 1000;

function isFresh(actor: RemoteActor): boolean {
  return Date.now() - actor.fetchedAt.getTime() < STALE_AFTER_MS;
}

// Returns the cached actor, resolving (or refreshing) it as needed.
export async function getProfile(handle: string): Promise<RemoteActor> {
  const cached = await remoteActorsRepo.findByHandle(handle);
  if (cached && isFresh(cached)) return cached;
  const resolved = await resolveActor(handle);
  if (resolved) return resolved;
  if (cached) return cached; // serve stale data rather than fail
  throw notFound("Remote user not found.");
}

// Profile plus whether `viewerId` follows this remote actor.
export async function getProfileView(handle: string, viewerId: string | null) {
  const actor = await getProfile(handle);
  const isFollowing = viewerId ? await followsRepo.isFollowingRemote(viewerId, actor.id) : false;
  const isMuted = viewerId ? await relationsRepo.hasRemote("mute", viewerId, actor.id) : false;
  const isBlocked = viewerId ? await relationsRepo.hasRemote("block", viewerId, actor.id) : false;
  const tags = await tagsRepo.tagsForRemoteActor(actor.id);
  return { actor, isFollowing, isMuted, isBlocked, tags };
}

// Follow a remote actor: record the edge, crawl their recent posts so the
// viewer's feed isn't empty until the first delivery, and send a signed Follow.
export async function follow(viewerId: string, handle: string): Promise<void> {
  const actor = await getProfile(handle);
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

export async function getPosts(
  handle: string,
  cursor: Cursor | null,
  viewerId: string | null = null,
) {
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
    nextCursor: hasMore && last
      ? encodeCursor({ createdAt: last.post.createdAt.toISOString(), id: last.post.id })
      : null,
  };
}
