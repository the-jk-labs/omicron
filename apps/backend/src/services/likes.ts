// SPDX-License-Identifier: AGPL-3.0-or-later
import * as likesRepo from "@/db/repositories/likes.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as notifications from "@/services/notifications.ts";
import { forbidden, notFound } from "@/lib/http.ts";

// Business logic for likes. Returns the fresh stats so the client can update
// the count + toggle state without a second request.

async function statsOf(postId: string, viewerId: string): Promise<likesRepo.LikeStats> {
  const map = await likesRepo.statsFor([postId], viewerId);
  return map.get(postId) ?? { count: 0, liked: false };
}

export async function like(userId: string, postId: string) {
  const post = await postsRepo.findById(postId);
  if (!post) throw notFound("Post not found.");
  // A block forbids liking the other party's post (either direction).
  const blocked = post.post.authorId
    ? await relationsRepo.localBlockExists(userId, post.post.authorId)
    : post.post.remoteActorId
    ? await relationsRepo.hasRemote("block", userId, post.post.remoteActorId)
    : false;
  if (blocked) throw forbidden("You cannot like this post.");
  await likesRepo.add(postId, userId);
  // Notify the post's author (local posts only; remote posts have no local
  // recipient and remote likes aren't federated out from here).
  if (post.post.authorId) {
    await notifications.notify({
      recipientId: post.post.authorId,
      type: "like",
      actorId: userId,
      postId,
    });
  }
  return statsOf(postId, userId);
}

export async function unlike(userId: string, postId: string) {
  const post = await postsRepo.findById(postId);
  if (!post) throw notFound("Post not found.");
  await likesRepo.remove(postId, userId);
  if (post.post.authorId) {
    await notifications.unnotify({
      recipientId: post.post.authorId,
      type: "like",
      actorId: userId,
      postId,
    });
  }
  return statsOf(postId, userId);
}
