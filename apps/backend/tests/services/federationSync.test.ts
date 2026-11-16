// SPDX-License-Identifier: AGPL-3.0-or-later
// The auto-cache sweeper: NodeInfo checks, author discovery, the per-instance
// outcome it records (including backoff), FediDB discovery and the tick loop.
// Network and Fedify are replaced through the injected deps.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/blockedActors.ts"));
vi.mock(import("@/db/repositories/blockedDomains.ts"));
vi.mock(import("@/db/repositories/federatedInstances.ts"));
vi.mock(import("@/db/repositories/instanceSettings.ts"));
vi.mock(import("@/federation/remote.ts"), () => ({
  resolveActor: vi.fn<() => Promise<null>>(),
  fetchOutboxPosts: vi.fn<() => Promise<number>>(),
}));

import * as blockedActorsRepo from "@/db/repositories/blockedActors.ts";
import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as instancesRepo from "@/db/repositories/federatedInstances.ts";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import type { FederatedInstance } from "@/db/schema.ts";
import type { FetchJson } from "@/lib/publicJson.ts";
import { seedFederationOrigin } from "@/services/federationState.ts";
import * as sync from "@/services/federationSync.ts";
import { remoteActorRow } from "../fixtures.ts";

const NOW = new Date("2026-11-16T12:00:00Z");
const HOUR = 60 * 60 * 1000;
seedFederationOrigin("https://home.example");

function instanceRow(overrides: Partial<FederatedInstance> = {}): FederatedInstance {
  return {
    domain: "peer.example",
    source: "fedidb",
    autoCache: true,
    software: null,
    softwareVersion: null,
    nodeName: null,
    userCount: null,
    activeMonth: null,
    localPosts: null,
    status: "pending",
    lastError: null,
    consecutiveFailures: 0,
    actorsSynced: 0,
    postsSynced: 0,
    lastSyncedAt: null,
    lastSuccessAt: null,
    nextSyncAt: NOW,
    syncStartedAt: NOW,
    createdAt: NOW,
    ...overrides,
  };
}

const nodeinfo = (name = "omicron") => ({
  software: { name, version: "0.1.0" },
  usage: { users: { total: 68, activeMonth: 38 }, localPosts: 53 },
  metadata: { nodeName: "Peer Blog" },
});

const feedItem = (username: string, remote = false) => ({ id: username, author: { username, remote } });

// A tiny fake internet keyed by URL (query included).
function web(routes: Record<string, unknown>): FetchJson {
  return vi.fn<FetchJson>(async (url) => {
    if (!(url in routes)) throw new Error(`HTTP 404 ${url}`);
    const value = routes[url];
    if (value instanceof Error) throw value;
    return value;
  });
}

const omicronPeer = (
  pages: unknown[] = [{ items: [feedItem("ada"), feedItem("bob")], nextCursor: null }],
): Record<string, unknown> => ({
  "https://peer.example/.well-known/nodeinfo": {
    links: [
      { rel: "http://nodeinfo.diaspora.software/ns/schema/2.0", href: "https://peer.example/nodeinfo/2.0" },
      { rel: "http://nodeinfo.diaspora.software/ns/schema/2.1", href: "https://peer.example/nodeinfo/2.1" },
    ],
  },
  "https://peer.example/nodeinfo/2.1": nodeinfo(),
  ...Object.fromEntries(
    pages.map((page, i) => [`https://peer.example/api/posts?scope=local${i === 0 ? "" : `&cursor=c${i}`}`, page]),
  ),
});

function deps(routes: Record<string, unknown>, overrides: Partial<sync.SyncDeps> = {}): sync.SyncDeps {
  return {
    fetchJson: web(routes),
    resolveActor: vi.fn<sync.SyncDeps["resolveActor"]>(async (handle) =>
      remoteActorRow({ id: `id-${handle}`, handle }),
    ),
    fetchOutboxPosts: vi.fn<sync.SyncDeps["fetchOutboxPosts"]>(async () => 3),
    isHostAllowed: vi.fn<sync.SyncDeps["isHostAllowed"]>(async () => true),
    now: () => NOW,
    ...overrides,
  };
}

