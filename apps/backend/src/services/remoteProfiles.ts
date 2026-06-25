// SPDX-License-Identifier: AGPL-3.0-or-later
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import { resolveActor, fetchOutboxPosts } from "@/federation/remote.ts";
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

export async function getPosts(handle: string, cursor: Cursor | null) {
  const actor = await getProfile(handle);
  // Only re-crawl the outbox on the first page, and only when stale, so
  // pagination stays cheap and stable.
  if (!cursor && !isFresh(actor)) {
    await fetchOutboxPosts(handle, actor.id);
  } else if (!cursor) {
    // Fresh-but-empty (e.g. first ever view in the same TTL window): ensure we
    // have at least crawled once.
    const existing = await postsRepo.listByRemoteActor(actor.id, null, 1);
    if (existing.length === 0) await fetchOutboxPosts(handle, actor.id);
  }

  const rows = await postsRepo.listByRemoteActor(actor.id, cursor, DEFAULT_PAGE_SIZE);
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
