// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, expect, test } from "vitest";
import * as reportsRepo from "@/db/repositories/reports.ts";
import { closeDb, mkPost, mkUser, resetDb } from "../../harness.ts";

afterAll(closeDb);
beforeEach(resetDb);

const at = (n: number) => new Date(Date.UTC(2026, 0, n));

test("the queue: enriched rows, newest first, filterable by status", async () => {
  const [ada, bob, mod] = [await mkUser("ada"), await mkUser("bob"), await mkUser("mod")];
  const post = await mkPost(bob.id, "spam");
  const onPost = await reportsRepo.create({
    reporterId: ada.id,
    subjectType: "post",
    postId: post.id,
    reason: "spam",
    createdAt: at(1),
  });
  await reportsRepo.create({
    reporterId: ada.id,
    subjectType: "user",
    userId: bob.id,
    reason: "abuse",
    createdAt: at(2),
  });

  const all = await reportsRepo.list();
  expect(all.map((r) => r.subjectType)).toEqual(["user", "post"]);
  expect(all[1]).toMatchObject({
    reporter: { username: "ada", displayName: "ada" },
    postId: post.id,
    postTitle: "spam",
    postAuthor: "bob",
    userId: null,
    status: "open",
  });
  expect(all[0]).toMatchObject({ userUsername: "bob", postTitle: null });
  expect(await reportsRepo.countOpen()).toBe(2);

  const resolved = await reportsRepo.resolve(onPost.id, mod.id, "removed");
  expect(resolved).toMatchObject({ status: "resolved", resolution: "removed", handledBy: mod.id });
  expect(resolved.resolvedAt).toBeInstanceOf(Date);
  expect((await reportsRepo.list("open")).map((r) => r.subjectType)).toEqual(["user"]);
  expect((await reportsRepo.list("resolved")).map((r) => r.id)).toEqual([onPost.id]);
  expect(await reportsRepo.countOpen()).toBe(1);
  expect(await reportsRepo.list(undefined, 1)).toHaveLength(1);
});

test("a report whose reporter was deleted keeps a null reporter", async () => {
  const bob = await mkUser("bob");
  await reportsRepo.create({ subjectType: "user", userId: bob.id, reason: "" });
  expect((await reportsRepo.list())[0].reporter).toBe(null);
});

test("everything against one account: direct reports and reports on their posts", async () => {
  const [ada, bob, cy] = [await mkUser("ada"), await mkUser("bob"), await mkUser("cy")];
  const bobPost = await mkPost(bob.id, "b");
  const cyPost = await mkPost(cy.id, "c");
  await reportsRepo.create({ reporterId: ada.id, subjectType: "user", userId: bob.id, createdAt: at(1) });
  await reportsRepo.create({ reporterId: ada.id, subjectType: "post", postId: bobPost.id, createdAt: at(2) });
  await reportsRepo.create({ reporterId: ada.id, subjectType: "post", postId: cyPost.id, createdAt: at(3) });
  const against = await reportsRepo.listAgainstUser(bob.id);
  expect(against.map((r) => r.subjectType)).toEqual(["post", "user"]);
  expect(await reportsRepo.listAgainstUser(bob.id, 1)).toHaveLength(1);
});

test("duplicate detection only counts the reporter's open reports on that subject", async () => {
  const [ada, bob, mod] = [await mkUser("ada"), await mkUser("bob"), await mkUser("mod")];
  const post = await mkPost(bob.id, "p");
  const report = await reportsRepo.create({ reporterId: ada.id, subjectType: "post", postId: post.id });
  expect(await reportsRepo.hasOpenDuplicate(ada.id, "post", post.id)).toBe(true);
  expect(await reportsRepo.hasOpenDuplicate(bob.id, "post", post.id)).toBe(false);
  expect(await reportsRepo.hasOpenDuplicate(ada.id, "user", bob.id)).toBe(false);
  await reportsRepo.resolve(report.id, mod.id, "");
  expect(await reportsRepo.hasOpenDuplicate(ada.id, "post", post.id)).toBe(false);
  expect((await reportsRepo.findById(report.id))?.status).toBe("resolved");
});
