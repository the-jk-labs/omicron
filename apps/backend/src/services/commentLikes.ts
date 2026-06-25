// SPDX-License-Identifier: AGPL-3.0-or-later
import * as commentLikesRepo from "@/db/repositories/commentLikes.ts";
import * as commentsRepo from "@/db/repositories/comments.ts";
import { notFound } from "@/lib/http.ts";

// Business logic for comment likes. Returns fresh stats so the client can
// update the count + toggle state without a second request.

async function statsOf(commentId: string, viewerId: string): Promise<commentLikesRepo.LikeStats> {
  const map = await commentLikesRepo.statsFor([commentId], viewerId);
  return map.get(commentId) ?? { count: 0, liked: false };
}

export async function like(userId: string, commentId: string) {
  if (!(await commentsRepo.findById(commentId))) throw notFound("Comment not found.");
  await commentLikesRepo.add(commentId, userId);
  return statsOf(commentId, userId);
}

export async function unlike(userId: string, commentId: string) {
  if (!(await commentsRepo.findById(commentId))) throw notFound("Comment not found.");
  await commentLikesRepo.remove(commentId, userId);
  return statsOf(commentId, userId);
}
