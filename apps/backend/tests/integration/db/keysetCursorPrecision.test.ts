// SPDX-License-Identifier: AGPL-3.0-or-later
// Keyset cursors carry their timestamp through a JS Date, which holds whole
// milliseconds. Every cursor column must therefore store milliseconds too:
// with Postgres's default microseconds, two rows inside one millisecond are
// cut apart by the cursor and the second one is skipped on the next page.
// Each case puts two rows 400µs apart in the same millisecond, pages through
// them one at a time exactly as the services build cursors, and expects both.
import { sql as rawSql } from "drizzle-orm";
import { afterAll, beforeEach, expect, test } from "vitest";
import { db } from "@/db/client.ts";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import * as recsRepo from "@/db/repositories/recommendations.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import type { Cursor } from "@/lib/pagination.ts";
import { addToList, closeDb, mkComment, mkList, mkPost, mkUser, recommend, resetDb } from "../harness.ts";

afterAll(closeDb);
beforeEach(resetDb);

const EARLY = "2026-03-01 12:00:00.000300+00";
const LATE = "2026-03-01 12:00:00.000700+00";

// Stamps two rows into one millisecond, `late` after `early`.
async function sameMillisecond(table: string, column: string, early: string, late: string) {
  await db.execute(rawSql.raw(`update ${table} set ${column} = '${EARLY}' where id = '${early}'`));
  await db.execute(rawSql.raw(`update ${table} set ${column} = '${LATE}' where id = '${late}'`));
}

// Pages with a limit of one until the end, collecting ids in order.
async function walk(page: (cursor: Cursor | null) => Promise<{ id: string; at: Date }[]>): Promise<string[]> {
  const seen: string[] = [];
  let cursor: Cursor | null = null;
  for (let i = 0; i < 5; i++) {
    const rows = await page(cursor);
    if (rows.length === 0) break;
    seen.push(rows[0].id);
    if (rows.length < 2) break;
    cursor = { createdAt: rows[0].at.toISOString(), id: rows[0].id };
  }
  return seen;
}

test("reading-list items", async () => {
  const ada = await mkUser("ada");
  const list = await mkList(ada.id, "L", "public");
  await addToList(list.id, (await mkPost(ada.id, "p1")).id);
  await addToList(list.id, (await mkPost(ada.id, "p2")).id);
  const [a, b] = (await listsRepo.listItems(list.id, null, null, 5)).map((r) => r.itemId).toSorted();
  await sameMillisecond("reading_list_items", "created_at", a, b);
  const seen = await walk(async (c) =>
    (await listsRepo.listItems(list.id, null, c, 1)).map((r) => ({ id: r.itemId, at: r.itemCreatedAt })),
  );
  expect(seen).toEqual([b, a]);
});

test("the global feed", async () => {
  const ada = await mkUser("ada");
  const [a, b] = [(await mkPost(ada.id, "p1")).id, (await mkPost(ada.id, "p2")).id];
  await sameMillisecond("posts", "created_at", a, b);
  const seen = await walk(async (c) =>
    (await postsRepo.listGlobal(null, c, 1)).map(({ post }) => ({ id: post.id, at: post.createdAt })),
  );
  expect(seen).toEqual([b, a]);
});

test("a post's comments", async () => {
  const ada = await mkUser("ada");
  const post = await mkPost(ada.id, "p1");
  const [a, b] = [(await mkComment(post.id, ada.id)).id, (await mkComment(post.id, ada.id)).id];
  await sameMillisecond("comments", "created_at", a, b);
  const seen = await walk(async (c) =>
    (await commentsRepo.listByPost(post.id, c, null, 1)).map((r) => ({ id: r.comment.id, at: r.comment.createdAt })),
  );
  // Comments read oldest first, so the walk sees `a` first.
  expect(seen.toSorted()).toEqual([a, b].toSorted());
});

test("notifications", async () => {
  const ada = await mkUser("ada");
  const bob = await mkUser("bob");
  const post = await mkPost(ada.id, "p1");
  const first = await notificationsRepo.create({ recipientId: ada.id, type: "follow", actorId: bob.id });
  const second = await notificationsRepo.create({
    recipientId: ada.id,
    type: "like",
    actorId: bob.id,
    postId: post.id,
  });
  if (!first || !second) throw new Error("notifications were not created");
  const [a, b] = [first.id, second.id];
  await sameMillisecond("notifications", "created_at", a, b);
  const seen = await walk(async (c) =>
    (await notificationsRepo.listFor(ada.id, c, 1)).map((r) => ({
      id: r.notification.id,
      at: r.notification.createdAt,
    })),
  );
  expect(seen).toEqual([b, a]);
});

test("a user's recommendations", async () => {
  const ada = await mkUser("ada");
  const [p1, p2] = [await mkPost(ada.id, "p1"), await mkPost(ada.id, "p2")];
  await recommend(ada.id, p1.id);
  await recommend(ada.id, p2.id);
  const ids = (await recsRepo.listByUser(ada.id, null, null, 5)).map((r) => r.recommendationId).toSorted();
  await sameMillisecond("recommendations", "created_at", ids[0], ids[1]);
  const seen = await walk(async (c) =>
    (await recsRepo.listByUser(ada.id, null, c, 1)).map((r) => ({ id: r.recommendationId, at: r.recommendedAt })),
  );
  expect(seen).toEqual([ids[1], ids[0]]);
});

test("the admin user table, newest first", async () => {
  const [a, b] = [(await mkUser("ada")).id, (await mkUser("bob")).id];
  await sameMillisecond("users", "created_at", a, b);
  const seen: string[] = [];
  let cursor: usersRepo.AdminCursor | null = null;
  for (let i = 0; i < 5; i++) {
    const rows = await usersRepo.listForAdmin("", {}, cursor, 1);
    if (rows.length === 0) break;
    seen.push(rows[0].id);
    if (rows.length < 2) break;
    cursor = { v: "t", createdAt: rows[0].createdAt.toISOString(), id: rows[0].id };
  }
  expect(seen).toEqual([b, a]);
});