const outcome = () => vi.mocked(instancesRepo.finishSync).mock.lastCall?.[2];

beforeEach(() => {
  vi.mocked(settingsRepo.get).mockResolvedValue(undefined);
  vi.mocked(blockedDomainsRepo.policyFor).mockResolvedValue(null);
  vi.mocked(blockedActorsRepo.isHandleBlocked).mockResolvedValue(false);
  vi.mocked(instancesRepo.finishSync).mockImplementation(async (domain, _now, o) =>
    instanceRow({ domain, ...o, syncStartedAt: null }),
  );
});

describe("readNodeInfo", () => {
  test("follows the newest 2.x link and summarizes it", async () => {
    expect(await sync.readNodeInfo(web(omicronPeer()), "peer.example")).toEqual({
      software: "omicron",
      version: "0.1.0",
      nodeName: "Peer Blog",
      userCount: 68,
      activeMonth: 38,
      localPosts: 53,
    });
  });

  test("rejects a missing or malformed document", async () => {
    await expect(sync.readNodeInfo(web({}), "peer.example")).rejects.toThrow("HTTP 404");
    const noLink = { "https://peer.example/.well-known/nodeinfo": { links: [{ rel: "other", href: "x" }] } };
    await expect(sync.readNodeInfo(web(noLink), "peer.example")).rejects.toThrow(/2\.x/);
  });

  test("drops nonsense counts instead of storing them", async () => {
    const routes = omicronPeer();
    routes["https://peer.example/nodeinfo/2.1"] = { software: { name: "Omicron" }, usage: { users: { total: -4 } } };
    expect(await sync.readNodeInfo(web(routes), "peer.example")).toMatchObject({
      software: "omicron",
      version: null,
      userCount: null,
    });
  });
});

describe("recentAuthors", () => {
  test("collects local authors across pages, skipping remote and odd names, up to the limit", async () => {
    const routes = omicronPeer([
      { items: [feedItem("Ada"), feedItem("ada"), feedItem("eve", true), { id: "x" }], nextCursor: "c1" },
      { items: [feedItem("bob"), feedItem("../etc"), feedItem("carol")], nextCursor: null },
    ]);
    expect(await sync.recentAuthors(web(routes), "peer.example", 10)).toEqual(["ada", "bob", "carol"]);
    expect(await sync.recentAuthors(web(routes), "peer.example", 2)).toEqual(["ada", "bob"]);
  });

  test("an unexpected feed shape is an error", async () => {
    const routes = omicronPeer([{ posts: [] }]);
    await expect(sync.recentAuthors(web(routes), "peer.example", 5)).rejects.toThrow(/unexpected format/);
  });
});

