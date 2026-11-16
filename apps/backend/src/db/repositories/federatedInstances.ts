// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, asc, eq, inArray, isNull, like, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type FederatedInstance, federatedInstances, posts, remoteActors } from "@/db/schema.ts";

// The auto-cache network: remote instances whose public posts are cached ahead
// of any local reader asking for them. See services/federationSync.ts.

export function list() {
  return db.select().from(federatedInstances).orderBy(asc(federatedInstances.domain));
}

export function find(domain: string) {
  return db.query.federatedInstances.findFirst({ where: eq(federatedInstances.domain, domain) });
}

// Adds an instance by hand. An existing row (say, one FediDB listed) becomes
// manual and is switched back on, since the admin just asked for it.
export async function addManual(domain: string): Promise<FederatedInstance> {
  const [row] = await db
    .insert(federatedInstances)
    .values({ domain, source: "manual", autoCache: true })
    .onConflictDoUpdate({
      target: federatedInstances.domain,
      set: { source: "manual", autoCache: true, nextSyncAt: new Date(), consecutiveFailures: 0 },
    })
    .returning();
  return row;
}

// Records instances a directory listed. Never touches a row that already exists,
// so an instance the admin switched off stays off. Returns the domains added.
export async function addDiscovered(domains: string[]): Promise<string[]> {
  if (domains.length === 0) return [];
  const rows = await db
    .insert(federatedInstances)
    .values(domains.map((domain) => ({ domain, source: "fedidb" as const })))
    .onConflictDoNothing({ target: federatedInstances.domain })
    .returning({ domain: federatedInstances.domain });
  return rows.map((r) => r.domain);
}

export async function setAutoCache(domain: string, autoCache: boolean): Promise<FederatedInstance | undefined> {
  const [row] = await db
    .update(federatedInstances)
    // Switching back on syncs at the next tick instead of waiting out a backoff.
    .set(autoCache ? { autoCache, nextSyncAt: new Date(), consecutiveFailures: 0 } : { autoCache })
    .where(eq(federatedInstances.domain, domain))
    .returning();
  return row;
}

// Stops auto-caching a domain and its subdomains (it was just blocked or limited).
export async function disableUnder(domain: string): Promise<void> {
  await db
    .update(federatedInstances)
    .set({ autoCache: false })
    .where(or(eq(federatedInstances.domain, domain), like(federatedInstances.domain, `%.${domain}`)));
}

export async function remove(domain: string): Promise<boolean> {
  const rows = await db
    .delete(federatedInstances)
    .where(eq(federatedInstances.domain, domain))
    .returning({ domain: federatedInstances.domain });
  return rows.length > 0;
}

// Leases up to `limit` due instances to this process. `FOR UPDATE SKIP LOCKED`
// plus the lease timestamp keep two backends from syncing one instance at once;
// a lease older than `staleBefore` (a crashed sync) can be taken over.
export function claimDue(limit: number, now: Date, staleBefore: Date) {
  const due = db
    .select({ domain: federatedInstances.domain })
    .from(federatedInstances)
    .where(
      and(
        eq(federatedInstances.autoCache, true),
        lte(federatedInstances.nextSyncAt, now),
        or(isNull(federatedInstances.syncStartedAt), lt(federatedInstances.syncStartedAt, staleBefore)),
      ),
    )
    .orderBy(asc(federatedInstances.nextSyncAt))
    .limit(limit)
    .for("update", { skipLocked: true });

  return db
    .update(federatedInstances)
    .set({ syncStartedAt: now })
    .where(inArray(federatedInstances.domain, due))
    .returning();
}

// Takes the lease for one instance regardless of schedule ("Sync now"). Returns
// undefined when another sync holds a fresh lease.
export async function claimOne(domain: string, now: Date, staleBefore: Date): Promise<FederatedInstance | undefined> {
  const [row] = await db
    .update(federatedInstances)
    .set({ syncStartedAt: now })
    .where(
      and(
        eq(federatedInstances.domain, domain),
        or(isNull(federatedInstances.syncStartedAt), lt(federatedInstances.syncStartedAt, staleBefore)),
      ),
    )
    .returning();
  return row;
}

export type SyncOutcome = Pick<
  FederatedInstance,
  | "status"
  | "lastError"
  | "software"
  | "softwareVersion"
  | "nodeName"
  | "userCount"
  | "activeMonth"
  | "localPosts"
  | "actorsSynced"
  | "postsSynced"
  | "consecutiveFailures"
  | "nextSyncAt"
> & { succeeded: boolean };

// Writes a finished sync and releases the lease.
export async function finishSync(domain: string, now: Date, outcome: SyncOutcome) {
  const { succeeded, ...fields } = outcome;
  const [row] = await db
    .update(federatedInstances)
    .set({ ...fields, lastSyncedAt: now, ...(succeeded ? { lastSuccessAt: now } : {}), syncStartedAt: null })
    .where(eq(federatedInstances.domain, domain))
    .returning();
  return row;
}

// Cached accounts and posts per remote host, for the admin overview. Hosts keep
// their port; the service folds subdomains and ports into each instance.
export function cacheCountsByHost(): Promise<{ host: string; actors: number; posts: number }[]> {
  return db
    .select({
      host: remoteActors.host,
      actors: sql<number>`count(distinct ${remoteActors.id})::int`,
      posts: sql<number>`count(${posts.id})::int`,
    })
    .from(remoteActors)
    .leftJoin(posts, eq(posts.remoteActorId, remoteActors.id))
    .groupBy(remoteActors.host);
}
