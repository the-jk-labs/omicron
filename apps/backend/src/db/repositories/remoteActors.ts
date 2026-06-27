// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, ilike, or } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type NewRemoteActor, remoteActors } from "@/db/schema.ts";

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
