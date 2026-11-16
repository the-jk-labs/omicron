// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";
import { config } from "@/config.ts";
import * as blockedActorsRepo from "@/db/repositories/blockedActors.ts";
import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as instancesRepo from "@/db/repositories/federatedInstances.ts";
import type { FederatedInstance } from "@/db/schema.ts";
import { fetchOutboxPosts, resolveActor } from "@/federation/remote.ts";
import { isHostAllowed } from "@/federation/ssrf.ts";
import { hostMatchesDomain, normalizeDomain } from "@/lib/domain.ts";
import { type FetchJson, publicJsonFetcher } from "@/lib/publicJson.ts";
import { federationOrigin, federationRunning } from "@/services/federationState.ts";
import * as fedidb from "@/services/fedidb.ts";
import * as settings from "@/services/settings.ts";
import { APP_VERSION } from "@/version.ts";

// The auto-cache network. Keeps the Global feed full of the wider network's
// writing without waiting for a local reader to look anyone up:
//
//   1. Discovery (daily, optional): every Omicron instance FediDB lists becomes
//      a tracked instance. Directory rows are only ever added, never re-enabled,
//      so an admin's "off" sticks.
//   2. Sync (per instance, every `syncIntervalHours`): confirm through the
//      instance's own NodeInfo that it runs Omicron, read its public local feed
//      for recent authors, then resolve each author and refresh their outbox
//      through the regular ActivityPub path (federation/remote.ts). Nothing is
//      cached from the peer's JSON API itself: it only names who to look up, so
//      every stored post passes the same SSRF, authority, visibility and
//      blocklist checks as one fetched when a reader opens a profile.
//
// Failures back off exponentially per instance, so a dead server costs a
// request a week rather than one every few hours. Like the other sweepers it is
// timer-driven and database-leased, so it is safe on every backend process.

const TICK_MS = 5 * 60 * 1000;
const DISCOVERY_EVERY_MS = 24 * 60 * 60 * 1000;
const DISCOVERY_RETRY_MS = 60 * 60 * 1000;
// A sync still holding its lease after this long is presumed crashed.
const LEASE_MS = 30 * 60 * 1000;
const BATCH = 4;
const CONCURRENCY = 2;
const MAX_BACKOFF_MS = 7 * 24 * 60 * 60 * 1000;
// An instance running other software is rechecked weekly, in case it moves to Omicron.
const UNSUPPORTED_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
const FEED_PAGES = 3;
const REQUEST_TIMEOUT_MS = 15_000;

const USERNAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;

export type SyncDeps = {
  fetchJson: FetchJson;
  resolveActor: typeof resolveActor;
  fetchOutboxPosts: typeof fetchOutboxPosts;
  isHostAllowed: (host: string) => Promise<boolean>;
  now: () => Date;
};

function defaultDeps(): SyncDeps {
  return {
    fetchJson: publicJsonFetcher(`Omicron/${APP_VERSION} (+${federationOrigin()})`, config.ALLOW_PRIVATE_FEDERATION),
    resolveActor,
    fetchOutboxPosts,
    isHostAllowed,
    now: () => new Date(),
  };
}

const ownHost = () => normalizeDomain(federationOrigin());

// ── NodeInfo ──────────────────────────────────────────────────────────────

const NodeInfoLinks = z.object({ links: z.array(z.object({ rel: z.string(), href: z.string() })) });
const NodeInfoDoc = z.object({
  software: z.object({ name: z.string(), version: z.string().nullish() }),
  usage: z
    .object({
      users: z.object({ total: z.number().nullish(), activeMonth: z.number().nullish() }).nullish(),
      localPosts: z.number().nullish(),
    })
    .nullish(),
  metadata: z.object({ nodeName: z.unknown() }).partial().nullish(),
});

export type NodeInfoSummary = {
  software: string;
  version: string | null;
  nodeName: string | null;
  userCount: number | null;
  activeMonth: number | null;
  localPosts: number | null;
};

const intOrNull = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;

// Reads an instance's NodeInfo, preferring the newest 2.x schema it links.
export async function readNodeInfo(fetchJson: FetchJson, domain: string): Promise<NodeInfoSummary> {
  const wellKnown = NodeInfoLinks.safeParse(
    await fetchJson(`https://${domain}/.well-known/nodeinfo`, AbortSignal.timeout(REQUEST_TIMEOUT_MS)),
  );
  if (!wellKnown.success) throw new Error("No NodeInfo document.");
  const link = wellKnown.data.links
    .filter((l) => /^https?:\/\/nodeinfo\.diaspora\.software\/ns\/schema\/2\.\d+$/.test(l.rel))
    .toSorted((a, b) => b.rel.localeCompare(a.rel))[0];
  if (!link) throw new Error("No NodeInfo 2.x document.");
  const doc = NodeInfoDoc.safeParse(await fetchJson(link.href, AbortSignal.timeout(REQUEST_TIMEOUT_MS)));
  if (!doc.success) throw new Error("NodeInfo document is malformed.");
  const { software, usage, metadata } = doc.data;
  const nodeName = typeof metadata?.nodeName === "string" ? metadata.nodeName.trim().slice(0, 200) || null : null;
  return {
    software: software.name.toLowerCase().slice(0, 100),
    version: software.version?.slice(0, 100) ?? null,
    nodeName,
    userCount: intOrNull(usage?.users?.total),
    activeMonth: intOrNull(usage?.users?.activeMonth),
    localPosts: intOrNull(usage?.localPosts),
  };
}

