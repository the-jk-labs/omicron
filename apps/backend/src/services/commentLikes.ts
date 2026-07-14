// SPDX-License-Identifier: AGPL-3.0-or-later
import * as commentLikesRepo from "@/db/repositories/commentLikes.ts";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import { forbidden, notFound } from "@/lib/http.ts";

// Business logic for comment likes. Returns fresh stats so the client can
// update the count + toggle state without a second request.

async function statsOf(commentId: string, viewerId: string): Promise<commentLikesRepo.LikeStats> {
  const map = await commentLikesRepo.statsFor([commentId], viewerId);
  return map.get(commentId) ?? { count: 0, liked: false };
}

export async function like(userId: string, commentId: string) {
  const comment = await commentsRepo.findById(commentId);
  if (!comment) throw notFound("Comment not found.");
  // A block forbids liking a blocked user's comment (either direction). Comment
  // authors are always local.
  if (await relationsRepo.localBlockExists(userId, comment.authorId)) {
    throw forbidden("You cannot like this comment.");
  }
  await commentLikesRepo.add(commentId, userId);
  return statsOf(commentId, userId);
}

export async function unlike(userId: string, commentId: string) {
  if (!(await commentsRepo.findById(commentId))) throw notFound("Comment not found.");
  await commentLikesRepo.remove(commentId, userId);
  return statsOf(commentId, userId);
}
