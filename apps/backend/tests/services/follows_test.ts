// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { remoteActorRow, userRow } from "../fixtures.ts";

vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/db/repositories/relations.ts"));
vi.mock(import("@/db/repositories/remoteActors.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/db/repositories/notifications.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import * as followsRepo from "@/db/repositories/follows.ts";
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { queue } from "@/queue/queue.ts";
import { follow, followersOf, followingOf, profile, removeFollower, unfollow } from "@/services/follows.ts";

const bob = userRow({ id: "bob", username: "bob" });
const privateBob = userRow({ id: "bob", username: "bob", isPrivate: true });

beforeEach(() => {
  vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(false);
  vi.mocked(relationsRepo.hasLocal).mockResolvedValue(false);
  vi.mocked(followsRepo.followState).mockResolvedValue("none");
  vi.mocked(followsRepo.isFollowing).mockResolvedValue(false);
  vi.mocked(followsRepo.counts).mockResolvedValue({ followers: 1, following: 2 });
  vi.mocked(followsRepo.listLocalFollowers).mockResolvedValue([] as never);
  vi.mocked(followsRepo.listRemoteFollowers).mockResolvedValue([] as never);
  vi.mocked(followsRepo.listLocalFollowing).mockResolvedValue([] as never);
  vi.mocked(followsRepo.listRemoteFollowing).mockResolvedValue([] as never);
});

describe("follow", () => {
  test("follows a public account instantly and notifies", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(bob);
    expect(await follow("me", "bob")).toEqual({ state: "following" });
    expect(followsRepo.createLocal).toHaveBeenCalledWith("me", "bob", true);
    expect(notificationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "bob", type: "follow", actorId: "me" }),
    );
  });

  test("requests to follow a private account", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(privateBob);
    expect(await follow("me", "bob")).toEqual({ state: "requested" });
    expect(followsRepo.createLocal).toHaveBeenCalledWith("me", "bob", false);
    expect(notificationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "bob", type: "follow_request" }),
    );
  });

  test.for(["following", "requested"] as const)("a repeat follow while %s changes nothing", async (state) => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(bob);
    vi.mocked(followsRepo.followState).mockResolvedValue(state);
    expect(await follow("me", "bob")).toEqual({ state });
    expect(followsRepo.createLocal).not.toHaveBeenCalled();
    expect(notificationsRepo.create).not.toHaveBeenCalled();
  });

  test("404s on an unknown user", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(undefined);
    await expect(follow("me", "ghost")).rejects.toMatchObject({ status: 404 });
  });

  test("refuses to follow yourself", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ id: "me" }));
    await expect(follow("me", "ada")).rejects.toMatchObject({ status: 400, message: "You cannot follow yourself." });
  });

  test("refuses across a block", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(bob);
    vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(true);
    await expect(follow("me", "bob")).rejects.toMatchObject({ status: 403 });
    expect(followsRepo.createLocal).not.toHaveBeenCalled();
  });

  // Like profile(), follow() treats an admin-deleted account as not found.
  test("refuses to follow a deleted account", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ id: "bob", deletedAt: new Date() }));
    await expect(follow("me", "bob")).rejects.toMatchObject({ status: 404 });
  });
});

describe("unfollow", () => {
  test("removes the edge and both possible notifications", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(bob);
    await unfollow("me", "bob");
    expect(followsRepo.removeLocal).toHaveBeenCalledWith("me", "bob");
    const types = vi.mocked(notificationsRepo.removeMatching).mock.calls.map(([m]) => m.type);
    expect(types.toSorted()).toEqual(["follow", "follow_request"]);
  });

  test("404s on an unknown user", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(undefined);
    await expect(unfollow("me", "ghost")).rejects.toMatchObject({ status: 404 });
  });
});

