// SPDX-License-Identifier: AGPL-3.0-or-later
import { Accept, Announce, Block, Delete, Follow, PUBLIC_COLLECTION, Reject, Undo } from "@fedify/fedify/vocab";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { postWithAuthor, remotePostWithAuthor, userRow } from "../fixtures.ts";
import { fakeContext } from "./fakeContext.ts";

const ORIGIN = "https://blog.example";
const fake = vi.hoisted(() => ({ value: null as unknown }));

vi.mock(import("@/federation/mod.ts"), () => ({
  getFederation: (() => ({ createContext: () => (fake.value as { ctx: unknown }).ctx })) as never,
}));
vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/db/repositories/blockedDomains.ts"));

import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import {
  sendAcceptFollow,
  sendActorDelete,
  sendBlock,
  sendFollow,
  sendRecommend,
  sendRejectFollow,
  sendUndoBlock,
  sendUnfollow,
  sendUnrecommend,
} from "@/federation/outbound.ts";
import { seedFederationOrigin } from "@/services/federationState.ts";

const f = fakeContext(ORIGIN);
fake.value = f;
seedFederationOrigin(ORIGIN);

const BOB = "https://remote.example/users/bob";
const ME = `${ORIGIN}/users/ada`;

beforeEach(() => {
  f.reset();
  f.remote(BOB);
  vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "u1", username: "ada" }));
  vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue([BOB]);
  vi.mocked(blockedDomainsRepo.isBlocked).mockResolvedValue(false);
});

describe("one-to-one activities", () => {
  test("Follow", async () => {
    await sendFollow("u1", BOB);
    const [{ sender, recipients, activity }] = f.sent;
    expect([sender, recipients]).toEqual(["ada", [BOB]]);
    expect(activity).toBeInstanceOf(Follow);
    expect(activity.actorId?.href).toBe(ME);
    expect(activity.objectId?.href).toBe(BOB);
    expect(activity.id?.href).toMatch(new RegExp(`^${ME}#follows/[0-9a-f-]{36}$`));
  });

  test("Undo(Follow)", async () => {
    await sendUnfollow("u1", BOB);
    const { activity } = f.sent[0];
    expect(activity).toBeInstanceOf(Undo);
    const inner = await activity.getObject();
    expect(inner).toBeInstanceOf(Follow);
    expect((inner as Follow).objectId?.href).toBe(BOB);
  });

  test("Block and Undo(Block)", async () => {
    await sendBlock("u1", BOB);
    await sendUndoBlock("u1", BOB);
    expect(f.sent[0].activity).toBeInstanceOf(Block);
    expect(f.sent[0].activity.objectId?.href).toBe(BOB);
    expect(f.sent[1].activity).toBeInstanceOf(Undo);
    expect(await f.sent[1].activity.getObject()).toBeInstanceOf(Block);
  });

  test("Reject(Follow) names the requester as the follow's actor", async () => {
    await sendRejectFollow("u1", BOB);
    const { activity } = f.sent[0];
    expect(activity).toBeInstanceOf(Reject);
    const follow = (await activity.getObject()) as Follow;
    expect(follow.actorId?.href).toBe(BOB);
    expect(follow.objectId?.href).toBe(ME);
  });

  test("Accept(Follow) echoes the original Follow id when known", async () => {
    await sendAcceptFollow("u1", BOB, "https://remote.example/follows/9");
    await sendAcceptFollow("u1", BOB, null);
    expect(f.sent[0].activity).toBeInstanceOf(Accept);
    expect(((await f.sent[0].activity.getObject()) as Follow).id?.href).toBe("https://remote.example/follows/9");
    expect(((await f.sent[1].activity.getObject()) as Follow).id).toBe(null);
  });

  test.for([
    ["sendFollow", sendFollow],
    ["sendUnfollow", sendUnfollow],
    ["sendBlock", sendBlock],
    ["sendUndoBlock", sendUndoBlock],
    ["sendRejectFollow", sendRejectFollow],
    ["sendAcceptFollow", sendAcceptFollow],
  ] as const)("%s sends nothing for a missing user or an unresolvable target", async ([, fn]) => {
    vi.mocked(usersRepo.findById).mockResolvedValue(undefined);
    await fn("u1", BOB);
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ username: "ada" }));
    await fn("u1", "https://gone.example/users/x");
    expect(f.sent).toEqual([]);
  });
});

describe("to every remote follower", () => {
  test("Announce a local post publicly, cc followers", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1" }));
    await sendRecommend("u1", "p1");
    const { recipients, activity } = f.sent[0];
    expect(recipients).toEqual([BOB]);
    expect(activity).toBeInstanceOf(Announce);
    expect(activity.objectId?.href).toBe(`${ORIGIN}/posts/p1`);
    expect(activity.toIds.map((u) => u.href)).toEqual([PUBLIC_COLLECTION.href]);
    expect(activity.ccIds.map((u) => u.href)).toEqual([`${ME}/followers`]);
    expect(activity.id?.href).toBe(`${ME}#recommends/p1`);
  });

  test("Announce a cached remote post by its own id", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(
      remotePostWithAuthor({ id: "p2", apId: "https://remote.example/posts/7" }),
    );
    await sendRecommend("u1", "p2");
    expect(f.sent[0].activity.objectId?.href).toBe("https://remote.example/posts/7");
  });

  test("Undo(Announce) references the same Announce id", async () => {
    await sendUnrecommend("u1", "p1");
    const { activity } = f.sent[0];
    expect(activity).toBeInstanceOf(Undo);
    expect(((await activity.getObject()) as Announce).id?.href).toBe(`${ME}#recommends/p1`);
  });

  test("Delete(actor) on account deletion", async () => {
    await sendActorDelete("u1");
    const { activity } = f.sent[0];
    expect(activity).toBeInstanceOf(Delete);
    expect(activity.objectId?.href).toBe(ME);
  });

  test("nothing is sent without followers, or when none resolves", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1" }));
    vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue([]);
    await sendRecommend("u1", "p1");
    await sendActorDelete("u1");
    vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue(["https://gone.example/users/x"]);
    await sendUnrecommend("u1", "p1");
    await sendActorDelete("u1");
    expect(f.sent).toEqual([]);
  });

  test("a missing post is not announced", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(null);
    await sendRecommend("u1", "gone");
    expect(f.sent).toEqual([]);
  });

  test("never delivers to a follower on a defederated domain", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1" }));
    vi.mocked(blockedDomainsRepo.isBlocked).mockImplementation(async (host) => host === "remote.example");
    await sendRecommend("u1", "p1");
    await sendActorDelete("u1");
    expect(f.sent).toEqual([]);
  });
});
