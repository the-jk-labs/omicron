// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The "For you" feed against a real database.
//
// The bug is in the merge of two paginated streams, not either query alone, so
// it needs both populated: a post both authored-by and recommended-by followees
// merges in twice, colliding the home page's `post.id` key (`each_key_duplicate`).
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { homeFeed } from "@/services/feed.ts";
import { closeDb, follow, mkPost, mkUser, recommend, resetDb } from "./harness.ts";

afterAll(async () => {
  await closeDb();
});

describe("feed: a post reached through both halves at once appears once", () => {
  let reader: Awaited<ReturnType<typeof mkUser>>;
  let post: Awaited<ReturnType<typeof mkPost>>;

  beforeAll(async () => {
    await resetDb();

    const author = await mkUser("author");
    const booster = await mkUser("booster");
    reader = await mkUser("reader");

    post = await mkPost(author.id, "shared-post");

    // Following both puts the one post in both halves of the merge at once.
    await follow(reader.id, author.id, true);
    await follow(reader.id, booster.id, true);
    await recommend(booster.id, post.id);
  });

  test("the merged feed contains the post exactly once", async () => {
    const { items } = await homeFeed(reader.id, null);
    const occurrences = items.filter((row) => row.post.id === post.id).length;
    expect(occurrences).toBe(1);
  });

  test("no post id appears more than once across the page", async () => {
    const { items } = await homeFeed(reader.id, null);
    const ids = items.map((row) => row.post.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
