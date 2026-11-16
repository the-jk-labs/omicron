// SPDX-License-Identifier: AGPL-3.0-or-later
import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as instancesRepo from "@/db/repositories/federatedInstances.ts";
import type { FederatedInstance } from "@/db/schema.ts";
import { resolveActor } from "@/federation/remote.ts";
import { hostMatchesDomain, normalizeDomain } from "@/lib/domain.ts";
import { badRequest, conflict, notFound } from "@/lib/http.ts";
import { federationOrigin, federationRunning } from "@/services/federationState.ts";
import * as sync from "@/services/federationSync.ts";
import * as settings from "@/services/settings.ts";

// The admin Federation tab: the auto-cache network's settings and tracked
// instances. Authorization (admin only) is enforced at the route layer.

const LEASE_MS = 30 * 60 * 1000;

export type InstanceView = FederatedInstance & { syncing: boolean; cachedAccounts: number; cachedPosts: number };

type Counts = { host: string; actors: number; posts: number }[];

function view(row: FederatedInstance, counts: Counts, now = Date.now()): InstanceView {
  let cachedAccounts = 0;
  let cachedPosts = 0;
  for (const c of counts) {
    if (!hostMatchesDomain(c.host, row.domain)) continue;
    cachedAccounts += c.actors;
    cachedPosts += c.posts;
  }
  const { syncStartedAt } = row;
  const syncing = syncStartedAt !== null && now - syncStartedAt.getTime() < LEASE_MS;
  return { ...row, syncing, cachedAccounts, cachedPosts };
}

async function viewOne(row: FederatedInstance): Promise<InstanceView> {
  return view(row, await instancesRepo.cacheCountsByHost());
}

export async function overview() {
  const [net, discovery, rows, counts] = await Promise.all([
    settings.getFederationNetwork(),
    settings.getFederationDiscovery(),
    instancesRepo.list(),
    instancesRepo.cacheCountsByHost(),
  ]);
  return {
    running: federationRunning(),
    settings: net,
    discovery,
    instances: rows.map((row) => view(row, counts)),
  };
}

export function updateSettings(patch: Partial<settings.FederationNetworkSettings>) {
  return settings.setFederationNetwork(patch);
}

function domainOf(input: string): string {
  const domain = normalizeDomain(input);
  if (!domain) throw badRequest("Enter a valid domain, e.g. example.social.");
  return domain;
}

async function assertCacheable(domain: string): Promise<void> {
  const own = normalizeDomain(federationOrigin());
  if (own && hostMatchesDomain(own, domain)) throw badRequest("That's this instance.");
  const policy = await blockedDomainsRepo.policyFor(domain);
  if (policy) {
    throw badRequest(
      `${domain} is ${policy === "suspend" ? "suspended" : "limited"} under Domain blocks. Lift that first to cache it.`,
    );
  }
}

export async function addInstance(input: string): Promise<InstanceView> {
  const domain = domainOf(input);
  await assertCacheable(domain);
  return viewOne(await instancesRepo.addManual(domain));
}

export async function setAutoCache(input: string, autoCache: boolean): Promise<InstanceView> {
  const domain = domainOf(input);
  if (autoCache) await assertCacheable(domain);
  const row = await instancesRepo.setAutoCache(domain, autoCache);
  if (!row) throw notFound("That instance isn't tracked.");
  return viewOne(row);
}

// A directory-listed instance would be re-added by the next discovery run, so
// it can only be switched off; hand-added ones can go.
export async function removeInstance(input: string): Promise<void> {
  const domain = domainOf(input);
  const row = await instancesRepo.find(domain);
  if (!row) throw notFound("That instance isn't tracked.");
  if (row.source === "fedidb") {
    throw badRequest("FediDB lists this instance, so discovery would add it back. Turn off auto-cache instead.");
  }
  await instancesRepo.remove(domain);
}

function requireRunning() {
  if (!federationRunning()) throw badRequest("Federation is off on this instance. Turn it on under Instance first.");
}

export async function syncInstanceNow(input: string): Promise<InstanceView> {
  requireRunning();
  const domain = domainOf(input);
  if (!(await instancesRepo.find(domain))) throw notFound("That instance isn't tracked.");
  const row = await sync.syncNow(domain);
  if (!row) throw conflict("A sync of this instance is already running.");
  return viewOne(row);
}

// Resolves an account for an instance-wide block; null when it can't be found
// (or federation is off, so nothing can be looked up).
export async function resolveForBlock(handle: string): Promise<{ apId: string; handle: string } | null> {
  if (!federationRunning()) return null;
  const actor = await resolveActor(handle);
  return actor ? { apId: actor.apId, handle: actor.handle } : null;
}

export async function discoverNow(): Promise<settings.FederationDiscoveryRun> {
  requireRunning();
  return sync.discover();
}
