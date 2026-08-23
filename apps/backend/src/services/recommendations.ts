import * as postsRepo from "@/db/repositories/posts.ts";
// SPDX-License-Identifier: AGPL-3.0-or-later
import * as recommendationsRepo from "@/db/repositories/recommendations.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import { forbidden, notFound } from "@/lib/http.ts";
import { type Cursor, DEFAULT_PAGE_SIZE, encodeCursor } from "@/lib/pagination.ts";
import { queue } from "@/queue/queue.ts";
import * as notifications from "@/services/notifications.ts";

// Business logic for recommending ("reposting") a post — federates as an
// ActivityPub Announce/Undo(Announce) to the recommender's remote followers.
// recommend/unrecommend mirror services/likes.ts: they return fresh stats so
// the client can update the count + toggle state without a second request.

async function statsOf(postId: string, viewerId: string): Promise<recommendationsRepo.RecommendStats> {
  const map = await recommendationsRepo.statsFor([postId], viewerId);
  return map.get(postId) ?? { count: 0, recommended: false };
}

export async function recommend(userId: string, postId: string) {
  const post = await postsRepo.findById(postId);
  if (!post) throw notFound("Post not found.");
  // A block forbids recommending the other party's post (either direction),
  // the same rule liking a post follows.
  const blocked = post.post.authorId
    ? await relationsRepo.localBlockExists(userId, post.post.authorId)
    : post.post.remoteActorId
      ? await relationsRepo.hasRemote("block", userId, post.post.remoteActorId)
      : false;
  if (blocked) throw forbidden("You cannot recommend this post.");

  await recommendationsRepo.add(postId, userId);
  // Notify the post's author (local posts only; a remote post's author has no
  // local recipient — they get an inbound notification instead, once their
  // instance's own Announce delivery reaches us, which doesn't apply here).
  if (post.post.authorId) {
    await notifications.notify({
      recipientId: post.post.authorId,
      type: "recommend",
      actorId: userId,
      postId,
    });
  }
  queue.add("send_recommend", { userId, postId });
  return statsOf(postId, userId);
}

export async function unrecommend(userId: string, postId: string) {
  const post = await postsRepo.findById(postId);
  if (!post) throw notFound("Post not found.");
  await recommendationsRepo.remove(postId, userId);
  if (post.post.authorId) {
    await notifications.unnotify({
      recipientId: post.post.authorId,
      type: "recommend",
      actorId: userId,
      postId,
    });
  }
  queue.add("send_unrecommend", { userId, postId });
  return statsOf(postId, userId);
}

// Cursor-paginated pages of {post, localAuthor, remoteActor, recommendedAt}
// rows, keyed by the recommendation's own (createdAt, id) — the profile
// "Recommendations" tab, local or remote.
function pageOf(rows: recommendationsRepo.RecommendedPostRow[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last ? encodeCursor({ createdAt: last.recommendedAt.toISOString(), id: last.recommendationId }) : null,
  };
}

export async function listByUser(userId: string, viewerId: string | null, cursor: Cursor | null) {
  const rows = await recommendationsRepo.listByUser(userId, viewerId, cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}

export async function listByRemoteActor(remoteActorId: string, viewerId: string | null, cursor: Cursor | null) {
  const rows = await recommendationsRepo.listByRemoteActor(remoteActorId, viewerId, cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}
