// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { postRow, postWithAuthor, remotePostWithAuthor, userRow, uuid } from "../fixtures.ts";

vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/relations.ts"));
vi.mock(import("@/db/repositories/tags.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/accountNotices.ts"));
vi.mock(import("@/services/postSlugs.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import * as followsRepo from "@/db/repositories/follows.ts";
import type { PostWithAuthor } from "@/db/repositories/posts.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { MAX_CONSECUTIVE_SAME_AUTHOR, maxPerAuthorPerPage } from "@/lib/feedDiversity.ts";
import type { Cursor } from "@/lib/pagination.ts";
import { DEFAULT_PAGE_SIZE, decodeCursor } from "@/lib/pagination.ts";
import { queue } from "@/queue/queue.ts";
import { notifyPostAuthorRemoved } from "@/services/accountNotices.ts";
import {
  createPost,
  deletePost,
  firstPublicationFields,
  getPost,
  getPostBySlug,
  globalTimeline,
  listOwn,
  localTimeline,
  normalizeSummary,
  ownCounts,
  pageOf,
  pageOfDue,
  relatedPosts,
  resolveTags,
  trending,
  updatePost,
} from "@/services/posts.ts";
import { syncSlug } from "@/services/postSlugs.ts";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.mocked(postsRepo.create).mockImplementation(async (data) => postRow({ id: "new", ...data }) as never);
  // Like the real UPDATE … RETURNING: the stored row with the changes applied.
  vi.mocked(postsRepo.update).mockImplementation(async (id, data) => {
    const current = await vi.mocked(postsRepo.findById).getMockImplementation()?.(id);
    return { ...(current?.post ?? postRow({ id })), ...data } as never;
  });
  vi.mocked(syncSlug).mockResolvedValue("a-slug");
  vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(false);
  vi.mocked(relationsRepo.hasRemote).mockResolvedValue(false);
  vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "author" }));
  vi.mocked(followsRepo.isFollowing).mockResolvedValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

function queued(name: string) {
  return vi
    .mocked(queue.add)
    .mock.calls.filter(([n]) => n === name)
    .map(([, p]) => p);
}

