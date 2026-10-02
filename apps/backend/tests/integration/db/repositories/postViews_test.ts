// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, expect, test } from "vitest";
import * as postViewsRepo from "@/db/repositories/postViews.ts";
import { closeDb, mkPost, mkUser, resetDb } from "../../harness.ts";

afterAll(closeDb);
beforeEach(resetDb);

test("a visitor is claimed once per post, ever", async () => {
  const ada = await mkUser("ada");
  const [p1, p2] = [await mkPost(ada.id, "p1"), await mkPost(ada.id, "p2")];
  expect(await postViewsRepo.markSeen(p1.id, "visitor-a")).toBe(true);
  expect(await postViewsRepo.markSeen(p1.id, "visitor-a")).toBe(false);
  expect(await postViewsRepo.markSeen(p2.id, "visitor-a")).toBe(true);
  expect(await postViewsRepo.markSeen(p1.id, "visitor-b")).toBe(true);
});

test("views accumulate per day and total per post", async () => {
  const ada = await mkUser("ada");
  const bob = await mkUser("bob");
  const [p1, p2] = [await mkPost(ada.id, "p1"), await mkPost(ada.id, "p2")];
  const other = await mkPost(bob.id, "other");
  await postViewsRepo.recordView(p1.id, "2026-01-01");
  await postViewsRepo.recordView(p1.id, "2026-01-01");
  await postViewsRepo.recordView(p1.id, "2026-01-03");
  await postViewsRepo.recordView(p2.id, "2026-01-03");
  await postViewsRepo.recordView(other.id, "2026-01-03");

  const totals = await postViewsRepo.totalsForPosts([p1.id, p2.id]);
  expect(Object.fromEntries(totals)).toEqual({ [p1.id]: 3, [p2.id]: 1 });
  expect((await postViewsRepo.totalsForPosts([])).size).toBe(0);

  // Only ada's posts, from the given day inclusive, oldest day first.
  expect(await postViewsRepo.dailyTotalsForAuthor(ada.id, "2026-01-01")).toEqual([
    { day: "2026-01-01", views: 2 },
    { day: "2026-01-03", views: 2 },
  ]);
  expect(await postViewsRepo.dailyTotalsForAuthor(ada.id, "2026-01-02")).toEqual([{ day: "2026-01-03", views: 2 }]);
});
