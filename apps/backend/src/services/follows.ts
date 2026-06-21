import * as followsRepo from "@/db/repositories/follows.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { badRequest, notFound } from "@/lib/http.ts";

// Business logic for the follow system. Remote actors (federation) are handled
// elsewhere; this covers local user → local user follows.

export async function follow(followerId: string, targetUsername: string) {
  const target = await usersRepo.findByUsername(targetUsername);
  if (!target) throw notFound("User not found.");
  if (target.id === followerId) throw badRequest("You cannot follow yourself.");
  await followsRepo.createLocal(followerId, target.id);
}

export async function unfollow(followerId: string, targetUsername: string) {
  const target = await usersRepo.findByUsername(targetUsername);
  if (!target) throw notFound("User not found.");
  await followsRepo.removeLocal(followerId, target.id);
}

// Public profile view: user + follower/following counts + whether `viewerId`
// already follows them.
export async function profile(username: string, viewerId: string | null) {
  const user = await usersRepo.findByUsername(username);
  if (!user) throw notFound("User not found.");
  const counts = await followsRepo.counts(user.id);
  const isFollowing = viewerId ? await followsRepo.isFollowing(viewerId, user.id) : false;
  return { user, counts, isFollowing };
}
