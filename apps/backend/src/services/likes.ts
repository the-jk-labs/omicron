import * as likesRepo from "@/db/repositories/likes.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import { notFound } from "@/lib/http.ts";

// Business logic for likes. Returns the fresh stats so the client can update
// the count + toggle state without a second request.

async function statsOf(postId: string, viewerId: string): Promise<likesRepo.LikeStats> {
  const map = await likesRepo.statsFor([postId], viewerId);
  return map.get(postId) ?? { count: 0, liked: false };
}

export async function like(userId: string, postId: string) {
  if (!(await postsRepo.findById(postId))) throw notFound("Post not found.");
  await likesRepo.add(postId, userId);
  return statsOf(postId, userId);
}

export async function unlike(userId: string, postId: string) {
  if (!(await postsRepo.findById(postId))) throw notFound("Post not found.");
  await likesRepo.remove(postId, userId);
  return statsOf(postId, userId);
}