describe("syncInstance", () => {
  test("caches every recent author's outbox through ActivityPub and records success", async () => {
    const d = deps(omicronPeer());
    await sync.syncInstance(instanceRow(), d);
    expect(d.resolveActor).toHaveBeenCalledWith("ada@peer.example");
    expect(d.fetchOutboxPosts).toHaveBeenCalledWith("bob@peer.example", "id-bob@peer.example");
    expect(outcome()).toMatchObject({
      succeeded: true,
      status: "ok",
      lastError: null,
      software: "omicron",
      nodeName: "Peer Blog",
      actorsSynced: 2,
      postsSynced: 6,
      consecutiveFailures: 0,
      nextSyncAt: new Date(NOW.getTime() + 6 * HOUR),
    });
  });

  test("uses the configured interval and author cap", async () => {
    vi.mocked(settingsRepo.get).mockImplementation(async (key) =>
      key === "federation.network" ? { syncIntervalHours: 2, authorsPerInstance: 1 } : undefined,
    );
    const d = deps(omicronPeer());
    await sync.syncInstance(instanceRow(), d);
    expect(d.resolveActor).toHaveBeenCalledTimes(1);
    expect(outcome()?.nextSyncAt).toEqual(new Date(NOW.getTime() + 2 * HOUR));
  });

  test("skips an account blocked instance-wide", async () => {
    vi.mocked(blockedActorsRepo.isHandleBlocked).mockImplementation(async (h) => h === "ada@peer.example");
    const d = deps(omicronPeer());
    await sync.syncInstance(instanceRow(), d);
    expect(d.resolveActor).not.toHaveBeenCalledWith("ada@peer.example");
    expect(outcome()?.actorsSynced).toBe(1);
  });

  test("another software is marked unsupported, keeps its NodeInfo, and is rechecked weekly", async () => {
    const routes = omicronPeer();
    routes["https://peer.example/nodeinfo/2.1"] = nodeinfo("mastodon");
    const d = deps(routes);
    await sync.syncInstance(instanceRow(), d);
    expect(d.resolveActor).not.toHaveBeenCalled();
    expect(outcome()).toMatchObject({
      status: "unsupported",
      software: "mastodon",
      consecutiveFailures: 0,
      nextSyncAt: new Date(NOW.getTime() + 7 * 24 * HOUR),
    });
  });

  test("a failure backs off exponentially and keeps what the last success learned", async () => {
    const d = deps({});
    await sync.syncInstance(instanceRow({ consecutiveFailures: 2, software: "omicron", userCount: 5 }), d);
    expect(outcome()).toMatchObject({
      succeeded: false,
      status: "error",
      consecutiveFailures: 3,
      software: "omicron",
      userCount: 5,
      nextSyncAt: new Date(NOW.getTime() + 6 * HOUR * 8),
    });
    expect(outcome()?.lastError).toMatch(/HTTP 404/);
  });

  test("the backoff is capped at a week", async () => {
    await sync.syncInstance(instanceRow({ consecutiveFailures: 40 }), deps({}));
    expect(outcome()?.nextSyncAt).toEqual(new Date(NOW.getTime() + 7 * 24 * HOUR));
  });

  test("writers that all fail to resolve count as a failure", async () => {
    const d = deps(omicronPeer(), { resolveActor: vi.fn<sync.SyncDeps["resolveActor"]>(async () => null) });
    await sync.syncInstance(instanceRow(), d);
    expect(outcome()).toMatchObject({ status: "error", consecutiveFailures: 1 });
  });

  test("an instance with no posts yet is fine", async () => {
    await sync.syncInstance(instanceRow(), deps(omicronPeer([{ items: [], nextCursor: null }])));
    expect(outcome()).toMatchObject({ status: "ok", actorsSynced: 0 });
  });

  test("never fetches from a private address", async () => {
    const d = deps(omicronPeer(), { isHostAllowed: vi.fn<sync.SyncDeps["isHostAllowed"]>(async () => false) });
    await sync.syncInstance(instanceRow(), d);
    expect(d.fetchJson).not.toHaveBeenCalled();
    expect(outcome()?.lastError).toMatch(/public address/);
  });

  test("a blocked or limited domain is skipped without a request or a failure count", async () => {
    vi.mocked(blockedDomainsRepo.policyFor).mockResolvedValue("limit");
    const d = deps(omicronPeer());
    await sync.syncInstance(instanceRow(), d);
    expect(d.fetchJson).not.toHaveBeenCalled();
    expect(outcome()).toMatchObject({ consecutiveFailures: 0, lastError: "Skipped: this domain is limited." });
  });

  test("refuses to sync this instance itself", async () => {
    const d = deps(omicronPeer());
    await sync.syncInstance(instanceRow({ domain: "home.example" }), d);
    expect(d.fetchJson).not.toHaveBeenCalled();
    expect(outcome()?.status).toBe("error");
  });

  test("never throws, even when recording fails", async () => {
    vi.mocked(instancesRepo.finishSync).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sync.syncInstance(instanceRow(), deps(omicronPeer()))).resolves.toBeUndefined();
  });
});

