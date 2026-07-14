// SPDX-License-Identifier: AGPL-3.0-or-later
import * as followsRepo from "@/db/repositories/follows.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import { relationActorLocal, relationActorRemote } from "@/routes/serializers.ts";
import { badRequest, forbidden, notFound } from "@/lib/http.ts";

// Business logic for the follow system. Remote actors (federation) are handled
// elsewhere; this covers local user → local user follows.

export async function follow(followerId: string, targetUsername: string) {
  const target = await usersRepo.findByUsername(targetUsername);
  if (!target) throw notFound("User not found.");
  if (target.id === followerId) throw badRequest("You cannot follow yourself.");
  // A block (either direction) forbids following — the blocked user can't
  // re-follow, and the blocker can't follow whom they've blocked.
  if (await relationsRepo.localBlockExists(followerId, target.id)) {
    throw forbidden("You cannot follow this user.");
  }
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
  // A block (either direction) makes the two users invisible to each other, so
  // the blocked profile reads as not-found rather than rendering the header,
  // counts and bio. Unblocking is done from the Connections settings, not here.
  if (viewerId && viewerId !== user.id && await relationsRepo.localBlockExists(viewerId, user.id)) {
    throw notFound("User not found.");
  }
  const counts = await followsRepo.counts(user.id);
  const isFollowing = viewerId ? await followsRepo.isFollowing(viewerId, user.id) : false;
  const isMuted = viewerId ? await relationsRepo.hasLocal("mute", viewerId, user.id) : false;
  const isBlocked = viewerId ? await relationsRepo.hasLocal("block", viewerId, user.id) : false;
  return { user, counts, isFollowing, isMuted, isBlocked };
}

// Public follower / following lists for a user's profile (local + cached remote
// accounts), as a flat, uniform actor list.
export async function followersOf(username: string, viewerId: string | null = null) {
  const user = await usersRepo.findByUsername(username);
  if (!user) throw notFound("User not found.");
  const [local, remote] = await Promise.all([
    followsRepo.listLocalFollowers(user.id, viewerId),
    followsRepo.listRemoteFollowers(user.id, viewerId),
  ]);
  return [...local.map(relationActorLocal), ...remote.map(relationActorRemote)];
}

export async function followingOf(username: string, viewerId: string | null = null) {
  const user = await usersRepo.findByUsername(username);
  if (!user) throw notFound("User not found.");
  const [local, remote] = await Promise.all([
    followsRepo.listLocalFollowing(user.id, viewerId),
    followsRepo.listRemoteFollowing(user.id, viewerId),
  ]);
  return [...local.map(relationActorLocal), ...remote.map(relationActorRemote)];
}
