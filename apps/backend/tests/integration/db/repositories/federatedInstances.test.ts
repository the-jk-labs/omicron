// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import * as instancesRepo from "@/db/repositories/federatedInstances.ts";
import { closeDb, mkRemoteActor, mkRemotePost, resetDb } from "../../harness.ts";

afterAll(closeDb);
beforeEach(resetDb);

const MIN = 60_000;
// Ahead of the rows' `next_sync_at DEFAULT now()`, so they are due.
const now = new Date(Date.now() + 60 * MIN);
const stale = new Date(now.getTime() - 30 * MIN);
const domains = async () => (await instancesRepo.list()).map((r) => [r.domain, r.source, r.autoCache]);

describe("adding", () => {
  test("discovery only ever adds, so an admin's off switch survives the next run", async () => {
    expect(await instancesRepo.addDiscovered(["a.example", "b.example"])).toEqual(["a.example", "b.example"]);
    await instancesRepo.setAutoCache("a.example", false);
    expect(await instancesRepo.addDiscovered(["a.example", "c.example"])).toEqual(["c.example"]);
    expect(await domains()).toEqual([
      ["a.example", "fedidb", false],
      ["b.example", "fedidb", true],
      ["c.example", "fedidb", true],
    ]);
    expect(await instancesRepo.addDiscovered([])).toEqual([]);
  });

  test("adding by hand takes over a listed instance and switches it back on", async () => {
    await instancesRepo.addDiscovered(["a.example"]);
    await instancesRepo.setAutoCache("a.example", false);
    const row = await instancesRepo.addManual("a.example");
    expect(row).toMatchObject({ source: "manual", autoCache: true, status: "pending" });
  });

  test("blocking a domain switches off it and its subdomains, nothing else", async () => {
    await instancesRepo.addDiscovered(["bad.example", "blog.bad.example", "notbad.example"]);
    await instancesRepo.disableUnder("bad.example");
    expect(await domains()).toEqual([
      ["bad.example", "fedidb", false],
      ["blog.bad.example", "fedidb", false],
      ["notbad.example", "fedidb", true],
    ]);
  });
});

describe("leasing", () => {
  test("claims due, switched-on instances once, oldest first", async () => {
    await instancesRepo.addDiscovered(["a.example", "b.example", "off.example", "later.example"]);
    await instancesRepo.setAutoCache("off.example", false);
    await instancesRepo.finishSync("later.example", now, {
      succeeded: true,
      status: "ok",
      lastError: null,
      software: "omicron",
      softwareVersion: null,
      nodeName: null,
      userCount: null,
      activeMonth: null,
      localPosts: null,
      actorsSynced: 0,
      postsSynced: 0,
      consecutiveFailures: 0,
      nextSyncAt: new Date(now.getTime() + 60 * MIN),
    });
    const first = await instancesRepo.claimDue(10, now, stale);
    expect(first.map((r) => r.domain).toSorted()).toEqual(["a.example", "b.example"]);
    expect(first.every((r) => r.syncStartedAt?.getTime() === now.getTime())).toBe(true);
    // Leased rows aren't handed out again until the lease goes stale.
    expect(await instancesRepo.claimDue(10, now, stale)).toEqual([]);
    const later = new Date(now.getTime() + 31 * MIN);
    expect((await instancesRepo.claimDue(1, later, new Date(later.getTime() - 30 * MIN))).length).toBe(1);
  });

  test("claimOne ignores the schedule but respects a fresh lease", async () => {
    await instancesRepo.addDiscovered(["a.example"]);
    expect(await instancesRepo.claimOne("a.example", now, stale)).toBeDefined();
    expect(await instancesRepo.claimOne("a.example", now, stale)).toBeUndefined();
    expect(await instancesRepo.claimOne("ghost.example", now, stale)).toBeUndefined();
  });

  test("finishing records the outcome and releases the lease", async () => {
    await instancesRepo.addDiscovered(["a.example"]);
    await instancesRepo.claimOne("a.example", now, stale);
    const failed = await instancesRepo.finishSync("a.example", now, {
      succeeded: false,
      status: "error",
      lastError: "HTTP 503",
      software: null,
      softwareVersion: null,
      nodeName: null,
      userCount: null,
      activeMonth: null,
      localPosts: null,
      actorsSynced: 0,
      postsSynced: 0,
      consecutiveFailures: 1,
      nextSyncAt: new Date(now.getTime() + 60 * MIN),
    });
    expect(failed).toMatchObject({ status: "error", lastError: "HTTP 503", syncStartedAt: null, lastSuccessAt: null });
    expect(failed.lastSyncedAt?.getTime()).toBe(now.getTime());
    expect(await instancesRepo.claimOne("a.example", now, stale)).toBeDefined();
  });

  test("the database refuses an unknown status or source", async () => {
    await instancesRepo.addDiscovered(["a.example"]);
    await expect(instancesRepo.finishSync("a.example", now, { status: "weird" } as never)).rejects.toMatchObject({
      cause: { constraint_name: "federated_instances_status_ck" },
    });
  });
});

test("cache counts are per host, port kept, including actors without posts", async () => {
  const ada = await mkRemoteActor("ada@peer.example");
  const bob = await mkRemoteActor("bob@blog.peer.example:8443");
  await mkRemoteActor("idle@peer.example");
  await mkRemotePost(ada.id, "https://peer.example/p/1");
  await mkRemotePost(ada.id, "https://peer.example/p/2");
  await mkRemotePost(bob.id, "https://blog.peer.example:8443/p/1");
  const counts = (await instancesRepo.cacheCountsByHost()).toSorted((a, b) => a.host.localeCompare(b.host));
  expect(counts).toEqual([
    { host: "blog.peer.example:8443", actors: 1, posts: 1 },
    { host: "peer.example", actors: 2, posts: 2 },
  ]);
});
