// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test, vi } from "vitest";
import { remoteActorRow, userRow } from "../fixtures.ts";

vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/db/repositories/relations.ts"));
vi.mock(import("@/db/repositories/remoteActors.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/remoteProfiles.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import * as followsRepo from "@/db/repositories/follows.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { queue } from "@/queue/queue.ts";
import { listRelation, setLocal, setRemote } from "@/services/relations.ts";
import * as remoteProfiles from "@/services/remoteProfiles.ts";

const target = userRow({ id: "target", username: "bob" });
const actor = remoteActorRow({ id: "actor", apId: "https://x.example/users/bob" });

describe("setLocal", () => {
  test("404s on an unknown username", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(undefined);
    await expect(setLocal("mute", "me", "ghost", true)).rejects.toMatchObject({ status: 404 });
  });

  test.for(["mute", "block"] as const)("refuses to %s yourself", async (kind) => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ id: "me" }));
    await expect(setLocal(kind, "me", "ada", true)).rejects.toMatchObject({
      status: 400,
      message: `You cannot ${kind} yourself.`,
    });
    expect(relationsRepo.addLocal).not.toHaveBeenCalled();
  });

  test("muting adds the edge and leaves follows alone", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(target);
    await setLocal("mute", "me", "bob", true);
    expect(relationsRepo.addLocal).toHaveBeenCalledWith("mute", "me", "target");
    expect(followsRepo.severLocal).not.toHaveBeenCalled();
  });

  test("blocking also severs follows in both directions", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(target);
    await setLocal("block", "me", "bob", true);
    expect(relationsRepo.addLocal).toHaveBeenCalledWith("block", "me", "target");
    expect(followsRepo.severLocal).toHaveBeenCalledWith("me", "target");
  });

  test.for(["mute", "block"] as const)("un-%s removes only the edge", async (kind) => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(target);
    await setLocal(kind, "me", "bob", false);
    expect(relationsRepo.removeLocal).toHaveBeenCalledWith(kind, "me", "target");
    expect(followsRepo.severLocal).not.toHaveBeenCalled();
  });
});

describe("setRemote", () => {
  test("resolves the actor over federation when turning a relation on", async () => {
    vi.mocked(remoteProfiles.getProfile).mockResolvedValue(actor);
    await setRemote("mute", "me", "bob@x.example", true);
    expect(remoteProfiles.getProfile).toHaveBeenCalledWith("bob@x.example");
    expect(relationsRepo.addRemote).toHaveBeenCalledWith("mute", "me", "actor");
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("only reads the cache when turning a relation off", async () => {
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(actor);
    await setRemote("mute", "me", "bob@x.example", false);
    expect(remoteProfiles.getProfile).not.toHaveBeenCalled();
    expect(relationsRepo.removeRemote).toHaveBeenCalledWith("mute", "me", "actor");
  });

  test("404s when the remote actor is unknown", async () => {
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(undefined);
    await expect(setRemote("block", "me", "nobody@x.example", false)).rejects.toMatchObject({ status: 404 });
  });

  test("blocking severs both follow directions and federates Block", async () => {
    vi.mocked(remoteProfiles.getProfile).mockResolvedValue(actor);
    await setRemote("block", "me", "bob@x.example", true);
    expect(followsRepo.removeRemoteFollowing).toHaveBeenCalledWith("me", "actor");
    expect(followsRepo.removeRemoteFollower).toHaveBeenCalledWith("me", "https://x.example/users/bob");
    expect(queue.add).toHaveBeenCalledWith("send_block", {
      blockerId: "me",
      targetActor: "https://x.example/users/bob",
    });
  });

  test("unblocking federates Undo(Block)", async () => {
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(actor);
    await setRemote("block", "me", "bob@x.example", false);
    expect(relationsRepo.removeRemote).toHaveBeenCalledWith("block", "me", "actor");
    expect(queue.add).toHaveBeenCalledWith("send_unblock", {
      blockerId: "me",
      targetActor: "https://x.example/users/bob",
    });
  });

  test("unmuting sends nothing over federation", async () => {
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(actor);
    await setRemote("mute", "me", "bob@x.example", false);
    expect(queue.add).not.toHaveBeenCalled();
  });
});

test("listRelation merges local then remote targets in one shape", async () => {
  vi.mocked(relationsRepo.listLocalTargets).mockResolvedValue([
    { id: "u1", username: "ann", displayName: "Ann", avatarUrl: null },
  ] as never);
  vi.mocked(relationsRepo.listRemoteTargets).mockResolvedValue([
    { id: "a1", handle: "bob@x.example", displayName: "Bob", avatarUrl: "https://x.example/a.png" },
  ] as never);
  expect(await listRelation("block", "me")).toEqual([
    { id: "u1", username: "ann", displayName: "Ann", avatarUrl: null, remote: false },
    { id: "a1", username: "bob@x.example", displayName: "Bob", avatarUrl: "https://x.example/a.png", remote: true },
  ]);
  expect(relationsRepo.listLocalTargets).toHaveBeenCalledWith("block", "me");
});
