// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { follows, remoteActors, users } from "@/db/schema.ts";

// Follow-edge DB access. Supports local↔local and remote↔local rows.

export async function createLocal(followerId: string, followeeId: string) {
  const [row] = await db
    .insert(follows)
    .values({ followerId, followeeId })
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function createRemoteFollower(followeeId: string, remoteActor: string) {
  const [row] = await db
    .insert(follows)
    .values({ followeeId, remoteActor })
    .returning();
  return row;
}

export async function removeLocal(followerId: string, followeeId: string) {
  await db
    .delete(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)));
}

// Removes any follow edge between two local users in EITHER direction. A block
// severs the follow relationship both ways (Mastodon/Instagram), so blocking
// someone you follow — or who follows you — drops both edges at once.
export async function severLocal(a: string, b: string) {
  await db.delete(follows).where(
    or(
      and(eq(follows.followerId, a), eq(follows.followeeId, b)),
      and(eq(follows.followerId, b), eq(follows.followeeId, a)),
    ),
  );
}

export async function removeRemoteFollower(followeeId: string, remoteActor: string) {
  await db
    .delete(follows)
    .where(and(eq(follows.followeeId, followeeId), eq(follows.remoteActor, remoteActor)));
}

export async function isFollowing(followerId: string, followeeId: string): Promise<boolean> {
  const row = await db.query.follows.findFirst({
    where: and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)),
  });
  return !!row;
}

// ── outbound local → remote follows ──────────────────────────────────────

export async function createRemoteFollowing(followerId: string, remoteFolloweeId: string) {
  const [row] = await db
    .insert(follows)
    .values({ followerId, remoteFolloweeId, approved: false })
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function removeRemoteFollowing(followerId: string, remoteFolloweeId: string) {
  await db
    .delete(follows)
    .where(
      and(eq(follows.followerId, followerId), eq(follows.remoteFolloweeId, remoteFolloweeId)),
    );
}

export async function isFollowingRemote(
  followerId: string,
  remoteFolloweeId: string,
): Promise<boolean> {
  const row = await db.query.follows.findFirst({
    where: and(
      eq(follows.followerId, followerId),
      eq(follows.remoteFolloweeId, remoteFolloweeId),
    ),
  });
  return !!row;
}

// Marks an outbound follow approved once the remote actor sends back Accept.
export async function approveRemoteFollowing(followerId: string, remoteFolloweeId: string) {
  await db
    .update(follows)
    .set({ approved: true })
    .where(
      and(eq(follows.followerId, followerId), eq(follows.remoteFolloweeId, remoteFolloweeId)),
    );
}

// Remote follower actor URIs — used for federated delivery of new posts.
export async function remoteFollowerActors(followeeId: string): Promise<string[]> {
  const rows = await db
    .select({ actor: follows.remoteActor })
    .from(follows)
    .where(and(eq(follows.followeeId, followeeId), isNotNull(follows.remoteActor)));
  return rows.map((r: { actor: string | null }) => r.actor!).filter(Boolean);
}

export async function counts(userId: string) {
  const [row] = await db
    .select({
      followers: sql<number>`count(*) filter (where ${follows.followeeId} = ${userId})::int`,
      following: sql<number>`count(*) filter (where ${follows.followerId} = ${userId})::int`,
    })
    .from(follows);
  return { followers: row?.followers ?? 0, following: row?.following ?? 0 };
}

// Local follower usernames — used to build the ActivityPub followers collection.
export async function localFollowerUsernames(followeeId: string): Promise<string[]> {
  const rows = await db
    .select({ username: users.username })
    .from(follows)
    .innerJoin(users, eq(follows.followerId, users.id))
    .where(eq(follows.followeeId, followeeId));
  return rows.map((r: { username: string }) => r.username);
}

// Local accounts this user follows (for the "Following" management list).
// Hides local users the viewer has blocked, or who have blocked the viewer,
// from follower/following lists (blocks are bidirectional locally). Undefined
// for guests, so `and()` drops it and the list is unfiltered when logged out.
function notBlockedLocal(viewerId: string | null) {
  if (!viewerId) return undefined;
  return sql`${users.id} not in (
    select target_user_id from blocks
      where user_id = ${viewerId} and target_user_id is not null
    union
    select user_id from blocks where target_user_id = ${viewerId}
  )`;
}

// Hides remote actors the viewer has blocked from follower/following lists. A
// remote actor cannot block a local viewer, so this is one-directional.
function notBlockedRemote(viewerId: string | null) {
  if (!viewerId) return undefined;
  return sql`${remoteActors.id} not in (
    select target_remote_actor_id from blocks
      where user_id = ${viewerId} and target_remote_actor_id is not null
  )`;
}

export function listLocalFollowing(followerId: string, viewerId: string | null = null) {
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(follows)
    .innerJoin(users, eq(follows.followeeId, users.id))
    .where(and(eq(follows.followerId, followerId), notBlockedLocal(viewerId)))
    .orderBy(follows.createdAt);
}

// Local accounts that follow this user.
export function listLocalFollowers(followeeId: string, viewerId: string | null = null) {
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(follows)
    .innerJoin(users, eq(follows.followerId, users.id))
    .where(and(eq(follows.followeeId, followeeId), notBlockedLocal(viewerId)))
    .orderBy(follows.createdAt);
}

// Remote actors that follow this user — only those we've cached (matched by
// their actor URI). Uncached inbound followers carry only a URI and are omitted.
export function listRemoteFollowers(followeeId: string, viewerId: string | null = null) {
  return db
    .select({
      id: remoteActors.id,
      handle: remoteActors.handle,
      displayName: remoteActors.displayName,
      avatarUrl: remoteActors.avatarUrl,
    })
    .from(follows)
    .innerJoin(remoteActors, eq(follows.remoteActor, remoteActors.apId))
    .where(and(eq(follows.followeeId, followeeId), notBlockedRemote(viewerId)))
    .orderBy(follows.createdAt);
}

// Remote actors this user follows, joined to the cached actor.
export function listRemoteFollowing(followerId: string, viewerId: string | null = null) {
  return db
    .select({
      id: remoteActors.id,
      handle: remoteActors.handle,
      displayName: remoteActors.displayName,
      avatarUrl: remoteActors.avatarUrl,
    })
    .from(follows)
    .innerJoin(remoteActors, eq(follows.remoteFolloweeId, remoteActors.id))
    .where(and(eq(follows.followerId, followerId), notBlockedRemote(viewerId)))
    .orderBy(follows.createdAt);
}