// ── Author discovery ──────────────────────────────────────────────────────

// Only the fields used here, so a peer on another contract version still parses.
const LocalFeedPage = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().nullish(),
});
const FeedAuthor = z.object({ author: z.object({ username: z.string(), remote: z.boolean() }) });

// The usernames behind an Omicron instance's most recent local posts, newest
// first, up to `limit`.
export async function recentAuthors(fetchJson: FetchJson, domain: string, limit: number): Promise<string[]> {
  const authors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < FEED_PAGES && authors.size < limit; page++) {
    const url = new URL(`https://${domain}/api/posts`);
    url.searchParams.set("scope", "local");
    if (cursor) url.searchParams.set("cursor", cursor);
    const parsed = LocalFeedPage.safeParse(await fetchJson(url.href, AbortSignal.timeout(REQUEST_TIMEOUT_MS)));
    if (!parsed.success) throw new Error("The instance's public feed answered in an unexpected format.");
    for (const item of parsed.data.items) {
      const post = FeedAuthor.safeParse(item);
      if (!post.success || post.data.author.remote || !USERNAME.test(post.data.author.username)) continue;
      authors.add(post.data.author.username.toLowerCase());
      if (authors.size >= limit) break;
    }
    const next = parsed.data.nextCursor ?? null;
    if (!next || next === cursor) break;
    cursor = next;
  }
  return [...authors];
}

// ── One instance ──────────────────────────────────────────────────────────

const shortError = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).slice(0, 300) || "Unknown error.";

function backoff(intervalMs: number, failures: number): number {
  return Math.min(intervalMs * 2 ** Math.min(failures, 6), MAX_BACKOFF_MS);
}

// Syncs one leased instance and records the outcome. Never throws.
export async function syncInstance(
  instance: FederatedInstance,
  deps: SyncDeps = defaultDeps(),
): Promise<FederatedInstance | undefined> {
  const { syncIntervalHours, authorsPerInstance } = await settings.getFederationNetwork();
  const intervalMs = syncIntervalHours * 60 * 60 * 1000;
  const domain = instance.domain;
  const keep = {
    software: instance.software,
    softwareVersion: instance.softwareVersion,
    nodeName: instance.nodeName,
    userCount: instance.userCount,
    activeMonth: instance.activeMonth,
    localPosts: instance.localPosts,
  };
  const startedAt = deps.now();
  const at = (ms: number) => new Date(startedAt.getTime() + ms);

  try {
    const own = ownHost();
    if (own && hostMatchesDomain(own, domain)) throw new Error("This is your own instance.");
    const policy = await blockedDomainsRepo.policyFor(domain);
    if (policy) {
      // A blocked or limited domain is deliberately not promoted, so this is no failure.
      return await instancesRepo.finishSync(domain, deps.now(), {
        ...keep,
        succeeded: false,
        status: "error",
        lastError: policy === "suspend" ? "Skipped: this domain is suspended." : "Skipped: this domain is limited.",
        actorsSynced: 0,
        postsSynced: 0,
        consecutiveFailures: 0,
        nextSyncAt: at(intervalMs),
      });
    }
    if (!(await deps.isHostAllowed(domain))) throw new Error("The domain doesn't resolve to a public address.");

    const info = await readNodeInfo(deps.fetchJson, domain);
    const fromInfo = {
      software: info.software,
      softwareVersion: info.version,
      nodeName: info.nodeName,
      userCount: info.userCount,
      activeMonth: info.activeMonth,
      localPosts: info.localPosts,
    };
    if (info.software !== "omicron") {
      return await instancesRepo.finishSync(domain, deps.now(), {
        ...fromInfo,
        succeeded: true,
        status: "unsupported",
        lastError: `Runs ${info.software}; finding its writers needs Omicron. Follows and replies still federate.`,
        actorsSynced: 0,
        postsSynced: 0,
        consecutiveFailures: 0,
        nextSyncAt: at(UNSUPPORTED_RECHECK_MS),
      });
    }

    const usernames = await recentAuthors(deps.fetchJson, domain, authorsPerInstance);
    let actors = 0;
    let posts = 0;
    for (const username of usernames) {
      const handle = `${username}@${domain}`;
      if (await blockedActorsRepo.isHandleBlocked(handle)) continue;
      const actor = await deps.resolveActor(handle);
      if (!actor) continue;
      actors++;
      posts += await deps.fetchOutboxPosts(handle, actor.id);
    }
    if (usernames.length > 0 && actors === 0) throw new Error("None of the instance's writers could be resolved.");

    return await instancesRepo.finishSync(domain, deps.now(), {
      ...fromInfo,
      succeeded: true,
      status: "ok",
      lastError: null,
      actorsSynced: actors,
      postsSynced: posts,
      consecutiveFailures: 0,
      nextSyncAt: at(intervalMs),
    });
  } catch (err) {
    const failures = instance.consecutiveFailures + 1;
    try {
      return await instancesRepo.finishSync(domain, deps.now(), {
        ...keep,
        succeeded: false,
        status: "error",
        lastError: shortError(err),
        actorsSynced: 0,
        postsSynced: 0,
        consecutiveFailures: failures,
        nextSyncAt: at(backoff(intervalMs, failures)),
      });
    } catch (writeErr) {
      console.error(`federation-sync: could not record the sync of ${domain}:`, writeErr);
      return undefined;
    }
  }
}

