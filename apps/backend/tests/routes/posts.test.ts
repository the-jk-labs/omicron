// SPDX-License-Identifier: AGPL-3.0-or-later
// HTTP layer only: services are stubbed, so these pin auth guards, request
// validation, status codes and response shapes. Business rules are covered in
// tests/services/*.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { commentRow, commentWithAuthor, postRow, postWithAuthor } from "../fixtures.ts";
import { mount } from "./harness.ts";

vi.mock(import("@/services/posts.ts"));
vi.mock(import("@/services/likes.ts"));
vi.mock(import("@/services/recommendations.ts"));
vi.mock(import("@/services/comments.ts"));
vi.mock(import("@/services/commentLikes.ts"));
vi.mock(import("@/services/analytics.ts"));
vi.mock(import("@/services/engagement.ts"));

import { notFound } from "@/lib/http.ts";
import { encodeCursor } from "@/lib/pagination.ts";
import { postRoutes } from "@/routes/posts.ts";
import * as analyticsService from "@/services/analytics.ts";
import * as commentLikesService from "@/services/commentLikes.ts";
import * as commentsService from "@/services/comments.ts";
import { enrichPost, enrichPosts } from "@/services/engagement.ts";
import * as likesService from "@/services/likes.ts";
import * as postsService from "@/services/posts.ts";
import * as recommendationsService from "@/services/recommendations.ts";

const api = mount("/api/posts", postRoutes);
const row = postWithAuthor({ id: "p1" }, { id: "author" });
const BROWSER = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";

beforeEach(() => {
  api.signOut();
  vi.mocked(enrichPosts).mockImplementation(async (rows) => rows.map((r) => ({ id: r.post.id })) as never);
  vi.mocked(enrichPost).mockImplementation(async (r) => ({ id: r.post.id }) as never);
  vi.mocked(postsService.getPost).mockResolvedValue(row);
  vi.mocked(analyticsService.recordPostView).mockResolvedValue();
});

describe("auth guards", () => {
  test.for([
    ["GET", "/api/posts/drafts"],
    ["GET", "/api/posts/mine"],
    ["GET", "/api/posts/mine/counts"],
    ["POST", "/api/posts/p1/like"],
    ["DELETE", "/api/posts/p1/like"],
    ["POST", "/api/posts/p1/recommend"],
    ["DELETE", "/api/posts/p1/recommend"],
    ["DELETE", "/api/posts/p1"],
    ["DELETE", "/api/posts/p1/comments/c1"],
    ["POST", "/api/posts/p1/comments/c1/like"],
    ["DELETE", "/api/posts/p1/comments/c1/like"],
  ])("%s %s requires a signed-in user", async ([method, path]) => {
    const res = await api.request(path, { method });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "You must be signed in." });
  });

  test.for([
    ["POST", "/api/posts", { contentHtml: "<p>x</p>" }],
    ["PATCH", "/api/posts/p1", { title: "t" }],
    ["POST", "/api/posts/p1/comments", { content: "hi" }],
    ["PATCH", "/api/posts/p1/comments/c1", { content: "hi" }],
  ] as const)("%s %s requires a signed-in user", async ([method, path, body]) => {
    expect((await api.json(path, method, body)).status).toBe(401);
  });
});

