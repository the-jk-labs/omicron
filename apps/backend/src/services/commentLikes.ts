// SPDX-License-Identifier: AGPL-3.0-or-later
import * as commentLikesRepo from "@/db/repositories/commentLikes.ts";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import { forbidden, notFound } from "@/lib/http.ts";
import * as notifications from "@/services/notifications.ts";

// Business logic for comment likes. Returns fresh stats so the client can
// update the count + toggle state without a second request.

async function statsOf(commentId: string, viewerId: string): Promise<commentLikesRepo.LikeStats> {
  const map = await commentLikesRepo.statsFor([commentId], viewerId);
  return map.get(commentId) ?? { count: 0, liked: false };
}

export async function like(userId: string, commentId: string) {
  const comment = await commentsRepo.findById(commentId);
  if (!comment) throw notFound("Comment not found.");
  // A block forbids liking a blocked user's comment (either direction for a
  // local author; outgoing only for a remote one — inbound remote blocks are
  // invisible here, same as the comment listing).
  if (comment.authorId) {
    if (await relationsRepo.localBlockExists(userId, comment.authorId)) {
      throw forbidden("You cannot like this comment.");
    }
  } else if (comment.remoteActorId && (await relationsRepo.hasRemote("block", userId, comment.remoteActorId))) {
    throw forbidden("You cannot like this comment.");
  }
  await commentLikesRepo.add(commentId, userId);
  // Only a local author can receive an in-app notification; a remote one has
  // no inbox here. (The Like itself stays local-only — it never federates.)
  if (comment.authorId) {
    await notifications.notify({
      recipientId: comment.authorId,
      type: "comment_like",
      actorId: userId,
      postId: comment.postId,
      commentId,
    });
  }
  return statsOf(commentId, userId);
}

export async function unlike(userId: string, commentId: string) {
  const comment = await commentsRepo.findById(commentId);
  if (!comment) throw notFound("Comment not found.");
  await commentLikesRepo.remove(commentId, userId);
  if (comment.authorId) {
    await notifications.unnotify({
      recipientId: comment.authorId,
      type: "comment_like",
      actorId: userId,
      postId: comment.postId,
      commentId,
    });
  }
  return statsOf(commentId, userId);
}