// ── Discovery ─────────────────────────────────────────────────────────────

// Pulls the directory and tracks every Omicron instance it lists (except this
// one and blocked domains). Records the run either way.
export async function discover(
  deps: Pick<SyncDeps, "fetchJson" | "now"> = defaultDeps(),
): Promise<settings.FederationDiscoveryRun> {
  const at = deps.now().toISOString();
  try {
    const listed = await fedidb.listServers(deps.fetchJson, "omicron");
    const own = ownHost();
    const eligible: string[] = [];
    for (const domain of listed) {
      if (own && hostMatchesDomain(own, domain)) continue;
      if (await blockedDomainsRepo.policyFor(domain)) continue;
      eligible.push(domain);
    }
    const added = await instancesRepo.addDiscovered(eligible);
    const run = { at, ok: true, found: listed.length, added: added.length, error: null };
    await settings.setFederationDiscovery(run);
    if (added.length > 0) console.log(`federation-sync: FediDB listed ${added.length} new Omicron instance(s).`);
    return run;
  } catch (err) {
    const run = { at, ok: false, found: 0, added: 0, error: shortError(err) };
    console.warn("federation-sync: FediDB discovery failed:", err);
    try {
      await settings.setFederationDiscovery(run);
    } catch {
      // The next tick retries the whole run anyway.
    }
    return run;
  }
}

function discoveryDue(last: settings.FederationDiscoveryRun | null, now: Date): boolean {
  if (!last) return true;
  const age = now.getTime() - new Date(last.at).getTime();
  return !(age >= 0 && age < (last.ok ? DISCOVERY_EVERY_MS : DISCOVERY_RETRY_MS));
}

// ── Sweeper ───────────────────────────────────────────────────────────────

let ticking = false;

// One pass: discovery when due, then every due instance in small leased batches.
export async function tick(deps: SyncDeps = defaultDeps()): Promise<number> {
  if (ticking) return 0;
  ticking = true;
  try {
    const net = await settings.getFederationNetwork();
    if (!net.autoCache) return 0;
    if (net.fedidbDiscovery && discoveryDue(await settings.getFederationDiscovery(), deps.now())) {
      await discover(deps);
    }
    let synced = 0;
    while (true) {
      const now = deps.now();
      const batch = await instancesRepo.claimDue(BATCH, now, new Date(now.getTime() - LEASE_MS));
      if (batch.length === 0) break;
      for (let i = 0; i < batch.length; i += CONCURRENCY) {
        await Promise.all(batch.slice(i, i + CONCURRENCY).map((row) => syncInstance(row, deps)));
      }
      synced += batch.length;
    }
    return synced;
  } catch (err) {
    console.error("federation-sync: sweep failed:", err);
    return 0;
  } finally {
    ticking = false;
  }
}

let started = false;

/** Start the auto-cache sweeper. Call once at boot; a no-op while federation is off. */
export function startFederationSyncSweeper(): void {
  if (started || !federationRunning()) return;
  started = true;
  void tick();
  setInterval(() => void tick(), TICK_MS);
  console.log("✔ Federation auto-cache sweeper started.");
}

// ── Admin actions ─────────────────────────────────────────────────────────

// "Sync now": runs one instance immediately, outside the schedule. Returns
// undefined when a sync of it is already running.
export async function syncNow(domain: string, deps: SyncDeps = defaultDeps()) {
  const now = deps.now();
  const leased = await instancesRepo.claimOne(domain, now, new Date(now.getTime() - LEASE_MS));
  if (!leased) return undefined;
  return syncInstance(leased, deps);
}
