// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { blockedDomains } from "@/db/schema.ts";
import { hostMatchesDomain } from "@/lib/domain.ts";

// All blocked-domain DB access. `isBlocked` is on the federation hot path (called
// per inbound/outbound activity), so the domain set is cached in-process behind a
// short TTL and busted on every mutation.

const TTL_MS = 30_000;
let cache: Set<string> | null = null;
let cachedAt = 0;

async function domainSet(): Promise<Set<string>> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const rows = await db.select({ domain: blockedDomains.domain }).from(blockedDomains);
  cache = new Set(rows.map((r) => r.domain));
  cachedAt = Date.now();
  return cache;
}

function bust() {
  cache = null;
}

export function list() {
  return db.select().from(blockedDomains).orderBy(blockedDomains.domain);
}

// Adds a (already-normalized) domain. Idempotent — re-blocking is a no-op that
// leaves the original reason intact.
export async function add(domain: string, reason: string) {
  await db
    .insert(blockedDomains)
    .values({ domain, reason })
    .onConflictDoNothing({ target: blockedDomains.domain });
  bust();
}

export async function remove(domain: string) {
  await db.delete(blockedDomains).where(eq(blockedDomains.domain, domain));
  bust();
}

// Whether a hostname is defederated (exact host or a subdomain of a block).
export async function isBlocked(host: string): Promise<boolean> {
  const set = await domainSet();
  if (set.size === 0) return false;
  for (const d of set) {
    if (hostMatchesDomain(host, d)) return true;
  }
  return false;
}
