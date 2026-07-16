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

// Follow (or request to follow) a local user. Public accounts approve instantly
// and the follower gets a "follow" notification; private accounts hold the edge
// unapproved (a follow request) and the owner gets a "follow_request" they must
// approve. Returns the resulting state so the caller can reflect it in the UI.
export async function follow(
  followerId: string,
  targetUsername: string,
): Promise<{ state: "requested" | "following" }> {
  const target = await usersRepo.findByUsername(targetUsername);
  if (!target) throw notFound("User not found.");
  if (target.id === followerId) throw badRequest("You cannot follow yourself.");
  // A block (either direction) forbids following — the blocked user can't
  // re-follow, and the blocker can't follow whom they've blocked.
  if (await relationsRepo.localBlockExists(followerId, target.id)) {
    throw forbidden("You cannot follow this user.");
  }
  // An existing edge (already following, or already requested) is left as-is so
  // a repeat click doesn't churn state or re-notify.
  const existing = await followsRepo.followState(followerId, target.id);
  if (existing !== "none") return { state: existing };

  if (target.isPrivate) {
    await followsRepo.createLocal(followerId, target.id, false);
    await notifications.notify({
      recipientId: target.id,
      type: "follow_request",
      actorId: followerId,
    });
    return { state: "requested" };
  }
  await followsRepo.createLocal(followerId, target.id, true);
  await notifications.notify({ recipientId: target.id, type: "follow", actorId: followerId });
  return { state: "following" };
}

// Unfollow, or cancel a pending follow request. Removes the edge either way and
// clears whichever notification it produced (follow or follow_request).
export async function unfollow(followerId: string, targetUsername: string) {
  const target = await usersRepo.findByUsername(targetUsername);
  if (!target) throw notFound("User not found.");
  await followsRepo.removeLocal(followerId, target.id);
  await notifications.unnotify({ recipientId: target.id, type: "follow", actorId: followerId });
  await notifications.unnotify({
    recipientId: target.id,
    type: "follow_request",
    actorId: followerId,
  });
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
  const state = viewerId && viewerId !== user.id
    ? await followsRepo.followState(viewerId, user.id)
    : "none";
  const isFollowing = state === "following";
  const isMuted = viewerId ? await relationsRepo.hasLocal("mute", viewerId, user.id) : false;
  const isBlocked = viewerId ? await relationsRepo.hasLocal("block", viewerId, user.id) : false;
  // A private profile is "locked" for everyone except its owner and approved
  // followers: the header + counts still render, but posts and the
  // follower/following lists are withheld (see followersOf/followingOf).
  const isSelf = viewerId === user.id;
  const locked = user.isPrivate && !isSelf && state !== "following";
  return { user, counts, followState: state, isFollowing, isMuted, isBlocked, locked };
}

// Whether `viewerId` may see a user's posts / follower lists — the owner or an
// approved follower of a private account, or anyone for a public account.
async function canViewPrivate(user: { id: string; isPrivate: boolean }, viewerId: string | null) {
  if (!user.isPrivate) return true;
  if (viewerId === user.id) return true;
  return viewerId ? await followsRepo.isFollowing(viewerId, user.id) : false;
}

// Public follower / following lists for a user's profile (local + cached remote
// accounts), as a flat, uniform actor list.
export async function followersOf(username: string, viewerId: string | null = null) {
  const user = await usersRepo.findByUsername(username);
  if (!user) throw notFound("User not found.");
  // A locked private profile hides its follower list from non-followers.
  if (!await canViewPrivate(user, viewerId)) return [];
  const [local, remote] = await Promise.all([
    followsRepo.listLocalFollowers(user.id, viewerId),
    followsRepo.listRemoteFollowers(user.id, viewerId),
  ]);
  return [...local.map(relationActorLocal), ...remote.map(relationActorRemote)];
}

export async function followingOf(username: string, viewerId: string | null = null) {
  const user = await usersRepo.findByUsername(username);
  if (!user) throw notFound("User not found.");
  // A locked private profile hides its following list from non-followers.
  if (!await canViewPrivate(user, viewerId)) return [];
  const [local, remote] = await Promise.all([
    followsRepo.listLocalFollowing(user.id, viewerId),
    followsRepo.listRemoteFollowing(user.id, viewerId),
  ]);
  return [...local.map(relationActorLocal), ...remote.map(relationActorRemote)];
}
