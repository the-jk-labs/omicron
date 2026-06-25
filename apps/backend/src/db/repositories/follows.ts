// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, isNotNull, sql } from "drizzle-orm";
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
export function listLocalFollowing(followerId: string) {
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(follows)
    .innerJoin(users, eq(follows.followeeId, users.id))
    .where(eq(follows.followerId, followerId))
    .orderBy(follows.createdAt);
}

// Local accounts that follow this user.
export function listLocalFollowers(followeeId: string) {
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(follows)
    .innerJoin(users, eq(follows.followerId, users.id))
    .where(eq(follows.followeeId, followeeId))
    .orderBy(follows.createdAt);
}

// Remote actors that follow this user — only those we've cached (matched by
// their actor URI). Uncached inbound followers carry only a URI and are omitted.
export function listRemoteFollowers(followeeId: string) {
  return db
    .select({
      id: remoteActors.id,
      handle: remoteActors.handle,
      displayName: remoteActors.displayName,
      avatarUrl: remoteActors.avatarUrl,
    })
    .from(follows)
    .innerJoin(remoteActors, eq(follows.remoteActor, remoteActors.apId))
    .where(eq(follows.followeeId, followeeId))
    .orderBy(follows.createdAt);
}

// Remote actors this user follows, joined to the cached actor.
export function listRemoteFollowing(followerId: string) {
  return db
    .select({
      id: remoteActors.id,
      handle: remoteActors.handle,
      displayName: remoteActors.displayName,
      avatarUrl: remoteActors.avatarUrl,
    })
    .from(follows)
    .innerJoin(remoteActors, eq(follows.remoteFolloweeId, remoteActors.id))
    .where(eq(follows.followerId, followerId))
    .orderBy(follows.createdAt);
}
