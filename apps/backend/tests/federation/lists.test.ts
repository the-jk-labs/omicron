// SPDX-License-Identifier: AGPL-3.0-or-later
import { Add, PUBLIC_COLLECTION, Remove } from "@fedify/fedify/vocab";
import { beforeEach, expect, test, vi } from "vitest";
import { postWithAuthor, remotePostWithAuthor, userRow } from "../fixtures.ts";
import { fakeContext } from "./fakeContext.ts";

const ORIGIN = "https://blog.example";
const fake = vi.hoisted(() => ({ value: null as unknown }));

vi.mock(import("@/federation/mod.ts"), () => ({
  getFederation: (() => ({ createContext: () => (fake.value as { ctx: unknown }).ctx })) as never,
}));
vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/readingLists.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/db/repositories/blockedDomains.ts"));

import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { deliverListItem } from "@/federation/lists.ts";
import { seedFederationOrigin } from "@/services/federationState.ts";

const f = fakeContext(ORIGIN);
fake.value = f;
seedFederationOrigin(ORIGIN);

const BOB = "https://remote.example/users/bob";

beforeEach(() => {
  f.reset();
  f.remote(BOB);
  vi.mocked(listsRepo.findById).mockResolvedValue({ id: "l1", userId: "u1", visibility: "public" } as never);
  vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "u1", username: "ada" }));
  vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue([BOB]);
  vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1" }));
  vi.mocked(blockedDomainsRepo.isBlocked).mockResolvedValue(false);
});

test("Add a local post to the list collection, publicly", async () => {
  await deliverListItem("l1", "p1", "add");
  const { sender, recipients, activity } = f.sent[0];
  expect([sender, recipients]).toEqual(["ada", [BOB]]);
  expect(activity).toBeInstanceOf(Add);
  expect(activity.objectId?.href).toBe(`${ORIGIN}/posts/p1`);
  expect(activity.targetId?.href).toBe(`${ORIGIN}/users/ada/lists/l1`);
  expect(activity.toIds.map((u) => u.href)).toEqual([PUBLIC_COLLECTION.href]);
});

test("Remove references a cached remote post by its own id", async () => {
  vi.mocked(postsRepo.findById).mockResolvedValue(remotePostWithAuthor({ apId: "https://remote.example/posts/7" }));
  await deliverListItem("l1", "p1", "remove");
  expect(f.sent[0].activity).toBeInstanceOf(Remove);
  expect(f.sent[0].activity.objectId?.href).toBe("https://remote.example/posts/7");
});

test.for([
  [
    "a private list",
    () => vi.mocked(listsRepo.findById).mockResolvedValue({ id: "l1", userId: "u1", visibility: "private" } as never),
  ],
  ["a missing list", () => vi.mocked(listsRepo.findById).mockResolvedValue(undefined)],
  ["a missing owner", () => vi.mocked(usersRepo.findById).mockResolvedValue(undefined)],
  ["no remote followers", () => vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue([])],
  ["a missing post", () => vi.mocked(postsRepo.findById).mockResolvedValue(null)],
  [
    "no resolvable follower",
    () => vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue(["https://gone.example/x"]),
  ],
] as const)("sends nothing for %s", async ([, arrange]) => {
  arrange();
  await deliverListItem("l1", "p1", "add");
  expect(f.sent).toEqual([]);
});

test("never delivers to a follower on a defederated domain", async () => {
  vi.mocked(blockedDomainsRepo.isBlocked).mockImplementation(async (host) => host === "remote.example");
  await deliverListItem("l1", "p1", "add");
  expect(f.sent).toEqual([]);
});
