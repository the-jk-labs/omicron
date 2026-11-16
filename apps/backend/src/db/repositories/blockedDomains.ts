// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { blockedDomains, type DomainBlockSeverity } from "@/db/schema.ts";
import { hostMatchesDomain } from "@/lib/domain.ts";

// All blocked-domain DB access. `isBlocked` is on the federation hot path (called
// per inbound/outbound activity), so the domain → severity map is cached
// in-process behind a short TTL and busted on every mutation.

const TTL_MS = 30_000;
let cache: Map<string, DomainBlockSeverity> | null = null;
let cachedAt = 0;

async function domainMap(): Promise<Map<string, DomainBlockSeverity>> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const rows = await db
    .select({ domain: blockedDomains.domain, severity: blockedDomains.severity })
    .from(blockedDomains);
  cache = new Map(rows.map((r) => [r.domain, r.severity]));
  cachedAt = Date.now();
  return cache;
}

function bust() {
  cache = null;
}

export function list() {
  return db.select().from(blockedDomains).orderBy(blockedDomains.domain);
}

export function find(domain: string) {
  return db.query.blockedDomains.findFirst({ where: eq(blockedDomains.domain, domain) });
}

// Adds an (already-normalized) domain, or changes the severity and reason of one
// already on the list.
export async function upsert(domain: string, reason: string, severity: DomainBlockSeverity) {
  await db
    .insert(blockedDomains)
    .values({ domain, reason, severity })
    .onConflictDoUpdate({ target: blockedDomains.domain, set: { reason, severity } });
  bust();
}

export async function remove(domain: string) {
  await db.delete(blockedDomains).where(eq(blockedDomains.domain, domain));
  bust();
}

// The strongest policy covering a hostname (exact host or a parent domain), or
// null when none does. A suspension anywhere up the chain wins over a limit.
export async function policyFor(host: string): Promise<DomainBlockSeverity | null> {
  const map = await domainMap();
  if (map.size === 0) return null;
  let found: DomainBlockSeverity | null = null;
  for (const [d, severity] of map) {
    if (!hostMatchesDomain(host, d)) continue;
    if (severity === "suspend") return "suspend";
    found = severity;
  }
  return found;
}

// Whether a hostname is defederated (suspended: exact host or a subdomain of a block).
export async function isBlocked(host: string): Promise<boolean> {
  return (await policyFor(host)) === "suspend";
}