describe("normalizeSummary", () => {
  test.for([null, undefined, "", "   \n "])("%j means no summary", (raw) => {
    expect(normalizeSummary(raw)).toBe(null);
  });

  test("collapses whitespace", () => {
    expect(normalizeSummary("  a\n\n b\tc ")).toBe("a b c");
  });

  test("accepts 150 characters and refuses 151", () => {
    expect(normalizeSummary("x".repeat(150))).toHaveLength(150);
    expect(() => normalizeSummary("x".repeat(151))).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe("resolveTags", () => {
  test("normalizes and de-duplicates", () => {
    expect(resolveTags(["#Deno", "deno", "TypeScript"])).toEqual(["deno", "typescript"]);
  });

  test("allows five tags and refuses six distinct ones", () => {
    expect(resolveTags(["a", "b", "c", "d", "e"])).toHaveLength(5);
    expect(() => resolveTags(["a", "b", "c", "d", "e", "f"])).toThrow(expect.objectContaining({ status: 400 }));
  });

  test("duplicates do not count towards the cap", () => {
    expect(resolveTags(["a", "A", "#a", "b", "c", "d", "e"])).toHaveLength(5);
  });
});

describe("firstPublicationFields", () => {
  test("re-dates a post going live for the first time", () => {
    expect(firstPublicationFields("draft", "published")).toEqual({ createdAt: NOW });
    expect(firstPublicationFields("scheduled", "published")).toEqual({ createdAt: NOW });
  });

  test.for([
    ["published", "published"],
    ["draft", "draft"],
    ["draft", "scheduled"],
    ["published", "draft"],
  ] as const)("%s -> %s keeps the date", ([prev, next]) => {
    expect(firstPublicationFields(prev, next)).toEqual({});
  });
});

describe("createPost", () => {
  test("publishes by default, sanitizes, and federates + submits to IndexNow", async () => {
    const post = await createPost("me", {
      title: "  Hello  ",
      contentHtml: '<p onclick="x()">Hi<script>alert(1)</script></p>',
    });
    const data = vi.mocked(postsRepo.create).mock.calls[0][0];
    expect(data).toMatchObject({ authorId: "me", title: "Hello", status: "published", publishAt: null });
    expect(data.contentHtml).not.toMatch(/script|onclick/);
    expect(post.slug).toBe("a-slug");
    expect(queued("federate_post")).toEqual([{ postId: "new" }]);
    expect(queued("indexnow_submit")).toEqual([{ postId: "new" }]);
  });

  test("a draft may be untitled and is never federated", async () => {
    await createPost("me", { contentHtml: "<p>wip</p>", status: "draft" });
    expect(postsRepo.create).toHaveBeenCalledWith(expect.objectContaining({ title: null, status: "draft" }));
    expect(queue.add).not.toHaveBeenCalled();
  });

  test.for(["published", "scheduled"])("a %s post needs a title", async (status) => {
    await expect(
      createPost("me", { contentHtml: "<p>x</p>", status, title: "   ", publishAt: inMinutes(10) }),
    ).rejects.toMatchObject({ status: 400, message: "A blog post must have a title." });
    expect(postsRepo.create).not.toHaveBeenCalled();
  });

  test.for(["", "   ", "<script>alert(1)</script>", "<iframe src=x></iframe>"])(
    "rejects a body that is empty once sanitized: %j",
    async (contentHtml) => {
      await expect(createPost("me", { title: "t", contentHtml })).rejects.toMatchObject({
        status: 400,
        message: "Post content cannot be empty.",
      });
    },
  );

  test("rejects a body over a million characters", async () => {
    const huge = `<p>${"x".repeat(1_000_001)}</p>`;
    await expect(createPost("me", { title: "t", contentHtml: huge })).rejects.toMatchObject({ status: 400 });
  });

  test("schedules a post with a due time and does not federate it", async () => {
    await createPost("me", { title: "Later", contentHtml: "<p>x</p>", status: "scheduled", publishAt: inMinutes(5) });
    expect(postsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: "scheduled", publishAt: new Date(inMinutes(5)) }),
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  test.for([
    [undefined, "Choose when this post should go out."],
    [null, "Choose when this post should go out."],
    ["not a date", "That publish time is not a valid date."],
    ["2026-06-01T12:00:30.000Z", "Pick a time at least a minute from now, or publish the post directly."],
    ["2020-01-01T00:00:00.000Z", "Pick a time at least a minute from now, or publish the post directly."],
    ["2032-01-01T00:00:00.000Z", "That publish time is too far in the future."],
  ])("refuses a scheduled publishAt of %j", async ([publishAt, message]) => {
    await expect(
      createPost("me", { title: "t", contentHtml: "<p>x</p>", status: "scheduled", publishAt }),
    ).rejects.toMatchObject({ status: 400, message });
  });

  test("a publishAt sent with a non-scheduled status is ignored", async () => {
    await createPost("me", { title: "t", contentHtml: "<p>x</p>", status: "published", publishAt: inMinutes(60) });
    expect(postsRepo.create).toHaveBeenCalledWith(expect.objectContaining({ publishAt: null }));
  });

  test("normalizes language, summary and banner", async () => {
    await createPost("me", {
      title: "t",
      contentHtml: "<p>x</p>",
      language: "pt-BR",
      summary: "  one  line ",
      coverUrl: null,
      coverCredit: { author: "Someone" },
    });
    expect(postsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ language: "pt", summary: "one line", coverUrl: null, coverCredit: null }),
    );
  });

  test("sets tags only when supplied", async () => {
    await createPost("me", { title: "t", contentHtml: "<p>x</p>" });
    expect(tagsRepo.setPostTags).not.toHaveBeenCalled();
    await createPost("me", { title: "t", contentHtml: "<p>x</p>", tags: ["#Deno"] });
    expect(tagsRepo.setPostTags).toHaveBeenCalledWith("new", ["deno"]);
  });

  test("too many tags are refused before anything is written", async () => {
    await expect(
      createPost("me", { title: "t", contentHtml: "<p>x</p>", tags: ["a", "b", "c", "d", "e", "f"] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(postsRepo.create).not.toHaveBeenCalled();
  });
});

describe("getPost", () => {
  const published = postWithAuthor({ id: "p1" }, { id: "author" });

  test.for(["abc", "1234567", "%", "________", "0b0e7c4e%", "zzzzzzzz"])(
    "refuses a non-hex or too-short id %j without querying",
    async (id) => {
      await expect(getPost(id)).rejects.toMatchObject({ status: 404 });
      expect(postsRepo.findById).not.toHaveBeenCalled();
    },
  );

  test("returns a published post to anyone", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(published);
    expect(await getPost("0b0e7c4e", null)).toBe(published);
  });

  test("404s when nothing matches", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(null);
    await expect(getPost("0b0e7c4e")).rejects.toMatchObject({ status: 404 });
  });

  test.for(["draft", "scheduled"] as const)("a %s is visible to its author only", async (status) => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1", status }, { id: "author" }));
    await expect(getPost("0b0e7c4e", "author")).resolves.toBeDefined();
    await expect(getPost("0b0e7c4e", "someone")).rejects.toMatchObject({ status: 404 });
    await expect(getPost("0b0e7c4e", null)).rejects.toMatchObject({ status: 404 });
  });

  test("a block hides a local author's post from the viewer", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(published);
    vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(true);
    await expect(getPost("0b0e7c4e", "viewer")).rejects.toMatchObject({ status: 404 });
  });

  test("a viewer's block hides a remote author's post", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(remotePostWithAuthor({ id: "p2" }, { id: "actor" }));
    vi.mocked(relationsRepo.hasRemote).mockResolvedValue(true);
    await expect(getPost("0b0e7c4e", "viewer")).rejects.toMatchObject({ status: 404 });
    expect(relationsRepo.hasRemote).toHaveBeenCalledWith("block", "viewer", "actor");
  });

  test("a private author's post is for approved followers only", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(published);
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "author", isPrivate: true }));
    await expect(getPost("0b0e7c4e", null)).rejects.toMatchObject({ status: 404 });
    await expect(getPost("0b0e7c4e", "stranger")).rejects.toMatchObject({ status: 404 });
    vi.mocked(followsRepo.isFollowing).mockResolvedValue(true);
    await expect(getPost("0b0e7c4e", "follower")).resolves.toBe(published);
    await expect(getPost("0b0e7c4e", "author")).resolves.toBe(published);
  });
});

