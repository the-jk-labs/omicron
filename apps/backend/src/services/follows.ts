// SPDX-License-Identifier: AGPL-3.0-or-later
import * as followsRepo from "@/db/repositories/follows.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import { relationActorLocal, relationActorRemote } from "@/routes/serializers.ts";
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
  const isMuted = viewerId ? await relationsRepo.hasLocal("mute", viewerId, user.id) : false;
  const isBlocked = viewerId ? await relationsRepo.hasLocal("block", viewerId, user.id) : false;
  return { user, counts, isFollowing, isMuted, isBlocked };
}

// Public follower / following lists for a user's profile (local + cached remote
// accounts), as a flat, uniform actor list.
export async function followersOf(username: string) {
  const user = await usersRepo.findByUsername(username);
  if (!user) throw notFound("User not found.");
  const [local, remote] = await Promise.all([
    followsRepo.listLocalFollowers(user.id),
    followsRepo.listRemoteFollowers(user.id),
  ]);
  return [...local.map(relationActorLocal), ...remote.map(relationActorRemote)];
}

export async function followingOf(username: string) {
  const user = await usersRepo.findByUsername(username);
  if (!user) throw notFound("User not found.");
  const [local, remote] = await Promise.all([
    followsRepo.listLocalFollowing(user.id),
    followsRepo.listRemoteFollowing(user.id),
  ]);
  return [...local.map(relationActorLocal), ...remote.map(relationActorRemote)];
}