describe("timelines", () => {
  test("the global timeline is the default, with viewer and language filter", async () => {
    vi.mocked(postsService.globalTimeline).mockResolvedValue({ items: [row], nextCursor: "next" });
    const cursor = encodeCursor({ createdAt: "2026-01-01T00:00:00.000Z", id: "00000000-0000-4000-8000-000000000001" });
    const res = await api.request(`/api/posts?cursor=${cursor}&langMode=show&langs=en,az`);
    expect(await res.json()).toEqual({ items: [{ id: "p1" }], nextCursor: "next" });
    expect(postsService.globalTimeline).toHaveBeenCalledWith(
      { createdAt: "2026-01-01T00:00:00.000Z", id: "00000000-0000-4000-8000-000000000001" },
      null,
      {
        mode: "show",
        langs: ["en", "az"],
      },
    );
  });

  test("?scope=local serves the local timeline", async () => {
    vi.mocked(postsService.localTimeline).mockResolvedValue({ items: [], nextCursor: null });
    api.signIn();
    await api.request("/api/posts?scope=local");
    expect(postsService.localTimeline).toHaveBeenCalledWith(null, "me", null);
    expect(postsService.globalTimeline).not.toHaveBeenCalled();
  });

  test("trending is public", async () => {
    vi.mocked(postsService.trending).mockResolvedValue([row]);
    expect(await (await api.request("/api/posts/trending")).json()).toEqual({ items: [{ id: "p1" }] });
  });

  test("/mine defaults to drafts and accepts the two other states", async () => {
    api.signIn();
    vi.mocked(postsService.listOwn).mockResolvedValue({ items: [], nextCursor: null });
    await api.request("/api/posts/mine");
    await api.request("/api/posts/mine?status=scheduled");
    await api.request("/api/posts/mine?status=published");
    await api.request("/api/posts/mine?status=deleted");
    expect(vi.mocked(postsService.listOwn).mock.calls.map((c) => c[1])).toEqual([
      "draft",
      "scheduled",
      "published",
      "draft",
    ]);
  });

  test("/drafts and /mine/counts serve the signed-in author", async () => {
    api.signIn();
    vi.mocked(postsService.listDrafts).mockResolvedValue({ items: [row], nextCursor: null });
    vi.mocked(postsService.ownCounts).mockResolvedValue({ draft: 1, scheduled: 0, published: 2 });
    expect(await (await api.request("/api/posts/drafts")).json()).toEqual({ items: [{ id: "p1" }], nextCursor: null });
    expect(await (await api.request("/api/posts/mine/counts")).json()).toEqual({
      draft: 1,
      scheduled: 0,
      published: 2,
    });
  });
});

describe("reading a post", () => {
  test("by id, counting the view and issuing an anonymous reader cookie", async () => {
    const res = await api.request("/api/posts/p1", { headers: { "user-agent": BROWSER } });
    expect(await res.json()).toEqual({ post: { id: "p1" } });
    expect(res.headers.get("set-cookie")).toMatch(
      /^omicron_reader=[0-9a-f-]{72}; Max-Age=34560000; Path=\/; HttpOnly; SameSite=Lax/,
    );
    expect(analyticsService.recordPostView).toHaveBeenCalledWith("p1", expect.any(Headers), null, expect.any(String));
  });

  test("an existing reader cookie is reused, not reissued", async () => {
    const res = await api.request("/api/posts/p1", {
      headers: { "user-agent": BROWSER, cookie: "omicron_reader=abc" },
    });
    expect(res.headers.get("set-cookie")).toBe(null);
    expect(vi.mocked(analyticsService.recordPostView).mock.calls[0][3]).toBe("abc");
  });

  test.for<Record<string, string>>([{ dnt: "1" }, { "sec-gpc": "1" }, { "user-agent": "Googlebot/2.1" }])(
    "no cookie is issued to %o",
    async (h) => {
      const res = await api.request("/api/posts/p1", { headers: { "user-agent": BROWSER, ...h } });
      expect(res.headers.get("set-cookie")).toBe(null);
    },
  );

  test("a signed-in reader gets no cookie and is counted by account", async () => {
    api.signIn();
    const res = await api.request("/api/posts/p1", { headers: { "user-agent": BROWSER } });
    expect(res.headers.get("set-cookie")).toBe(null);
    expect(vi.mocked(analyticsService.recordPostView).mock.calls[0][2]).toBe("me");
  });

  test.for([
    ["a draft", postWithAuthor({ id: "p1", status: "draft" })],
    ["a remote post", { ...row, post: postRow({ id: "p1", authorId: null, remote: true }) }],
  ])("%s is never counted", async ([, r]) => {
    vi.mocked(postsService.getPost).mockResolvedValue(r as never);
    await api.request("/api/posts/p1", { headers: { "user-agent": BROWSER } });
    expect(analyticsService.recordPostView).not.toHaveBeenCalled();
  });

  test("a failing view count never fails the page", async () => {
    vi.mocked(analyticsService.recordPostView).mockRejectedValue(new Error("db down"));
    expect((await api.request("/api/posts/p1", { headers: { "user-agent": BROWSER } })).status).toBe(200);
  });

  test("a post the viewer cannot see is a 404 in the API's error shape", async () => {
    vi.mocked(postsService.getPost).mockRejectedValue(notFound("Post not found."));
    const res = await api.request("/api/posts/p1");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Post not found." });
  });

  test("by permalink", async () => {
    vi.mocked(postsService.getPostBySlug).mockResolvedValue(row);
    api.signIn();
    expect(await (await api.request("/api/posts/by/ada/hello")).json()).toEqual({ post: { id: "p1" } });
    expect(postsService.getPostBySlug).toHaveBeenCalledWith("ada", "hello", "me");
  });

  test("related posts resolve the post first (so visibility applies)", async () => {
    vi.mocked(postsService.relatedPosts).mockResolvedValue([postWithAuthor({ id: "p2" })]);
    expect(await (await api.request("/api/posts/p1/related")).json()).toEqual({ items: [{ id: "p2" }] });
    expect(postsService.relatedPosts).toHaveBeenCalledWith("p1");
  });
});

