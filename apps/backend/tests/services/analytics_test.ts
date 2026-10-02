// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/comments.ts"));
vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/db/repositories/likes.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/postViews.ts"));
vi.mock(import("@/db/repositories/instanceSettings.ts"));

import * as commentsRepo from "@/db/repositories/comments.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import * as likesRepo from "@/db/repositories/likes.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as postViewsRepo from "@/db/repositories/postViews.ts";
import { anonVisitorKey, userVisitorKey } from "@/lib/analytics.ts";
import { dashboardFor, recordPostView } from "@/services/analytics.ts";

const BROWSER = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";
const headers = (h: Record<string, string> = {}) => new Headers({ "user-agent": BROWSER, ...h });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T10:00:00Z"));
  vi.mocked(settingsRepo.get).mockResolvedValue(undefined);
  vi.mocked(postViewsRepo.markSeen).mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recordPostView", () => {
  test("counts a signed-in reader's first view by account, on today's UTC bucket", async () => {
    await recordPostView("p1", headers(), "u1", "cookie");
    expect(postViewsRepo.markSeen).toHaveBeenCalledWith("p1", await userVisitorKey("u1"));
    expect(postViewsRepo.recordView).toHaveBeenCalledWith("p1", "2026-06-15");
  });

  test("counts an anonymous reader by their cookie", async () => {
    await recordPostView("p1", headers(), null, "cookie");
    expect(postViewsRepo.markSeen).toHaveBeenCalledWith("p1", await anonVisitorKey("cookie"));
  });

  test("a repeat view is not counted again", async () => {
    vi.mocked(postViewsRepo.markSeen).mockResolvedValue(false);
    await recordPostView("p1", headers(), "u1", null);
    expect(postViewsRepo.recordView).not.toHaveBeenCalled();
  });

  test.for<Record<string, string>>([{ dnt: "1" }, { "sec-gpc": "1" }])("honours %o", async (h) => {
    await recordPostView("p1", headers(h), "u1", null);
    expect(postViewsRepo.markSeen).not.toHaveBeenCalled();
  });

  test("ignores bots and missing user agents", async () => {
    await recordPostView("p1", headers({ "user-agent": "Googlebot/2.1" }), "u1", null);
    await recordPostView("p1", new Headers(), "u1", null);
    expect(postViewsRepo.markSeen).not.toHaveBeenCalled();
  });

  test("records nothing when the instance disabled view counting", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(false);
    await recordPostView("p1", headers(), "u1", null);
    expect(postViewsRepo.markSeen).not.toHaveBeenCalled();
  });

  test("records nothing without any way to identify the reader", async () => {
    await recordPostView("p1", headers(), null, null);
    expect(postViewsRepo.markSeen).not.toHaveBeenCalled();
  });

  test("never stores the raw user id or cookie", async () => {
    await recordPostView("p1", headers(), "8f14e45f-user", null);
    expect(JSON.stringify(vi.mocked(postViewsRepo.markSeen).mock.calls)).not.toContain("8f14e45f");
  });
});

describe("dashboardFor", () => {
  beforeEach(() => {
    vi.mocked(postsRepo.publishedBriefByAuthor).mockResolvedValue([
      { id: "p1", title: "One", slug: "one", createdAt: new Date(1) },
      { id: "p2", title: null, slug: null, createdAt: new Date(2) },
    ] as never);
    vi.mocked(likesRepo.statsFor).mockResolvedValue(new Map([["p1", { count: 3, liked: false }]]));
    vi.mocked(commentsRepo.countsFor).mockResolvedValue(new Map([["p2", 4]]));
    vi.mocked(postViewsRepo.totalsForPosts).mockResolvedValue(new Map([["p1", 10]]));
    vi.mocked(postViewsRepo.dailyTotalsForAuthor).mockResolvedValue([{ day: "2026-06-14", views: 2 }] as never);
    vi.mocked(followsRepo.counts).mockResolvedValue({ followers: 7, following: 1 });
  });

  test("combines engagement and views per post and in total", async () => {
    const d = await dashboardFor("me");
    expect(d.onInstanceViews).toBe(true);
    expect(d.totals).toEqual({ views: 10, likes: 3, comments: 4, followers: 7 });
    expect(d.posts).toEqual([
      { postId: "p1", title: "One", slug: "one", createdAt: new Date(1), views: 10, likes: 3, comments: 0 },
      { postId: "p2", title: null, slug: null, createdAt: new Date(2), views: 0, likes: 0, comments: 4 },
    ]);
    expect(d.series).toEqual([{ day: "2026-06-14", views: 2 }]);
    // Public likes only: the viewer-state half of the stats is never asked for.
    expect(likesRepo.statsFor).toHaveBeenCalledWith(["p1", "p2"], null);
  });

  test("the series starts sinceDays ago (UTC date)", async () => {
    await dashboardFor("me", 7);
    expect(postViewsRepo.dailyTotalsForAuthor).toHaveBeenCalledWith("me", "2026-06-08");
  });

  test("with views disabled, no view data is read or reported", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(false);
    const d = await dashboardFor("me");
    expect(d.onInstanceViews).toBe(false);
    expect(d.totals.views).toBe(0);
    expect(d.series).toEqual([]);
    expect(postViewsRepo.totalsForPosts).not.toHaveBeenCalled();
    expect(postViewsRepo.dailyTotalsForAuthor).not.toHaveBeenCalled();
  });

  test("an author with no posts still gets their follower count", async () => {
    vi.mocked(postsRepo.publishedBriefByAuthor).mockResolvedValue([]);
    vi.mocked(likesRepo.statsFor).mockResolvedValue(new Map());
    vi.mocked(commentsRepo.countsFor).mockResolvedValue(new Map());
    vi.mocked(postViewsRepo.totalsForPosts).mockResolvedValue(new Map());
    const d = await dashboardFor("me");
    expect(d.totals).toEqual({ views: 0, likes: 0, comments: 0, followers: 7 });
    expect(d.posts).toEqual([]);
  });
});