describe("discover", () => {
  const fedidb = (domains: string[]) => ({
    "https://api.fedidb.org/v1/software/omicron/servers?limit=20": {
      data: domains.map((domain) => ({ domain, software: { slug: "omicron" } })),
      meta: { next_cursor: null },
    },
  });

  test("tracks listed instances except this one and blocked domains, and records the run", async () => {
    vi.mocked(blockedDomainsRepo.policyFor).mockImplementation(async (d) => (d === "bad.example" ? "suspend" : null));
    vi.mocked(instancesRepo.addDiscovered).mockResolvedValue(["peer.example"]);
    const run = await sync.discover(deps(fedidb(["home.example", "peer.example", "bad.example", "old.example"])));
    expect(instancesRepo.addDiscovered).toHaveBeenCalledWith(["peer.example", "old.example"]);
    expect(run).toEqual({ at: NOW.toISOString(), ok: true, found: 4, added: 1, error: null });
    expect(settingsRepo.set).toHaveBeenCalledWith("federation.discovery", run);
  });

  test("a failed directory read is recorded, not thrown", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = await sync.discover(deps({}));
    expect(run).toMatchObject({ ok: false, added: 0 });
    expect(run.error).toMatch(/HTTP 404/);
    expect(instancesRepo.addDiscovered).not.toHaveBeenCalled();
  });
});

describe("tick", () => {
  test("does nothing while auto-cache is off", async () => {
    vi.mocked(settingsRepo.get).mockImplementation(async (key) =>
      key === "federation.network" ? { autoCache: false } : undefined,
    );
    expect(await sync.tick(deps({}))).toBe(0);
    expect(instancesRepo.claimDue).not.toHaveBeenCalled();
  });

  test("runs discovery when due, then drains due instances in leased batches", async () => {
    vi.mocked(instancesRepo.addDiscovered).mockResolvedValue([]);
    vi.mocked(instancesRepo.claimDue)
      .mockResolvedValueOnce([instanceRow(), instanceRow({ domain: "two.example" })])
      .mockResolvedValueOnce([]);
    const routes = {
      ...omicronPeer(),
      "https://api.fedidb.org/v1/software/omicron/servers?limit=20": { data: [], meta: {} },
    };
    expect(await sync.tick(deps(routes))).toBe(2);
    expect(settingsRepo.set).toHaveBeenCalledWith("federation.discovery", expect.objectContaining({ ok: true }));
    // A lease older than 30 minutes may be taken over.
    expect(vi.mocked(instancesRepo.claimDue).mock.calls[0][2]).toEqual(new Date(NOW.getTime() - 30 * 60 * 1000));
    expect(instancesRepo.finishSync).toHaveBeenCalledTimes(2);
  });

  test("skips discovery that ran recently, or when it is switched off", async () => {
    vi.mocked(instancesRepo.claimDue).mockResolvedValue([]);
    vi.mocked(settingsRepo.get).mockImplementation(async (key) =>
      key === "federation.discovery"
        ? { at: new Date(NOW.getTime() - HOUR).toISOString(), ok: true, found: 1, added: 0, error: null }
        : undefined,
    );
    const d = deps({});
    await sync.tick(d);
    expect(d.fetchJson).not.toHaveBeenCalled();

    vi.mocked(settingsRepo.get).mockImplementation(async (key) =>
      key === "federation.network" ? { fedidbDiscovery: false } : undefined,
    );
    await sync.tick(d);
    expect(d.fetchJson).not.toHaveBeenCalled();
  });

  test("retries a failed discovery after an hour rather than a day", async () => {
    vi.mocked(instancesRepo.claimDue).mockResolvedValue([]);
    vi.mocked(settingsRepo.get).mockImplementation(async (key) =>
      key === "federation.discovery"
        ? { at: new Date(NOW.getTime() - 2 * HOUR).toISOString(), ok: false, found: 0, added: 0, error: "x" }
        : undefined,
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = deps({});
    await sync.tick(d);
    expect(d.fetchJson).toHaveBeenCalled();
  });
});

describe("syncNow", () => {
  test("syncs a leased instance at once", async () => {
    vi.mocked(instancesRepo.claimOne).mockResolvedValue(instanceRow());
    expect(await sync.syncNow("peer.example", deps(omicronPeer()))).toMatchObject({ status: "ok" });
  });

  test("is undefined while another sync holds the lease", async () => {
    vi.mocked(instancesRepo.claimOne).mockResolvedValue(undefined);
    expect(await sync.syncNow("peer.example", deps(omicronPeer()))).toBeUndefined();
    expect(instancesRepo.finishSync).not.toHaveBeenCalled();
  });
});
