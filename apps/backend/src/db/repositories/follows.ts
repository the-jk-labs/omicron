// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { follows, users } from "@/db/schema.ts";

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

export function listFollowing(followerId: string) {
  return db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(follows)
    .innerJoin(users, eq(follows.followeeId, users.id))
    .where(eq(follows.followerId, followerId));
}