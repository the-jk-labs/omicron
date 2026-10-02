// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, expect, test } from "vitest";
import * as commentLikesRepo from "@/db/repositories/commentLikes.ts";
import * as likesRepo from "@/db/repositories/likes.ts";
import { closeDb, mkComment, mkPost, mkUser, resetDb } from "../../harness.ts";

afterAll(closeDb);
beforeEach(resetDb);

test("post likes: idempotent add, per-viewer flag, batched counts", async () => {
  const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
  const [p1, p2, p3] = [await mkPost(ada.id, "p1"), await mkPost(ada.id, "p2"), await mkPost(ada.id, "p3")];
  await likesRepo.add(p1.id, ada.id);
  await likesRepo.add(p1.id, bob.id);
  await likesRepo.add(p1.id, bob.id);
  await likesRepo.add(p2.id, ada.id);

  const forBob = await likesRepo.statsFor([p1.id, p2.id, p3.id], bob.id);
  expect(forBob.get(p1.id)).toEqual({ count: 2, liked: true });
  expect(forBob.get(p2.id)).toEqual({ count: 1, liked: false });
  // No row at all for an unliked post; callers default it.
  expect(forBob.has(p3.id)).toBe(false);
  expect((await likesRepo.statsFor([p1.id], null)).get(p1.id)).toEqual({ count: 2, liked: false });
  expect((await likesRepo.statsFor([], bob.id)).size).toBe(0);

  await likesRepo.remove(p1.id, bob.id);
  await likesRepo.remove(p1.id, bob.id);
  expect((await likesRepo.statsFor([p1.id], bob.id)).get(p1.id)).toEqual({ count: 1, liked: false });
});

test("comment likes mirror post likes", async () => {
  const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
  const post = await mkPost(ada.id, "p");
  const [c1, c2] = [await mkComment(post.id, ada.id), await mkComment(post.id, bob.id)];
  await commentLikesRepo.add(c1.id, bob.id);
  await commentLikesRepo.add(c1.id, bob.id);
  await commentLikesRepo.add(c1.id, ada.id);

  const stats = await commentLikesRepo.statsFor([c1.id, c2.id], bob.id);
  expect(stats.get(c1.id)).toEqual({ count: 2, liked: true });
  expect(stats.has(c2.id)).toBe(false);
  expect((await commentLikesRepo.statsFor([], null)).size).toBe(0);

  await commentLikesRepo.remove(c1.id, bob.id);
  expect((await commentLikesRepo.statsFor([c1.id], null)).get(c1.id)).toEqual({ count: 1, liked: false });
});
