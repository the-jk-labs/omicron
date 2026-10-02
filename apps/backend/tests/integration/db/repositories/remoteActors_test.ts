// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { db } from "@/db/client.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import * as recommendationsRepo from "@/db/repositories/recommendations.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import { posts } from "@/db/schema.ts";
import { closeDb, mkPost, mkRemoteActor, mkRemotePost, mkUser, resetDb } from "../../harness.ts";

const byText = (a: unknown, b: unknown) => String(a).localeCompare(String(b));

afterAll(closeDb);
beforeEach(resetDb);

const DAY = 86_400_000;

describe("upsert", () => {
  test("inserts, then refreshes in place keyed by apId", async () => {
    const base = {
      apId: "https://remote.example/users/eve",
      handle: "eve@remote.example",
      username: "eve",
      host: "remote.example",
      displayName: "Eve",
      bio: "",
      avatarUrl: null,
      inboxUrl: "https://remote.example/users/eve/inbox",
      sharedInboxUrl: null,
      outboxUrl: null,
      followersCount: 1,
      followingCount: 2,
    };
    const first = await remoteActorsRepo.upsert(base);
    const second = await remoteActorsRepo.upsert({ ...base, displayName: "Eve 2", followersCount: 10 });
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ displayName: "Eve 2", followersCount: 10 });
    expect(second.fetchedAt.getTime()).toBeGreaterThanOrEqual(first.fetchedAt.getTime());
    expect((await remoteActorsRepo.findByHandle("eve@remote.example"))?.id).toBe(first.id);
    expect((await remoteActorsRepo.findByApId(base.apId))?.displayName).toBe("Eve 2");
  });
});

describe("search", () => {
  test("matches handle or display name, case-insensitively", async () => {
    await mkRemoteActor("eve@remote.example", { displayName: "Evelyn" });
    await mkRemoteActor("zed@other.example", { displayName: "Zed" });
    expect((await remoteActorsRepo.search("EVE")).map((a) => a.handle)).toEqual(["eve@remote.example"]);
    expect((await remoteActorsRepo.search("other.example")).map((a) => a.handle)).toEqual(["zed@other.example"]);
    expect(await remoteActorsRepo.search("nobody")).toEqual([]);
  });

  test("LIKE wildcards in the query are literal", async () => {
    await mkRemoteActor("eve@remote.example");
    expect(await remoteActorsRepo.search("%")).toEqual([]);
    expect(await remoteActorsRepo.search("_")).toEqual([]);
  });

  test("respects the limit", async () => {
    for (const n of ["a", "b", "c"]) await mkRemoteActor(`${n}@remote.example`);
    expect(await remoteActorsRepo.search("remote", 2)).toHaveLength(2);
  });
});

describe("removal", () => {
  test("by apId reports whether anything went, and cascades the actor's posts", async () => {
    const eve = await mkRemoteActor("eve@remote.example");
    await mkRemotePost(eve.id, "https://remote.example/posts/1");
    expect(await remoteActorsRepo.removeByApId(eve.apId)).toBe(true);
    expect(await remoteActorsRepo.removeByApId(eve.apId)).toBe(false);
    expect(await db.select().from(posts)).toEqual([]);
  });

  test("by id", async () => {
    const eve = await mkRemoteActor("eve@remote.example");
    await remoteActorsRepo.removeById(eve.id);
    expect(await remoteActorsRepo.findByApId(eve.apId)).toBeUndefined();
  });

  test("by domain takes the domain and its subdomains, nothing else", async () => {
    await mkRemoteActor("a@bad.example");
    await mkRemoteActor("b@social.bad.example");
    await mkRemoteActor("c@notbad.example");
    await mkRemoteActor("d@bad.example.org");
    expect(await remoteActorsRepo.removeByDomain("bad.example")).toBe(2);
    expect((await remoteActorsRepo.search("@")).map((a) => a.handle).toSorted(byText)).toEqual([
      "c@notbad.example",
      "d@bad.example.org",
    ]);
  });

  // BUG: cacheActor stores `host` from URL.host, which keeps a non-default port,
  // but the purge compares the bare domain, so defederating bad.example leaves
  // every actor on bad.example:8443 (and its cached posts) in place. See B40.
  test.fails("BUG: by domain also takes actors on a non-default port", async () => {
    await mkRemoteActor("a@bad.example:8443");
    expect(await remoteActorsRepo.removeByDomain("bad.example")).toBe(1);
  });
});

describe("listPrunable", () => {
  test("stale actors with no surviving edge, up to the limit", async () => {
    const ada = await mkUser("ada");
    const old = new Date(Date.now() - 60 * DAY);
    const cutoff = new Date(Date.now() - 30 * DAY);
    const stale = await mkRemoteActor("stale@x.example", { fetchedAt: old });
    await mkRemoteActor("fresh@x.example");
    const followed = await mkRemoteActor("followed@x.example", { fetchedAt: old });
    const muted = await mkRemoteActor("muted@x.example", { fetchedAt: old });
    const blocked = await mkRemoteActor("blocked@x.example", { fetchedAt: old });
    const booster = await mkRemoteActor("booster@x.example", { fetchedAt: old });
    const notifier = await mkRemoteActor("notifier@x.example", { fetchedAt: old });

    await followsRepo.createRemoteFollowing(ada.id, followed.id);
    await relationsRepo.addRemote("mute", ada.id, muted.id);
    await relationsRepo.addRemote("block", ada.id, blocked.id);
    const post = await mkPost(ada.id, "p");
    await recommendationsRepo.addRemote(post.id, booster.id);
    await notificationsRepo.create({ recipientId: ada.id, type: "follow", remoteActorId: notifier.id });

    expect(await remoteActorsRepo.listPrunable(cutoff, 10)).toEqual([{ id: stale.id }]);
    await mkRemoteActor("stale2@x.example", { fetchedAt: old });
    expect(await remoteActorsRepo.listPrunable(cutoff, 1)).toHaveLength(1);
  });
});
