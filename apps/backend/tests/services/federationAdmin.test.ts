// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/blockedDomains.ts"));
vi.mock(import("@/db/repositories/federatedInstances.ts"));
vi.mock(import("@/db/repositories/instanceSettings.ts"));
vi.mock(import("@/services/federationSync.ts"));
vi.mock(import("@/federation/remote.ts"), () => ({ resolveActor: vi.fn<() => Promise<null>>() }));

import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as instancesRepo from "@/db/repositories/federatedInstances.ts";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import type { FederatedInstance } from "@/db/schema.ts";
import { resolveActor } from "@/federation/remote.ts";
import * as admin from "@/services/federationAdmin.ts";
import { seedFederationOrigin, seedFederationRunning } from "@/services/federationState.ts";
import * as sync from "@/services/federationSync.ts";
import { remoteActorRow } from "../fixtures.ts";

const NOW = new Date();
seedFederationOrigin("https://home.example");

const row = (overrides: Partial<FederatedInstance> = {}): FederatedInstance => ({
  domain: "peer.example",
  source: "manual",
  autoCache: true,
  software: "omicron",
  softwareVersion: "0.1.0",
  nodeName: null,
  userCount: 3,
  activeMonth: 1,
  localPosts: 9,
  status: "ok",
  lastError: null,
  consecutiveFailures: 0,
  actorsSynced: 2,
  postsSynced: 9,
  lastSyncedAt: NOW,
  lastSuccessAt: NOW,
  nextSyncAt: NOW,
  syncStartedAt: null,
  createdAt: NOW,
  ...overrides,
});

beforeEach(() => {
  seedFederationRunning(true);
  vi.mocked(settingsRepo.get).mockResolvedValue(undefined);
  vi.mocked(blockedDomainsRepo.policyFor).mockResolvedValue(null);
  vi.mocked(instancesRepo.cacheCountsByHost).mockResolvedValue([
    { host: "peer.example", actors: 2, posts: 7 },
    { host: "blog.peer.example:8443", actors: 1, posts: 1 },
    { host: "other.example", actors: 5, posts: 50 },
  ]);
});

describe("overview", () => {
  test("defaults both switches on and folds subdomain and port caches into each instance", async () => {
    vi.mocked(instancesRepo.list).mockResolvedValue([
      row(),
      row({ domain: "busy.example", syncStartedAt: new Date(Date.now() - 60_000) }),
      row({ domain: "stuck.example", syncStartedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }),
    ]);
    const o = await admin.overview();
    expect(o.running).toBe(true);
    expect(o.settings).toEqual({
      autoCache: true,
      fedidbDiscovery: true,
      syncIntervalHours: 6,
      authorsPerInstance: 20,
    });
    expect(o.discovery).toBeNull();
    expect(o.instances.map((i) => [i.domain, i.cachedAccounts, i.cachedPosts, i.syncing])).toEqual([
      ["peer.example", 3, 8, false],
      ["busy.example", 0, 0, true],
      // A lease past its 30 minutes is a crashed sync, not a running one.
      ["stuck.example", 0, 0, false],
    ]);
  });
});

describe("instances", () => {
  test("adds a normalized domain by hand", async () => {
    vi.mocked(instancesRepo.addManual).mockResolvedValue(row());
    expect(await admin.addInstance("https://Peer.Example/about")).toMatchObject({ domain: "peer.example" });
    expect(instancesRepo.addManual).toHaveBeenCalledWith("peer.example");
  });

  test("refuses this instance, a blocked domain and junk", async () => {
    await expect(admin.addInstance("home.example")).rejects.toMatchObject({ status: 400 });
    vi.mocked(blockedDomainsRepo.policyFor).mockResolvedValue("limit");
    await expect(admin.addInstance("noisy.example")).rejects.toMatchObject({ status: 400 });
    await expect(admin.addInstance("not a domain")).rejects.toMatchObject({ status: 400 });
    expect(instancesRepo.addManual).not.toHaveBeenCalled();
  });

  test("switching auto-cache on checks the blocklist; off never does", async () => {
    vi.mocked(blockedDomainsRepo.policyFor).mockResolvedValue("suspend");
    await expect(admin.setAutoCache("peer.example", true)).rejects.toMatchObject({ status: 400 });
    vi.mocked(instancesRepo.setAutoCache).mockResolvedValue(row({ autoCache: false }));
    expect(await admin.setAutoCache("peer.example", false)).toMatchObject({ autoCache: false });
    vi.mocked(instancesRepo.setAutoCache).mockResolvedValue(undefined);
    await expect(admin.setAutoCache("ghost.example", false)).rejects.toMatchObject({ status: 404 });
  });

  test("a FediDB instance can be switched off but not removed", async () => {
    vi.mocked(instancesRepo.find).mockResolvedValue(row({ source: "fedidb" }));
    await expect(admin.removeInstance("peer.example")).rejects.toMatchObject({ status: 400 });
    vi.mocked(instancesRepo.find).mockResolvedValue(row({ source: "manual" }));
    await admin.removeInstance("peer.example");
    expect(instancesRepo.remove).toHaveBeenCalledWith("peer.example");
    vi.mocked(instancesRepo.find).mockResolvedValue(undefined);
    await expect(admin.removeInstance("ghost.example")).rejects.toMatchObject({ status: 404 });
  });
});

describe("sync and discovery on demand", () => {
  test("syncs now, or 409s while a sync already runs", async () => {
    vi.mocked(instancesRepo.find).mockResolvedValue(row());
    vi.mocked(sync.syncNow).mockResolvedValue(row({ postsSynced: 4 }));
    expect(await admin.syncInstanceNow("peer.example")).toMatchObject({ postsSynced: 4 });
    vi.mocked(sync.syncNow).mockResolvedValue(undefined);
    await expect(admin.syncInstanceNow("peer.example")).rejects.toMatchObject({ status: 409 });
  });

  test("both need federation running", async () => {
    seedFederationRunning(false);
    await expect(admin.syncInstanceNow("peer.example")).rejects.toMatchObject({ status: 400 });
    await expect(admin.discoverNow()).rejects.toMatchObject({ status: 400 });
    expect(sync.discover).not.toHaveBeenCalled();
  });
});

describe("resolveForBlock", () => {
  test("names the actor by id and handle, and resolves nothing while federation is off", async () => {
    vi.mocked(resolveActor).mockResolvedValue(remoteActorRow({ apId: "https://x.example/u/1", handle: "u@x.example" }));
    expect(await admin.resolveForBlock("u@x.example")).toEqual({
      apId: "https://x.example/u/1",
      handle: "u@x.example",
    });
    seedFederationRunning(false);
    expect(await admin.resolveForBlock("u@x.example")).toBeNull();
  });
});