describe("writing", () => {
  test("create returns 201 with the bare post", async () => {
    api.signIn();
    vi.mocked(postsService.createPost).mockResolvedValue(postRow({ id: "new", title: "T" }) as never);
    const res = await api.json("/api/posts", "POST", { title: "T", contentHtml: "<p>x</p>", tags: ["a"] });
    expect(res.status).toBe(201);
    expect((await res.json()).post).toMatchObject({ id: "new", title: "T", status: "published" });
    expect(postsService.createPost).toHaveBeenCalledWith("me", { title: "T", contentHtml: "<p>x</p>", tags: ["a"] });
  });

  test.for([
    [{}, "missing body"],
    [{ contentHtml: 42 }, "wrong type"],
    [{ contentHtml: "x", status: "private" }, "unknown status"],
    [{ contentHtml: "x", tags: "deno" }, "tags not an array"],
    [{ contentHtml: "x", coverCredit: "x" }, "credit not an object"],
  ])("create rejects %o (%s) with a 400 before the service", async ([body]) => {
    api.signIn();
    const res = await api.json("/api/posts", "POST", body);
    expect(res.status).toBe(400);
    expect(postsService.createPost).not.toHaveBeenCalled();
  });

  test("malformed JSON is a 400, not a 500", async () => {
    api.signIn();
    const res = await api.request("/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  test("update accepts a partial body", async () => {
    api.signIn();
    vi.mocked(postsService.updatePost).mockResolvedValue(postRow({ id: "p1", title: "New" }));
    const res = await api.json("/api/posts/p1", "PATCH", { title: "New" });
    expect((await res.json()).post.title).toBe("New");
    expect(postsService.updatePost).toHaveBeenCalledWith("me", "p1", { title: "New" });
  });

  test("delete passes moderation rights and the notify flag", async () => {
    api.signIn({ isModerator: true });
    vi.mocked(postsService.deletePost).mockResolvedValue();
    expect(await (await api.request("/api/posts/p1?notify=true", { method: "DELETE" })).json()).toEqual({ ok: true });
    expect(postsService.deletePost).toHaveBeenCalledWith("me", true, "p1", { notify: true });
    api.signIn();
    await api.request("/api/posts/p1", { method: "DELETE" });
    expect(postsService.deletePost).toHaveBeenLastCalledWith("me", false, "p1", { notify: false });
  });
});

describe("reactions", () => {
  test("like / unlike map stats to the client's field names", async () => {
    api.signIn();
    vi.mocked(likesService.like).mockResolvedValue({ count: 3, liked: true });
    vi.mocked(likesService.unlike).mockResolvedValue({ count: 2, liked: false });
    expect(await (await api.request("/api/posts/p1/like", { method: "POST" })).json()).toEqual({
      likeCount: 3,
      liked: true,
    });
    expect(await (await api.request("/api/posts/p1/like", { method: "DELETE" })).json()).toEqual({
      likeCount: 2,
      liked: false,
    });
  });

  test("recommend / unrecommend", async () => {
    api.signIn();
    vi.mocked(recommendationsService.recommend).mockResolvedValue({ count: 1, recommended: true });
    vi.mocked(recommendationsService.unrecommend).mockResolvedValue({ count: 0, recommended: false });
    expect(await (await api.request("/api/posts/p1/recommend", { method: "POST" })).json()).toEqual({
      recommendCount: 1,
      recommended: true,
    });
    expect(await (await api.request("/api/posts/p1/recommend", { method: "DELETE" })).json()).toEqual({
      recommendCount: 0,
      recommended: false,
    });
  });
});

describe("comments", () => {
  test("listing is public and serialized", async () => {
    vi.mocked(commentsService.list).mockResolvedValue({
      items: [
        { ...commentWithAuthor({ id: "c1", content: "hey" }), likeStats: { count: 1, liked: false }, replies: [] },
      ],
      nextCursor: null,
    });
    const body = await (await api.request("/api/posts/p1/comments")).json();
    expect(body.items).toEqual([
      expect.objectContaining({ id: "c1", content: "hey", likeCount: 1, liked: false, replies: [] }),
    ]);
    expect(commentsService.list).toHaveBeenCalledWith("p1", null, null);
  });

  test("create returns 201 with the author filled from the session", async () => {
    api.signIn({ displayName: "Me" });
    vi.mocked(commentsService.create).mockResolvedValue(commentRow({ id: "c9", content: "hi", authorId: "me" }));
    const res = await api.json("/api/posts/p1/comments", "POST", { content: "hi", parentId: "c1" });
    expect(res.status).toBe(201);
    expect((await res.json()).comment).toMatchObject({
      id: "c9",
      content: "hi",
      author: { id: "me", username: "me", displayName: "Me", avatarUrl: null },
    });
    expect(commentsService.create).toHaveBeenCalledWith("me", "p1", "hi", "c1");
  });

  test("a top-level comment passes parentId as null", async () => {
    api.signIn();
    vi.mocked(commentsService.create).mockResolvedValue(commentRow());
    await api.json("/api/posts/p1/comments", "POST", { content: "hi" });
    expect(vi.mocked(commentsService.create).mock.calls[0][3]).toBe(null);
  });

  test("create rejects a body without content", async () => {
    api.signIn();
    expect((await api.json("/api/posts/p1/comments", "POST", { text: "hi" })).status).toBe(400);
  });

  test("edit, delete and like address the comment id", async () => {
    api.signIn({ isAdmin: true });
    vi.mocked(commentsService.edit).mockResolvedValue(commentRow({ id: "c1", content: "new" }));
    vi.mocked(commentsService.remove).mockResolvedValue();
    vi.mocked(commentLikesService.like).mockResolvedValue({ count: 1, liked: true });
    vi.mocked(commentLikesService.unlike).mockResolvedValue({ count: 0, liked: false });
    expect(await (await api.json("/api/posts/p1/comments/c1", "PATCH", { content: "new" })).json()).toEqual({
      comment: { id: "c1", content: "new" },
    });
    expect(await (await api.request("/api/posts/p1/comments/c1", { method: "DELETE" })).json()).toEqual({ ok: true });
    expect(commentsService.remove).toHaveBeenCalledWith("me", true, "c1");
    expect(await (await api.request("/api/posts/p1/comments/c1/like", { method: "POST" })).json()).toEqual({
      likeCount: 1,
      liked: true,
    });
    expect(await (await api.request("/api/posts/p1/comments/c1/like", { method: "DELETE" })).json()).toEqual({
      likeCount: 0,
      liked: false,
    });
  });
});
