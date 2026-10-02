// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { postWithAuthor } from "../fixtures.ts";

vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/tags.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import * as postsRepo from "@/db/repositories/posts.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";
import {
  createAlias,
  follow,
  followed,
  getTag,
  listAliases,
  merge,
  search,
  suggest,
  tagPosts,
  trending,
  unfollow,
} from "@/services/tags.ts";

const deno = { id: "t1", slug: "deno", name: "Deno", createdAt: new Date(0) };

beforeEach(() => {
  vi.mocked(tagsRepo.findBySlug).mockResolvedValue(deno);
  vi.mocked(tagsRepo.postCount).mockResolvedValue(7);
  vi.mocked(tagsRepo.followerCount).mockResolvedValue(3);
  vi.mocked(tagsRepo.isFollowing).mockResolvedValue(true);
});

describe("getTag", () => {
  test("returns tag meta with counts and the viewer's follow state", async () => {
    expect(await getTag("#Deno", "me")).toEqual({
      tag: { slug: "deno", name: "Deno" },
      postCount: 7,
      followerCount: 3,
      isFollowing: true,
    });
    expect(tagsRepo.findBySlug).toHaveBeenCalledWith("deno");
    expect(tagsRepo.postCount).toHaveBeenCalledWith("t1", "me");
  });

  test("anonymous viewers never follow", async () => {
    expect((await getTag("deno", null)).isFollowing).toBe(false);
    expect(tagsRepo.isFollowing).not.toHaveBeenCalled();
  });

  test("404s on an unknown or empty slug", async () => {
    await expect(getTag("###", null)).rejects.toMatchObject({ status: 404 });
    vi.mocked(tagsRepo.findBySlug).mockResolvedValue(undefined);
    await expect(getTag("nope", null)).rejects.toMatchObject({ status: 404, message: "Tag not found." });
  });
});

describe("tagPosts", () => {
  test("lists by the canonical slug the lookup resolved (aliases included)", async () => {
    vi.mocked(tagsRepo.findBySlug).mockResolvedValue({ ...deno, slug: "deno" });
    vi.mocked(postsRepo.listByTag).mockResolvedValue([postWithAuthor()]);
    const page = await tagPosts("denojs", null, "me");
    expect(postsRepo.listByTag).toHaveBeenCalledWith("deno", "me", null, DEFAULT_PAGE_SIZE);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe(null);
  });

  test("falls back to the normalized slug when no tag row exists", async () => {
    vi.mocked(tagsRepo.findBySlug).mockResolvedValue(undefined);
    vi.mocked(postsRepo.listByTag).mockResolvedValue([]);
    await tagPosts("Fresh", null, null);
    expect(postsRepo.listByTag).toHaveBeenCalledWith("fresh", null, null, DEFAULT_PAGE_SIZE);
  });

  test("an empty slug is an empty page without a query", async () => {
    expect(await tagPosts("!!!", null, null)).toEqual({ items: [], nextCursor: null });
    expect(postsRepo.listByTag).not.toHaveBeenCalled();
  });
});

describe("follow / unfollow", () => {
  test("follows an existing tag by id", async () => {
    await follow("me", "#Deno");
    expect(tagsRepo.follow).toHaveBeenCalledWith("me", "t1");
  });

  test("unfollows an existing tag by id", async () => {
    await unfollow("me", "deno");
    expect(tagsRepo.unfollow).toHaveBeenCalledWith("me", "t1");
  });

  test("an invalid slug is a 400", async () => {
    await expect(follow("me", "  ")).rejects.toMatchObject({ status: 400, message: "Invalid tag." });
  });

  test("a tag nobody has used cannot be followed", async () => {
    vi.mocked(tagsRepo.findBySlug).mockResolvedValue(undefined);
    await expect(follow("me", "unused")).rejects.toMatchObject({ status: 404 });
    expect(tagsRepo.follow).not.toHaveBeenCalled();
  });
});

describe("search / suggest / trending / followed", () => {
  test("search and suggest normalize the query and cap at 20", async () => {
    await search("#Deno");
    expect(tagsRepo.search).toHaveBeenCalledWith("deno", 20);
    await suggest("De");
    expect(tagsRepo.suggest).toHaveBeenCalledWith("de", 20);
  });

  test("an empty query short-circuits", async () => {
    expect(await search("#")).toEqual([]);
    expect(await suggest("")).toEqual([]);
    expect(tagsRepo.search).not.toHaveBeenCalled();
    expect(tagsRepo.suggest).not.toHaveBeenCalled();
  });

  test("trending caps at 20 and followed is per-user", async () => {
    await trending();
    expect(tagsRepo.trending).toHaveBeenCalledWith(20);
    await followed("me");
    expect(tagsRepo.listFollowedByUser).toHaveBeenCalledWith("me");
    await listAliases();
    expect(tagsRepo.listAliases).toHaveBeenCalled();
  });
});

describe("createAlias", () => {
  test("normalizes both sides", async () => {
    await createAlias("#JS", "JavaScript");
    expect(tagsRepo.createAlias).toHaveBeenCalledWith("js", "javascript");
  });

  test("rejects invalid or identical tags", async () => {
    await expect(createAlias("", "x")).rejects.toMatchObject({ status: 400, message: "Invalid tag." });
    await expect(createAlias("Deno", "#deno")).rejects.toMatchObject({
      status: 400,
      message: "Alias and target are the same.",
    });
  });

  test("turns a repository error into a 400 with its message", async () => {
    vi.mocked(tagsRepo.createAlias).mockRejectedValue(new Error("Alias already exists."));
    await expect(createAlias("a", "b")).rejects.toMatchObject({ status: 400, message: "Alias already exists." });
    vi.mocked(tagsRepo.createAlias).mockRejectedValue("weird");
    await expect(createAlias("a", "b")).rejects.toMatchObject({ status: 400, message: "Could not create alias." });
  });
});

describe("merge", () => {
  test("normalizes both sides", async () => {
    await merge("#Old", "New");
    expect(tagsRepo.mergeTags).toHaveBeenCalledWith("old", "new");
  });

  test("rejects invalid or identical tags", async () => {
    await expect(merge("x", "!!")).rejects.toMatchObject({ status: 400 });
    await expect(merge("x", "X")).rejects.toMatchObject({ message: "Source and target are the same." });
  });

  test("turns a repository error into a 400", async () => {
    vi.mocked(tagsRepo.mergeTags).mockRejectedValue(new Error("Unknown tag."));
    await expect(merge("a", "b")).rejects.toMatchObject({ status: 400, message: "Unknown tag." });
    vi.mocked(tagsRepo.mergeTags).mockRejectedValue(42);
    await expect(merge("a", "b")).rejects.toMatchObject({ message: "Could not merge tags." });
  });
});