describe("getPostBySlug", () => {
  const row = postWithAuthor({ id: "p1" }, { id: "author" });

  test("the live slug wins", async () => {
    vi.mocked(postsRepo.findByAuthorSlug).mockResolvedValue(row);
    expect(await getPostBySlug("ada", "hello")).toBe(row);
    expect(postsRepo.findIdByHistorySlug).not.toHaveBeenCalled();
  });

  test("a retired slug resolves through history", async () => {
    vi.mocked(postsRepo.findByAuthorSlug).mockResolvedValue(null);
    vi.mocked(postsRepo.findIdByHistorySlug).mockResolvedValue("p1");
    vi.mocked(postsRepo.findById).mockResolvedValue(row);
    expect(await getPostBySlug("ada", "old-title")).toBe(row);
    expect(postsRepo.findById).toHaveBeenCalledWith("p1");
  });

  test.for(["some-title-9E962281", "9e962281", "title-0b0e7c4e5d2a"])(
    "a trailing short id %j still works",
    async (slug) => {
      vi.mocked(postsRepo.findByAuthorSlug).mockResolvedValue(null);
      vi.mocked(postsRepo.findIdByHistorySlug).mockResolvedValue(null as never);
      vi.mocked(postsRepo.findById).mockResolvedValue(row);
      await getPostBySlug("ada", slug);
      expect(postsRepo.findById).toHaveBeenCalledWith(slug.match(/([0-9a-f]{8,})$/i)![1].toLowerCase());
    },
  );

  test("a full-UUID permalink resolves the post", async () => {
    vi.mocked(postsRepo.findByAuthorSlug).mockResolvedValue(null);
    vi.mocked(postsRepo.findIdByHistorySlug).mockResolvedValue(null as never);
    vi.mocked(postsRepo.findById).mockResolvedValue(row);
    await getPostBySlug("ada", "9e962281-2222-3333-4444-555555555555");
    expect(postsRepo.findById).toHaveBeenCalledWith("9e962281-2222-3333-4444-555555555555");
  });

  test("404s when nothing matches", async () => {
    vi.mocked(postsRepo.findByAuthorSlug).mockResolvedValue(null);
    vi.mocked(postsRepo.findIdByHistorySlug).mockResolvedValue(null as never);
    await expect(getPostBySlug("ada", "no-such-post")).rejects.toMatchObject({ status: 404 });
  });

  test("visibility applies to the slug path too", async () => {
    vi.mocked(postsRepo.findByAuthorSlug).mockResolvedValue(postWithAuthor({ status: "draft" }, { id: "author" }));
    await expect(getPostBySlug("ada", "hello", "stranger")).rejects.toMatchObject({ status: 404 });
  });
});

