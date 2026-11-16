// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { blockedRemoteActors } from "@/db/schema.ts";

// Instance-wide blocks on single remote accounts. Checked per inbound activity,
// so like the domain blocklist the sets are cached in-process behind a short TTL
// and busted on every mutation.

const TTL_MS = 30_000;
let cache: { apIds: Set<string>; handles: Set<string> } | null = null;
let cachedAt = 0;

async function sets() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const rows = await db
    .select({ apId: blockedRemoteActors.apId, handle: blockedRemoteActors.handle })
    .from(blockedRemoteActors);
  cache = { apIds: new Set(rows.map((r) => r.apId)), handles: new Set(rows.map((r) => r.handle)) };
  cachedAt = Date.now();
  return cache;
}

function bust() {
  cache = null;
}

export function list() {
  return db.select().from(blockedRemoteActors).orderBy(blockedRemoteActors.handle);
}

// Blocks an actor, or updates the reason of one already blocked. `handle` is the
// lowercased `user@host`.
export async function upsert(apId: string, handle: string, reason: string) {
  const [row] = await db
    .insert(blockedRemoteActors)
    .values({ apId, handle, reason })
    .onConflictDoUpdate({ target: blockedRemoteActors.apId, set: { handle, reason } })
    .returning();
  bust();
  return row;
}

export async function remove(apId: string): Promise<boolean> {
  const rows = await db
    .delete(blockedRemoteActors)
    .where(eq(blockedRemoteActors.apId, apId))
    .returning({ apId: blockedRemoteActors.apId });
  bust();
  return rows.length > 0;
}

export async function isBlocked(apId: string): Promise<boolean> {
  const { apIds } = await sets();
  return apIds.size > 0 && apIds.has(apId);
}

// Lets a lookup by `user@host` be refused before any WebFinger request.
export async function isHandleBlocked(handle: string): Promise<boolean> {
  const { handles } = await sets();
  return handles.size > 0 && handles.has(handle.replace(/^@/, "").toLowerCase());
}
