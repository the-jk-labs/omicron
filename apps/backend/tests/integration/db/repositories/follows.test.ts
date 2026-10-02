// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import { closeDb, mkRemoteActor, mkUser, resetDb } from "../../harness.ts";

const byText = (a: unknown, b: unknown) => String(a).localeCompare(String(b));

afterAll(closeDb);
beforeEach(resetDb);

const EVE = "https://remote.example/users/eve";

describe("local edges", () => {
  test("follow state moves none → requested → following; duplicates are ignored", async () => {
    const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
    expect(await followsRepo.followState(ada.id, bob.id)).toBe("none");
    const req = await followsRepo.createLocal(ada.id, bob.id, false);
    expect(await followsRepo.createLocal(ada.id, bob.id)).toBeUndefined();
    expect(await followsRepo.followState(ada.id, bob.id)).toBe("requested");
    expect(await followsRepo.isFollowing(ada.id, bob.id)).toBe(false);

    await followsRepo.approve(req.id);
    expect(await followsRepo.followState(ada.id, bob.id)).toBe("following");
    expect(await followsRepo.isFollowing(ada.id, bob.id)).toBe(true);

    await followsRepo.removeLocal(ada.id, bob.id);
    expect(await followsRepo.followState(ada.id, bob.id)).toBe("none");
  });

  test("severing drops both directions", async () => {
    const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
    await followsRepo.createLocal(ada.id, bob.id);
    await followsRepo.createLocal(bob.id, ada.id);
    await followsRepo.severLocal(bob.id, ada.id);
    expect(await followsRepo.counts(ada.id)).toEqual({ followers: 0, following: 0 });
  });

  test("counts and lists include approved edges only", async () => {
    const [ada, bob, cy] = [await mkUser("ada"), await mkUser("bob"), await mkUser("cy")];
    await followsRepo.createLocal(bob.id, ada.id);
    await followsRepo.createLocal(cy.id, ada.id, false);
    await followsRepo.createLocal(ada.id, cy.id);
    await followsRepo.createRemoteFollower(ada.id, EVE);
    expect(await followsRepo.counts(ada.id)).toEqual({ followers: 2, following: 1 });
    expect((await followsRepo.listLocalFollowers(ada.id)).map((u) => u.username)).toEqual(["bob"]);
    expect((await followsRepo.listLocalFollowing(ada.id)).map((u) => u.username)).toEqual(["cy"]);
    expect(await followsRepo.localFollowerUsernames(ada.id)).toEqual(["bob"]);
  });

  test("follower lists hide users across a block from the viewer", async () => {
    const [ada, bob, cy, viewer] = [await mkUser("ada"), await mkUser("bob"), await mkUser("cy"), await mkUser("v")];
    await followsRepo.createLocal(bob.id, ada.id);
    await followsRepo.createLocal(cy.id, ada.id);
    await relationsRepo.addLocal("block", viewer.id, bob.id);
    await relationsRepo.addLocal("block", cy.id, viewer.id);
    expect(await followsRepo.listLocalFollowers(ada.id, viewer.id)).toEqual([]);
    expect(await followsRepo.listLocalFollowers(ada.id, null)).toHaveLength(2);
  });
});