const own = (overrides = {}) => postWithAuthor({ id: "p1", title: "Old", ...overrides }, { id: "me" });

describe("updatePost", () => {
  test("404s / 403s before writing anything", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(null);
    await expect(updatePost("me", "x", {})).rejects.toMatchObject({ status: 404 });
    vi.mocked(postsRepo.findById).mockResolvedValue(remotePostWithAuthor());
    await expect(updatePost("me", "x", {})).rejects.toMatchObject({
      status: 403,
      message: "Federated posts cannot be edited here.",
    });
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({}, { id: "someone" }));
    await expect(updatePost("me", "x", {})).rejects.toMatchObject({ status: 403 });
    expect(postsRepo.update).not.toHaveBeenCalled();
  });

  test("an edit to a published post re-federates as an Update", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own());
    await updatePost("me", "p1", { contentHtml: "<p>new</p>" });
    expect(postsRepo.update).toHaveBeenCalledWith("p1", { contentHtml: "<p>new</p>", contentJson: null });
    expect(queued("federate_post")).toEqual([{ postId: "p1", action: "update" }]);
    expect(queued("indexnow_submit")).toEqual([{ postId: "p1" }]);
  });

  test("an omitted status leaves the post where it is (autosave safety)", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own({ status: "scheduled", publishAt: new Date(inMinutes(30)) }));
    await updatePost("me", "p1", { contentHtml: "<p>autosave</p>" });
    const changes = vi.mocked(postsRepo.update).mock.calls[0][1];
    expect(changes).not.toHaveProperty("status");
    expect(changes).not.toHaveProperty("publishAt");
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("publishing a draft dates it now and federates a Create", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own({ status: "draft", createdAt: new Date(0) }));
    await updatePost("me", "p1", { status: "published" });
    expect(postsRepo.update).toHaveBeenCalledWith("p1", { status: "published", createdAt: NOW });
    expect(queued("federate_post")).toEqual([{ postId: "p1", action: "create" }]);
  });

  test("unpublishing tombstones the federated copies", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own());
    await updatePost("me", "p1", { status: "draft" });
    expect(queued("federate_post_delete")).toEqual([{ postId: "p1", authorId: "me" }]);
    expect(queued("federate_post")).toEqual([]);
  });

  test("a published post cannot be scheduled", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own());
    await expect(updatePost("me", "p1", { status: "scheduled", publishAt: inMinutes(10) })).rejects.toMatchObject({
      status: 400,
    });
  });

  test("scheduling a draft stores the due time without federating", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own({ status: "draft" }));
    await updatePost("me", "p1", { status: "scheduled", publishAt: inMinutes(10) });
    expect(postsRepo.update).toHaveBeenCalledWith("p1", { status: "scheduled", publishAt: new Date(inMinutes(10)) });
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("a scheduled post keeps its time when only the status is resent", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own({ status: "scheduled", publishAt: new Date(inMinutes(10)) }));
    await updatePost("me", "p1", { status: "scheduled" });
    expect(vi.mocked(postsRepo.update).mock.calls[0][1]).not.toHaveProperty("publishAt");
  });

  test("returning a scheduled post to draft clears its time", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own({ status: "scheduled", publishAt: new Date(inMinutes(10)) }));
    await updatePost("me", "p1", { status: "draft" });
    expect(postsRepo.update).toHaveBeenCalledWith("p1", { status: "draft", publishAt: null });
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("publish-now on a scheduled post clears its time and federates a Create", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own({ status: "scheduled", publishAt: new Date(inMinutes(10)) }));
    await updatePost("me", "p1", { status: "published" });
    expect(postsRepo.update).toHaveBeenCalledWith("p1", { status: "published", publishAt: null, createdAt: NOW });
    expect(queued("federate_post")).toEqual([{ postId: "p1", action: "create" }]);
  });

  test("clearing the title of a published post is refused", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own());
    await expect(updatePost("me", "p1", { title: "  " })).rejects.toMatchObject({ status: 400 });
  });

  test("an untitled draft cannot be published", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own({ status: "draft", title: null }));
    await expect(updatePost("me", "p1", { status: "published" })).rejects.toMatchObject({ status: 400 });
  });

  test("an empty or oversized body is refused", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own());
    await expect(updatePost("me", "p1", { contentHtml: "<script></script>" })).rejects.toMatchObject({ status: 400 });
    await expect(updatePost("me", "p1", { contentHtml: "x".repeat(1_000_001) })).rejects.toMatchObject({
      status: 400,
    });
  });

  test("a retitle re-syncs the slug; an unchanged title does not", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own());
    const post = await updatePost("me", "p1", { title: "New" });
    expect(syncSlug).toHaveBeenCalledOnce();
    expect(post.slug).toBe("a-slug");
    vi.mocked(syncSlug).mockClear();
    await updatePost("me", "p1", { title: "Old" });
    expect(syncSlug).not.toHaveBeenCalled();
  });

  test("a tags-only edit replaces the tags and touches updated_at without an UPDATE", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own());
    await updatePost("me", "p1", { tags: [] });
    expect(postsRepo.update).not.toHaveBeenCalled();
    expect(tagsRepo.setPostTags).toHaveBeenCalledWith("p1", []);
    expect(postsRepo.touch).toHaveBeenCalledWith("p1");
  });

  test("tags alongside other edits do not double-touch", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own());
    await updatePost("me", "p1", { tags: ["x"], summary: "s" });
    expect(postsRepo.update).toHaveBeenCalled();
    expect(postsRepo.touch).not.toHaveBeenCalled();
  });

  test("the banner moves with its credit", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(own());
    await updatePost("me", "p1", { coverUrl: null, coverCredit: { author: "x" } });
    expect(postsRepo.update).toHaveBeenCalledWith("p1", { coverUrl: null, coverCredit: null });
  });
});

