import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import { findCachedPost, patchPosts, restoreSnapshot, updatePostEverywhere } from "@/lib/query/cache";
import { flattenPages } from "@/lib/query/paged";
import { makePost } from "../../fixtures";

const like = (post: ReturnType<typeof makePost>) => ({ ...post, liked: true, likeCount: post.likeCount + 1 });

describe("patchPosts", () => {
  test("patches the post wherever it sits and shares untouched branches", () => {
    const target = makePost();
    const other = makePost({ id: "other" });
    const data = { pages: [{ items: [other, target], nextCursor: null }], pageParams: [null], extra: { other } };
    const next = patchPosts(data, target.id, like);
    expect(next).toEqual({
      pages: [{ items: [other, { ...target, liked: true, likeCount: 3 }], nextCursor: null }],
      pageParams: [null],
      extra: { other },
    });
    expect(next).not.toBe(data);
    expect(Object.getOwnPropertyDescriptor(next, "extra")?.value).toBe(data.extra);
  });

  test("returns the same reference when the post isn't there", () => {
    const data = { post: makePost({ id: "other" }) };
    expect(patchPosts(data, "missing", like)).toBe(data);
  });

  test("ignores look-alikes that aren't posts", () => {
    const list = { id: makePost().id, title: "A list" };
    expect(patchPosts([list], list.id, like)).toEqual([list]);
  });
});

describe("updatePostEverywhere", () => {
  test("updates every cached copy and can roll back", () => {
    const client = new QueryClient();
    const post = makePost();
    client.setQueryData(["post", "ada", "hello"], { post });
    client.setQueryData(["feed", "global"], { pages: [{ items: [post], nextCursor: null }], pageParams: [null] });
    client.setQueryData(["unrelated"], { count: 1 });

    const snapshot = updatePostEverywhere(client, post.id, like);
    expect(snapshot).toHaveLength(2);
    expect(client.getQueryData(["post", "ada", "hello"])).toEqual({ post: like(post) });

    restoreSnapshot(client, snapshot);
    expect(client.getQueryData(["post", "ada", "hello"])).toEqual({ post });
  });
});

describe("flattenPages", () => {
  test("joins pages and drops items repeated across a page boundary", () => {
    const a = makePost({ id: "a" });
    const b = makePost({ id: "b" });
    const c = makePost({ id: "c" });
    expect(
      flattenPages([
        { items: [a, b], nextCursor: "x" },
        { items: [b, c], nextCursor: null },
      ]).map((p) => p.id),
    ).toEqual(["a", "b", "c"]);
    expect(flattenPages(undefined)).toEqual([]);
  });
});

describe("findCachedPost", () => {
  test("finds a post a feed page holds, by slug or by short id", () => {
    const client = new QueryClient();
    const post = makePost();
    const untitled = makePost({ id: "abcdef12-0000", slug: null });
    client.setQueryData(["feed", "local"], {
      pages: [{ items: [makePost({ id: "x", slug: "other" }), post, untitled] }],
    });
    expect(findCachedPost(client, "ada", "hello")).toBe(post);
    expect(findCachedPost(client, "ada", "abcdef12")).toBe(untitled);
  });

  test("misses another author's post with the same slug, and an empty cache", () => {
    const client = new QueryClient();
    expect(findCachedPost(client, "ada", "hello")).toBeUndefined();
    client.setQueryData(["feed"], { items: [makePost()] });
    expect(findCachedPost(client, "bob", "hello")).toBeUndefined();
  });
});