describe("removeFollower", () => {
  test("drops a local follower's edge (them -> me)", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(bob);
    await removeFollower("me", "bob");
    expect(followsRepo.removeLocal).toHaveBeenCalledWith("bob", "me");
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("drops a remote follower and federates Reject", async () => {
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(remoteActorRow());
    await removeFollower("me", "bob@remote.example");
    expect(followsRepo.removeRemoteFollower).toHaveBeenCalledWith("me", "https://remote.example/users/bob");
    expect(queue.add).toHaveBeenCalledWith("send_reject_follow", {
      userId: "me",
      targetActor: "https://remote.example/users/bob",
    });
    expect(usersRepo.findByUsername).not.toHaveBeenCalled();
  });

  test("404s on an unknown local or remote follower", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(undefined);
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(undefined);
    await expect(removeFollower("me", "ghost")).rejects.toMatchObject({ status: 404 });
    await expect(removeFollower("me", "ghost@x.example")).rejects.toMatchObject({ status: 404 });
  });
});

describe("profile", () => {
  test("anonymous viewers see the header with no relation state", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(bob);
    expect(await profile("bob", null)).toEqual({
      user: bob,
      counts: { followers: 1, following: 2 },
      followState: "none",
      isFollowing: false,
      isMuted: false,
      isBlocked: false,
      locked: false,
    });
    expect(relationsRepo.hasLocal).not.toHaveBeenCalled();
  });

  test("a deleted account is not found", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ deletedAt: new Date() }));
    await expect(profile("ada", null)).rejects.toMatchObject({ status: 404 });
  });

  test("a block in either direction reads as not found", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(bob);
    vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(true);
    await expect(profile("bob", "me")).rejects.toMatchObject({ status: 404 });
  });

  test("viewing your own profile never checks blocks or follow state", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(privateBob);
    const out = await profile("bob", "bob");
    expect(out.locked).toBe(false);
    expect(out.followState).toBe("none");
    expect(relationsRepo.localBlockExists).not.toHaveBeenCalled();
    expect(followsRepo.followState).not.toHaveBeenCalled();
  });

  test("a private profile is locked for a non-follower and a pending requester", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(privateBob);
    expect((await profile("bob", null)).locked).toBe(true);
    vi.mocked(followsRepo.followState).mockResolvedValue("requested");
    const requested = await profile("bob", "me");
    expect(requested.locked).toBe(true);
    expect(requested.isFollowing).toBe(false);
  });

  test("a private profile is open to an approved follower", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(privateBob);
    vi.mocked(followsRepo.followState).mockResolvedValue("following");
    expect(await profile("bob", "me")).toMatchObject({ locked: false, isFollowing: true });
  });

  test("reports mute and block state for a signed-in viewer", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(bob);
    vi.mocked(relationsRepo.hasLocal).mockImplementation(async (kind) => kind === "mute");
    expect(await profile("bob", "me")).toMatchObject({ isMuted: true, isBlocked: false });
  });
});

describe.each([
  ["followersOf", followersOf, "listLocalFollowers", "listRemoteFollowers"],
  ["followingOf", followingOf, "listLocalFollowing", "listRemoteFollowing"],
] as const)("%s", (_name, fn, localList, remoteList) => {
  test("lists local then remote accounts", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(bob);
    vi.mocked(followsRepo[localList]).mockResolvedValue([
      { id: "u1", username: "ann", displayName: "Ann", avatarUrl: null },
    ] as never);
    vi.mocked(followsRepo[remoteList]).mockResolvedValue([
      { id: "a1", handle: "c@x.example", displayName: "C", avatarUrl: null },
    ] as never);
    expect((await fn("bob", "me")).map((a) => a.username)).toEqual(["ann", "c@x.example"]);
    expect(followsRepo[localList]).toHaveBeenCalledWith("bob", "me");
  });

  test("404s for a missing or deleted account", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(undefined);
    await expect(fn("ghost")).rejects.toMatchObject({ status: 404 });
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ deletedAt: new Date() }));
    await expect(fn("ada")).rejects.toMatchObject({ status: 404 });
  });

  test("a locked private account returns an empty list to strangers", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(privateBob);
    expect(await fn("bob", null)).toEqual([]);
    expect(await fn("bob", "me")).toEqual([]);
    expect(followsRepo[localList]).not.toHaveBeenCalled();
  });

  test("a private account's own list is visible to itself and approved followers", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(privateBob);
    await fn("bob", "bob");
    expect(followsRepo[localList]).toHaveBeenCalledTimes(1);
    vi.mocked(followsRepo.isFollowing).mockResolvedValue(true);
    await fn("bob", "me");
    expect(followsRepo[localList]).toHaveBeenCalledTimes(2);
  });
});