describe("deletePost", () => {
  test("the author deletes a published post and it is tombstoned remotely", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1" }, { id: "me" }));
    await deletePost("me", false, "p1");
    expect(postsRepo.remove).toHaveBeenCalledWith("p1");
    expect(queued("federate_post_delete")).toEqual([{ postId: "p1", authorId: "me" }]);
    expect(notifyPostAuthorRemoved).not.toHaveBeenCalled();
  });

  test("deleting a draft federates nothing", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1", status: "draft" }, { id: "me" }));
    await deletePost("me", false, "p1");
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("a moderator may delete and opt into telling the author", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1", title: "T" }, { id: "author" }));
    await deletePost("mod", true, "p1", { notify: true });
    expect(notifyPostAuthorRemoved).toHaveBeenCalledWith("author", "mod", "T");
    expect(queued("federate_post_delete")).toEqual([{ postId: "p1", authorId: "author" }]);
  });

  test("anyone else is refused", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({}, { id: "author" }));
    await expect(deletePost("me", false, "p1")).rejects.toMatchObject({ status: 403 });
    expect(postsRepo.remove).not.toHaveBeenCalled();
  });

  test("remote posts cannot be deleted here, even by a moderator", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(remotePostWithAuthor());
    await expect(deletePost("mod", true, "p1")).rejects.toMatchObject({ status: 403 });
  });

  test("404s on a missing post", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(null);
    await expect(deletePost("me", true, "x")).rejects.toMatchObject({ status: 404 });
  });
});

