// SPDX-License-Identifier: AGPL-3.0-or-later
// The home feed merges two independently keyset-paginated streams. These tests
// back both repository calls with in-memory streams that honour the cursor the
// service hands them, then page through to the end — so they check what a
// reader scrolling the feed actually receives, not how the merge is written.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { postWithAuthor, uuid } from "../fixtures.ts";

vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/recommendations.ts"));

import * as postsRepo from "@/db/repositories/posts.ts";
import type { FeedRecommendationRow } from "@/db/repositories/recommendations.ts";
import * as recommendationsRepo from "@/db/repositories/recommendations.ts";
import type { Cursor } from "@/lib/pagination.ts";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";
import { homeFeed } from "@/services/feed.ts";

const at = (s: number) => new Date(Date.UTC(2026, 0, 1) + s * 1000);

type Authored = ReturnType<typeof postWithAuthor>;

function authored(id: string, s: number): Authored {
  return postWithAuthor({ id, createdAt: at(s) });
}

function recommended(postId: string, s: number, recId = uuid(s)): FeedRecommendationRow {
  return {
    ...postWithAuthor({ id: postId, createdAt: at(0) }),
    recommendationId: recId,
    recommendedAt: at(s),
    recommenderId: "friend",
    recommenderUsername: "friend",
    recommenderDisplayName: "Friend",
    recommenderAvatarUrl: null,
    recommenderRemote: false,
  };
}

// Newest-first keyset slice after `cursor`, `limit + 1` rows like the real SQL.
function keyset<T>(rows: T[], key: (r: T) => { t: Date; id: string }, cursor: Cursor | null, limit: number): T[] {
  const sorted = rows.toSorted((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return kb.t.getTime() - ka.t.getTime() || (kb.id < ka.id ? -1 : kb.id > ka.id ? 1 : 0);
  });
  const after = cursor
    ? sorted.filter((r) => {
        const k = key(r);
        const ct = new Date(cursor.createdAt).getTime();
        return k.t.getTime() < ct || (k.t.getTime() === ct && k.id < cursor.id);
      })
    : sorted;
  return after.slice(0, limit + 1);
}

function serve(a: Authored[], r: FeedRecommendationRow[]) {
  vi.mocked(postsRepo.listFeed).mockImplementation(((_u: string, cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) =>
    Promise.resolve(keyset(a, (x) => ({ t: x.post.createdAt, id: x.post.id }), cursor, limit))) as never);
  vi.mocked(recommendationsRepo.listFeedFor).mockImplementation(((
    _u: string,
    cursor: Cursor | null,
    limit = DEFAULT_PAGE_SIZE,
  ) => Promise.resolve(keyset(r, (x) => ({ t: x.recommendedAt, id: x.recommendationId }), cursor, limit))) as never);
}

// Scrolls to the end, guarding against a cursor that never terminates.
async function scrollAll() {
  const pages: string[][] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const page = await homeFeed("me", cursor);
    pages.push(page.items.map((p) => p.post.id));
    cursor = page.nextCursor;
    if (!cursor) return pages;
  }
  throw new Error("feed never terminated");
}

beforeEach(() => {
  serve([], []);
});

