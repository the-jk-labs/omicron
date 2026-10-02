// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
import { postWithAuthor } from "../fixtures.ts";

vi.mock(import("@/db/repositories/comments.ts"));
vi.mock(import("@/db/repositories/likes.ts"));
vi.mock(import("@/db/repositories/recommendations.ts"));
vi.mock(import("@/db/repositories/tags.ts"));

import * as commentsRepo from "@/db/repositories/comments.ts";
import * as likesRepo from "@/db/repositories/likes.ts";
import * as recommendationsRepo from "@/db/repositories/recommendations.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import { enrichPost, enrichPosts } from "@/services/engagement.ts";

beforeEach(() => {
  vi.mocked(likesRepo.statsFor).mockResolvedValue(new Map([["p1", { count: 2, liked: true }]]));
  vi.mocked(commentsRepo.countsFor).mockResolvedValue(new Map([["p1", 5]]));
  vi.mocked(tagsRepo.tagsForPosts).mockResolvedValue(new Map([["p1", [{ slug: "deno", name: "Deno" }]]]));
  vi.mocked(recommendationsRepo.statsFor).mockResolvedValue(new Map([["p1", { count: 1, recommended: false }]]));
});

test("attaches counts, viewer state and tags from batched lookups", async () => {
  const [a, b] = await enrichPosts([postWithAuthor({ id: "p1" }), postWithAuthor({ id: "p2" })], "viewer");
  expect(a).toMatchObject({
    id: "p1",
    likeCount: 2,
    liked: true,
    commentCount: 5,
    recommendCount: 1,
    recommended: false,
    tags: [{ slug: "deno", name: "Deno" }],
    recommendedBy: null,
  });
  // A post with no rows anywhere gets zeroes, not undefined.
  expect(b).toMatchObject({
    id: "p2",
    likeCount: 0,
    liked: false,
    commentCount: 0,
    recommendCount: 0,
    recommended: false,
    tags: [],
  });
  // One query per kind, however many posts.
  expect(likesRepo.statsFor).toHaveBeenCalledOnce();
  expect(likesRepo.statsFor).toHaveBeenCalledWith(["p1", "p2"], "viewer");
  expect(recommendationsRepo.statsFor).toHaveBeenCalledWith(["p1", "p2"], "viewer");
});

test("keeps the input order", async () => {
  const out = await enrichPosts(
    ["c", "a", "b"].map((id) => postWithAuthor({ id })),
    null,
  );
  expect(out.map((p) => p.id)).toEqual(["c", "a", "b"]);
});

test("carries a recommendedBy marker through", async () => {
  const recommendedBy = {
    id: "u2",
    username: "bob",
    displayName: "Bob",
    avatarUrl: null,
    remote: false,
    recommendedAt: new Date(0),
  };
  const [out] = await enrichPosts([{ ...postWithAuthor({ id: "p1" }), recommendedBy }], null);
  expect(out.recommendedBy).toEqual(recommendedBy);
});

test("an empty list still answers with an empty list", async () => {
  vi.mocked(likesRepo.statsFor).mockResolvedValue(new Map());
  expect(await enrichPosts([], null)).toEqual([]);
});

test("enrichPost enriches a single row", async () => {
  expect(await enrichPost(postWithAuthor({ id: "p1" }), null)).toMatchObject({ id: "p1", commentCount: 5 });
});