const pagedRows = (n: number, due = true) =>
  Array.from({ length: n }, (_, i) =>
    postWithAuthor({
      id: uuid(i),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 59 - i)),
      publishAt: due ? new Date(Date.UTC(2027, 0, 1, 0, 0, i)) : null,
    }),
  );

describe("pageOf / pageOfDue", () => {
  test("pageOf keys the cursor on createdAt", () => {
    const r = pagedRows(3);
    const page = pageOf(r, 2);
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.nextCursor)).toEqual({ createdAt: r[1].post.createdAt.toISOString(), id: uuid(1) });
    expect(pageOf(r, 3).nextCursor).toBe(null);
  });

  test("pageOfDue keys the cursor on publishAt", () => {
    const r = pagedRows(3);
    const page = pageOfDue(r, 2);
    expect(decodeCursor(page.nextCursor)).toEqual({ createdAt: r[1].post.publishAt!.toISOString(), id: uuid(1) });
  });
});

describe("listOwn / ownCounts / trending", () => {
  test("routes each tab to its repository listing", async () => {
    vi.mocked(postsRepo.listDraftsByAuthor).mockResolvedValue([]);
    vi.mocked(postsRepo.listScheduledByAuthor).mockResolvedValue([]);
    vi.mocked(postsRepo.listPublishedByAuthor).mockResolvedValue([]);
    await listOwn("me", "draft", null);
    await listOwn("me", "scheduled", null);
    await listOwn("me", "published", null);
    expect(postsRepo.listDraftsByAuthor).toHaveBeenCalledWith("me", null, DEFAULT_PAGE_SIZE);
    expect(postsRepo.listScheduledByAuthor).toHaveBeenCalledWith("me", null, DEFAULT_PAGE_SIZE);
    expect(postsRepo.listPublishedByAuthor).toHaveBeenCalledWith("me", null, DEFAULT_PAGE_SIZE);
  });

  test("ownCounts and trending delegate", async () => {
    vi.mocked(postsRepo.countsByAuthor).mockResolvedValue({ draft: 1, scheduled: 2, published: 3 });
    expect(await ownCounts("me")).toEqual({ draft: 1, scheduled: 2, published: 3 });
    await trending("viewer");
    expect(postsRepo.listTrending).toHaveBeenCalledWith("viewer", 5);
  });
});

describe("relatedPosts", () => {
  test("tops up with recent posts, without duplicates, to the limit", async () => {
    vi.mocked(postsRepo.listRelated).mockResolvedValue([postWithAuthor({ id: "a" })]);
    vi.mocked(postsRepo.listRecentExcluding).mockResolvedValue(
      ["a", "b", "c", "d"].map((id) => postWithAuthor({ id })),
    );
    expect((await relatedPosts("self", 3)).map((r) => r.post.id)).toEqual(["a", "b", "c"]);
  });

  test("does not query the filler when related is already full", async () => {
    vi.mocked(postsRepo.listRelated).mockResolvedValue(["a", "b", "c"].map((id) => postWithAuthor({ id })));
    await relatedPosts("self", 3);
    expect(postsRepo.listRecentExcluding).not.toHaveBeenCalled();
  });

  test("returns fewer when the instance has fewer posts", async () => {
    vi.mocked(postsRepo.listRelated).mockResolvedValue([]);
    vi.mocked(postsRepo.listRecentExcluding).mockResolvedValue([postWithAuthor({ id: "only" })]);
    expect((await relatedPosts("self")).map((r) => r.post.id)).toEqual(["only"]);
  });
});