describe("inbound remote followers", () => {
  test("only approved, cached followers are listed; all approved ones are delivered to", async () => {
    const ada = await mkUser("ada");
    const eve = await mkRemoteActor("eve@remote.example");
    await followsRepo.createRemoteFollower(ada.id, EVE);
    await followsRepo.createRemoteFollower(ada.id, "https://uncached.example/users/u");
    await followsRepo.createRemoteFollower(ada.id, "https://pending.example/users/p", false, "https://p/f/1");
    expect((await followsRepo.remoteFollowerActors(ada.id)).toSorted(byText)).toEqual(
      [EVE, "https://uncached.example/users/u"].toSorted(byText),
    );
    expect((await followsRepo.listRemoteFollowers(ada.id)).map((a) => a.id)).toEqual([eve.id]);
    await relationsRepo.addRemote("block", ada.id, eve.id);
    expect(await followsRepo.listRemoteFollowers(ada.id, ada.id)).toEqual([]);

    await followsRepo.removeRemoteFollower(ada.id, EVE);
    expect(await followsRepo.remoteFollowerActors(ada.id)).toEqual(["https://uncached.example/users/u"]);
  });

  // BUG: inbound remote follow edges have no unique index (only local→local and
  // local→remote do) and createRemoteFollower is a plain insert, so a second
  // Follow from the same actor (a fresh Follow id after a lost Accept, which
  // several servers resend) adds a second edge. Follower counts and lists then
  // show the actor twice, and a private account sees the request twice.
  test.fails("BUG: a repeated Follow from the same remote actor is one edge", async () => {
    const ada = await mkUser("ada");
    await followsRepo.createRemoteFollower(ada.id, EVE);
    await followsRepo.createRemoteFollower(ada.id, EVE).catch(() => {});
    expect(await followsRepo.counts(ada.id)).toEqual({ followers: 1, following: 0 });
  });

  test("pending requests are listed for the owner and can be found, approved or removed", async () => {
    const [ada, bob, cy] = [await mkUser("ada"), await mkUser("bob"), await mkUser("cy")];
    const eve = await mkRemoteActor("eve@remote.example");
    await followsRepo.createLocal(bob.id, ada.id, false);
    const remoteReq = await followsRepo.createRemoteFollower(ada.id, EVE, false, "https://remote.example/f/1");

    expect((await followsRepo.listLocalFollowRequests(ada.id)).map((r) => r.username)).toEqual(["bob"]);
    const [remote] = await followsRepo.listRemoteFollowRequests(ada.id);
    expect(remote).toMatchObject({ followId: remoteReq.id, id: eve.id });
    expect(await followsRepo.pendingInboundEdges(ada.id)).toHaveLength(2);

    // Scoped to the owner.
    expect(await followsRepo.findInboundRequest(cy.id, remoteReq.id)).toBeUndefined();
    expect((await followsRepo.findInboundRequest(ada.id, remoteReq.id))?.followActivityId).toBe(
      "https://remote.example/f/1",
    );

    await followsRepo.approve(remoteReq.id);
    expect(await followsRepo.findInboundRequest(ada.id, remoteReq.id)).toBeUndefined();
    expect(await followsRepo.remoteFollowerActors(ada.id)).toEqual([EVE]);

    const [local] = await followsRepo.listLocalFollowRequests(ada.id);
    await followsRepo.removeById(local.followId);
    expect(await followsRepo.pendingInboundEdges(ada.id)).toEqual([]);
  });
});

describe("outbound remote follows", () => {
  test("start pending, count once accepted, and are idempotent", async () => {
    const ada = await mkUser("ada");
    const eve = await mkRemoteActor("eve@remote.example");
    await followsRepo.createRemoteFollowing(ada.id, eve.id);
    expect(await followsRepo.createRemoteFollowing(ada.id, eve.id)).toBeUndefined();
    expect(await followsRepo.isFollowingRemote(ada.id, eve.id)).toBe(true);
    expect(await followsRepo.counts(ada.id)).toEqual({ followers: 0, following: 0 });
    expect(await followsRepo.listRemoteFollowing(ada.id)).toEqual([]);

    await followsRepo.approveRemoteFollowing(ada.id, eve.id);
    expect(await followsRepo.counts(ada.id)).toEqual({ followers: 0, following: 1 });
    expect((await followsRepo.listRemoteFollowing(ada.id)).map((a) => a.handle)).toEqual(["eve@remote.example"]);
    // An outbound pending follow is never mistaken for an inbound request.
    expect(await followsRepo.pendingInboundEdges(ada.id)).toEqual([]);

    await followsRepo.removeRemoteFollowing(ada.id, eve.id);
    expect(await followsRepo.isFollowingRemote(ada.id, eve.id)).toBe(false);
  });
});
