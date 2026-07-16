// SPDX-License-Identifier: AGPL-3.0-or-later
import * as followsRepo from "@/db/repositories/follows.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as notifications from "@/services/notifications.ts";
import { relationActorLocal, relationActorRemote } from "@/routes/serializers.ts";
import { badRequest, forbidden, notFound } from "@/lib/http.ts";
import { isRemoteHandle } from "@/lib/handles.ts";
import { queue } from "@/queue/queue.ts";

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
  await notifications.notify({ recipientId: target.id, type: "follow", actorId: followerId });
}

export async function unfollow(followerId: string, targetUsername: string) {
  const target = await usersRepo.findByUsername(targetUsername);
  if (!target) throw notFound("User not found.");
  await followsRepo.removeLocal(followerId, target.id);
  await notifications.unnotify({ recipientId: target.id, type: "follow", actorId: followerId });
}

// Removes a follower — the "Remove follower" action (Instagram/Mastodon): the
// signed-in user forcibly drops someone from their own followers list without
// blocking them. `identifier` is a local username or a remote `user@host`
// handle (as returned by the followers list). Local followers are dropped
// directly; remote followers also get a Reject(Follow) so their instance
// severs its side. Nothing stops them following again later (that's a block).
export async function removeFollower(userId: string, identifier: string) {
  // A `@` marks a remote handle; local usernames never contain one.
  if (isRemoteHandle(identifier)) {
    const actor = await remoteActorsRepo.findByHandle(identifier);
    if (!actor) throw notFound("Follower not found.");
    await followsRepo.removeRemoteFollower(userId, actor.apId);
    queue.add("send_reject_follow", { userId, targetActor: actor.apId });
    return;
  }
  const follower = await usersRepo.findByUsername(identifier);
  if (!follower) throw notFound("Follower not found.");
  // Drop the edge where `follower` follows `userId` (them → me).
  await followsRepo.removeLocal(follower.id, userId);
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