function stream(authors: string[]): PostWithAuthor[] {
  return authors.map((a, i) =>
    postWithAuthor({ id: uuid(i), createdAt: new Date(Date.UTC(2026, 0, 1) + (10_000 - i) * 1000) }, { id: a }),
  );
}

describe.each([
  ["globalTimeline", globalTimeline, "listGlobal"],
  ["localTimeline", localTimeline, "listLocal"],
] as const)("%s (author diversity)", (_name, timeline, repoFn) => {
  // A newest-first stream honouring keyset cursors, like the real SQL.
  function serve(rows: PostWithAuthor[]) {
    vi.mocked(postsRepo[repoFn]).mockImplementation((async (
      _v: string | null,
      cursor: Cursor | null,
      limit = DEFAULT_PAGE_SIZE,
    ) => {
      const after = cursor
        ? rows.filter((r) => {
            const ct = new Date(cursor.createdAt).getTime();
            const t = r.post.createdAt.getTime();
            return t < ct || (t === ct && r.post.id < cursor.id);
          })
        : rows;
      return after.slice(0, limit + 1);
    }) as never);
  }

  async function scroll() {
    const pages: PostWithAuthor[][] = [];
    let cursor: Cursor | null = null;
    for (let i = 0; i < 100; i++) {
      const page = await timeline(cursor, null, null);
      pages.push(page.items);
      if (!page.nextCursor) return pages;
      cursor = decodeCursor(page.nextCursor);
    }
    throw new Error("timeline never terminated");
  }

  test("an empty instance is one empty page", async () => {
    serve([]);
    expect(await timeline(null, null, null)).toEqual({ items: [], nextCursor: null });
  });

  test("passes the viewer and language filter through", async () => {
    serve([]);
    const filter = { mode: "show" as const, langs: ["en"] };
    await timeline(null, "viewer", filter);
    expect(postsRepo[repoFn]).toHaveBeenCalledWith("viewer", null, DEFAULT_PAGE_SIZE * 4, filter);
  });

  test("a varied stream pages through completely, in order, without repeats", async () => {
    const authors = Array.from({ length: 97 }, (_, i) => `u${i % 7}`);
    serve(stream(authors));
    const pages = await scroll();
    const ids = pages.flat().map((r) => r.post.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(ids.toSorted());
    for (const p of pages.slice(0, -1)) expect(p).toHaveLength(DEFAULT_PAGE_SIZE);
  });

  test("never shows more than two posts by one author in a row, nor over-fills a page", async () => {
    const authors = [...Array(30).fill("prolific"), ...Array.from({ length: 60 }, (_, i) => `u${i % 10}`)];
    serve(stream(authors));
    for (const page of await scroll()) {
      let run = 0;
      let prev = "";
      const perAuthor = new Map<string, number>();
      for (const r of page) {
        const a = r.post.authorId!;
        run = a === prev ? run + 1 : 1;
        prev = a;
        expect(run).toBeLessThanOrEqual(MAX_CONSECUTIVE_SAME_AUTHOR);
        perAuthor.set(a, (perAuthor.get(a) ?? 0) + 1);
      }
      for (const n of perAuthor.values()) expect(n).toBeLessThanOrEqual(maxPerAuthorPerPage(DEFAULT_PAGE_SIZE));
    }
  });

  test("a single-author instance still terminates", async () => {
    serve(stream(Array(50).fill("solo")));
    const pages = await scroll();
    expect(pages.flat().length).toBeGreaterThan(0);
  });
});