describe("homeFeed", () => {
  test("an empty feed is one empty page", async () => {
    expect(await homeFeed("me", null)).toEqual({ items: [], nextCursor: null });
  });

  test("authored posts only, newest first", async () => {
    serve([authored("a", 1), authored("b", 3), authored("c", 2)], []);
    expect(await scrollAll()).toEqual([["b", "c", "a"]]);
  });

  test("interleaves the two streams on their own clocks", async () => {
    serve([authored("a1", 10), authored("a2", 30)], [recommended("r1", 20), recommended("r2", 40)]);
    const page = await homeFeed("me", null);
    expect(page.items.map((p) => p.post.id)).toEqual(["r2", "a2", "r1", "a1"]);
    expect(page.nextCursor).toBe(null);
  });

  test("a recommended item carries who recommended it; an authored one does not", async () => {
    serve([authored("a", 1)], [recommended("r", 2)]);
    const { items } = await homeFeed("me", null);
    expect(items[0].recommendedBy).toEqual({
      id: "friend",
      username: "friend",
      displayName: "Friend",
      avatarUrl: null,
      remote: false,
      recommendedAt: at(2),
    });
    expect(items[1].recommendedBy).toBeUndefined();
  });

  test("a post present in both streams is shown once per page", async () => {
    serve([authored("p", 10)], [recommended("p", 20)]);
    const first = await homeFeed("me", null);
    expect(first.items.map((p) => p.post.id)).toEqual(["p"]);
  });

  test("ties keep authored before recommended", async () => {
    serve([authored("a", 5)], [recommended("r", 5)]);
    expect((await homeFeed("me", null)).items.map((p) => p.post.id)).toEqual(["a", "r"]);
  });

  test("pages through two large streams without skipping or repeating anything", async () => {
    const a = Array.from({ length: 45 }, (_, i) => authored(uuid(i), i * 2));
    const r = Array.from({ length: 37 }, (_, i) => recommended(`r${String(i).padStart(2, "0")}`, i * 2 + 1));
    serve(a, r);
    const pages = await scrollAll();
    for (const p of pages.slice(0, -1)) expect(p).toHaveLength(DEFAULT_PAGE_SIZE);
    const all = pages.flat();
    expect(all).toHaveLength(82);
    expect(new Set(all).size).toBe(82);
  });

  test("a stream that is entirely older than the other is re-offered, not lost", async () => {
    const old = Array.from({ length: 5 }, (_, i) => authored(uuid(i), i));
    const fresh = Array.from({ length: 30 }, (_, i) => recommended(`new${i}`, 1_000 + i));
    serve(old, fresh);
    const all = (await scrollAll()).flat();
    expect(all.slice(0, 30).every((id) => id.startsWith("new"))).toBe(true);
    expect(all.slice(30).toSorted()).toEqual([0, 1, 2, 3, 4].map((i) => uuid(i)));
  });

  test("terminates even when every authored row is a duplicate of a recommendation", async () => {
    serve([authored("p", 10), authored("q", 9)], [recommended("p", 20), recommended("q", 19)]);
    const pages = await scrollAll();
    expect(new Set(pages.flat())).toEqual(new Set(["p", "q"]));
  });

  test("a malformed cursor restarts from the top", async () => {
    serve([authored("a", 1)], []);
    expect((await homeFeed("me", "@@not-base64@@")).items.map((p) => p.post.id)).toEqual(["a"]);
    expect((await homeFeed("me", btoa("not json"))).items.map((p) => p.post.id)).toEqual(["a"]);
    expect((await homeFeed("me", btoa("{}"))).items.map((p) => p.post.id)).toEqual(["a"]);
  });

  test("a drained stream is not queried again", async () => {
    serve(
      [authored("a", 100)],
      Array.from({ length: 25 }, (_, i) => recommended(`r${i}`, i)),
    );
    const first = await homeFeed("me", null);
    expect(first.items[0].post.id).toBe("a");
    vi.mocked(postsRepo.listFeed).mockClear();
    const second = await homeFeed("me", first.nextCursor);
    expect(postsRepo.listFeed).not.toHaveBeenCalled();
    expect(second.items).toHaveLength(6);
    expect(second.nextCursor).toBe(null);
  });

  // The cursor is client-supplied; a bad inner field would otherwise be a 500.
  test("a cursor with an invalid inner timestamp restarts from the top", async () => {
    serve([authored("a", 1)], []);
    const crafted = btoa(JSON.stringify({ authored: { cursor: { createdAt: "x", id: "y" }, done: false } }));
    await homeFeed("me", crafted);
    const passed = vi.mocked(postsRepo.listFeed).mock.calls[0][1];
    expect(passed === null || !Number.isNaN(new Date(passed.createdAt).getTime())).toBe(true);
  });
});
