// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import {
  blocks,
  follows,
  mutes,
  notifications,
  recommendations,
  type NewRemoteActor,
  remoteActors,
} from "@/db/schema.ts";

// Cached fediverse actors. Services/routes never touch `db` directly.

export function findByHandle(handle: string) {
  return db.query.remoteActors.findFirst({ where: eq(remoteActors.handle, handle) });
}

// Find already-cached remote actors by handle or display name. This only sees
// actors this instance has encountered before — it never crawls the fediverse.
export function search(query: string, limit = 10) {
  const term = `%${query.replace(/[%_\\]/g, "\\$&")}%`;
  return db
    .select({
      id: remoteActors.id,
      handle: remoteActors.handle,
      displayName: remoteActors.displayName,
      avatarUrl: remoteActors.avatarUrl,
    })
    .from(remoteActors)
    .where(or(ilike(remoteActors.handle, term), ilike(remoteActors.displayName, term)))
    .orderBy(remoteActors.displayName)
    .limit(limit);
}

export function findByApId(apId: string) {
  return db.query.remoteActors.findFirst({ where: eq(remoteActors.apId, apId) });
}

// Removes a cached actor by its ActivityPub id (their posts, follow edges, etc.
// cascade via FKs). Used by the inbound Delete(Actor) handler. Returns whether a
// row was removed.
export async function removeByApId(apId: string): Promise<boolean> {
  const rows = await db.delete(remoteActors).where(eq(remoteActors.apId, apId)).returning({ id: remoteActors.id });
  return rows.length > 0;
}

// Removes a cached actor by its primary key. Used by the remote-cache GC, which
// has ids from `listPrunable` and so can delete straight by id without an extra
// apId round-trip.
export async function removeById(id: string): Promise<void> {
  await db.delete(remoteActors).where(eq(remoteActors.id, id));
}

// Purges every cached actor on a domain and its subdomains (their posts, follow
// edges, etc. cascade via FKs). Used when defederating a domain so its content
// stops surfacing here. Returns the number of actors removed.
export async function removeByDomain(domain: string): Promise<number> {
  const rows = await db
    .delete(remoteActors)
    .where(or(eq(remoteActors.host, domain), sql`${remoteActors.host} like ${"%." + domain}`))
    .returning({ id: remoteActors.id });
  return rows.length;
}

// ── age-based pruning (remote-cache GC) ──────────────────────────────────
// Remote actors cache forever, but only the ones a local user still has an
// active edge against (a follow, mute, block, recommendation, or a pending
// notification) need to stay. Anything else that has not been re-fetched since
// `cutoff` is prunable: deleting it cascades its posts, tags, and all the join
// rows that hung off it — see services/remoteCacheGc.ts for the sweep.
export function listPrunable(cutoff: Date, limit: number): Promise<{ id: string }[]> {
  return db
    .select({ id: remoteActors.id })
    .from(remoteActors)
    .where(
      and(
        lt(remoteActors.fetchedAt, cutoff),
        sql`not exists (select 1 from ${follows} where ${follows.remoteFolloweeId} = ${remoteActors.id})`,
        sql`not exists (select 1 from ${mutes} where ${mutes.targetRemoteActorId} = ${remoteActors.id})`,
        sql`not exists (select 1 from ${blocks} where ${blocks.targetRemoteActorId} = ${remoteActors.id})`,
        sql`not exists (select 1 from ${recommendations} where ${recommendations.remoteActorId} = ${remoteActors.id})`,
        sql`not exists (select 1 from ${notifications} where ${notifications.remoteActorId} = ${remoteActors.id})`,
      ),
    )
    .limit(limit);
}

// Inserts or refreshes a cached actor keyed by its ActivityPub id. Bumps
// `fetched_at` so callers can reason about staleness.
export async function upsert(data: Omit<NewRemoteActor, "fetchedAt">) {
  const [row] = await db
    .insert(remoteActors)
    .values({ ...data, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: remoteActors.apId,
      set: {
        handle: data.handle,
        username: data.username,
        host: data.host,
        displayName: data.displayName,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
        inboxUrl: data.inboxUrl,
        sharedInboxUrl: data.sharedInboxUrl,
        outboxUrl: data.outboxUrl,
        followersCount: data.followersCount,
        followingCount: data.followingCount,
        fetchedAt: new Date(),
      },
    })
    .returning();
  return row;
}
