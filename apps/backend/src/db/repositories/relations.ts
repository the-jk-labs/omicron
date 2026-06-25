// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { blocks, mutes, remoteActors, users } from "@/db/schema.ts";

// DB access for the two personal-moderation edges (mutes and blocks). Both
// tables are structurally identical, so one module serves both, selected by
// `kind`. Targets are either a local user or a cached remote actor.

export type RelationKind = "mute" | "block";

function table(kind: RelationKind) {
  return kind === "mute" ? mutes : blocks;
}

export async function addLocal(kind: RelationKind, userId: string, targetUserId: string) {
  await db.insert(table(kind)).values({ userId, targetUserId }).onConflictDoNothing();
}

export async function addRemote(kind: RelationKind, userId: string, targetRemoteActorId: string) {
  await db.insert(table(kind)).values({ userId, targetRemoteActorId }).onConflictDoNothing();
}

export async function removeLocal(kind: RelationKind, userId: string, targetUserId: string) {
  const t = table(kind);
  await db.delete(t).where(and(eq(t.userId, userId), eq(t.targetUserId, targetUserId)));
}

export async function removeRemote(
  kind: RelationKind,
  userId: string,
  targetRemoteActorId: string,
) {
  const t = table(kind);
  await db.delete(t).where(
    and(eq(t.userId, userId), eq(t.targetRemoteActorId, targetRemoteActorId)),
  );
}

export async function hasLocal(
  kind: RelationKind,
  userId: string,
  targetUserId: string,
): Promise<boolean> {
  const t = table(kind);
  const row = await db.select({ id: t.id }).from(t).where(
    and(eq(t.userId, userId), eq(t.targetUserId, targetUserId)),
  ).limit(1);
  return row.length > 0;
}

export async function hasRemote(
  kind: RelationKind,
  userId: string,
  targetRemoteActorId: string,
): Promise<boolean> {
  const t = table(kind);
  const row = await db.select({ id: t.id }).from(t).where(
    and(eq(t.userId, userId), eq(t.targetRemoteActorId, targetRemoteActorId)),
  ).limit(1);
  return row.length > 0;
}

// Local targets of a relation, newest first, joined to the local user.
export function listLocalTargets(kind: RelationKind, userId: string) {
  const t = table(kind);
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(t)
    .innerJoin(users, eq(t.targetUserId, users.id))
    .where(eq(t.userId, userId))
    .orderBy(t.createdAt);
}

// Remote targets of a relation, joined to the cached actor.
export function listRemoteTargets(kind: RelationKind, userId: string) {
  const t = table(kind);
  return db
    .select({
      id: remoteActors.id,
      handle: remoteActors.handle,
      displayName: remoteActors.displayName,
      avatarUrl: remoteActors.avatarUrl,
    })
    .from(t)
    .innerJoin(remoteActors, eq(t.targetRemoteActorId, remoteActors.id))
    .where(eq(t.userId, userId))
    .orderBy(t.createdAt);
}
