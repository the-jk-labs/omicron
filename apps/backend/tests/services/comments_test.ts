// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { commentRow, commentWithAuthor, postWithAuthor, remotePostWithAuthor, userRow } from "../fixtures.ts";

vi.mock(import("@/db/repositories/commentLikes.ts"));
vi.mock(import("@/db/repositories/comments.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/relations.ts"));
vi.mock(import("@/db/repositories/notifications.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import * as commentLikesRepo from "@/db/repositories/commentLikes.ts";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { DEFAULT_PAGE_SIZE, decodeCursor } from "@/lib/pagination.ts";
import { queue } from "@/queue/queue.ts";
import { create, edit, list, remove } from "@/services/comments.ts";

const post = postWithAuthor({ id: "p1" }, { id: "author" });

beforeEach(() => {
  vi.mocked(postsRepo.findById).mockResolvedValue(post);
  vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(false);
  vi.mocked(relationsRepo.hasRemote).mockResolvedValue(false);
  vi.mocked(commentsRepo.create).mockImplementation(async (data) => commentRow({ id: "new", ...data }));
  vi.mocked(commentsRepo.update).mockImplementation(async (id, content) => commentRow({ id, content }));
});

function notifiedTypes() {
  return vi.mocked(notificationsRepo.create).mock.calls.map(([n]) => [n.type, n.recipientId]);
}

describe("create", () => {
  test("stores trimmed text, notifies the post author and federates", async () => {
    const c = await create("viewer", "p1", "  hello  ");
    expect(commentsRepo.create).toHaveBeenCalledWith({
      postId: "p1",
      authorId: "viewer",
      content: "hello",
      parentId: null,
    });
    expect(notifiedTypes()).toEqual([["comment", "author"]]);
    expect(queue.add).toHaveBeenCalledWith("federate_comment", { commentId: c.id });
  });

  test.for([undefined, null, "", "   \n\t "])("rejects empty content %j", async (content) => {
    await expect(create("viewer", "p1", content as string)).rejects.toMatchObject({
      status: 400,
      message: "Comment cannot be empty.",
    });
    expect(commentsRepo.create).not.toHaveBeenCalled();
  });

  test("accepts exactly 2000 characters and refuses 2001", async () => {
    await expect(create("viewer", "p1", "x".repeat(2000))).resolves.toBeDefined();
    await expect(create("viewer", "p1", "x".repeat(2001))).rejects.toMatchObject({ status: 400 });
  });

  test("measures the limit after trimming", async () => {
    await expect(create("viewer", "p1", ` ${"x".repeat(2000)} `)).resolves.toBeDefined();
  });

  test("404s on a missing post", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(null);
    await expect(create("viewer", "nope", "hi")).rejects.toMatchObject({ status: 404, message: "Post not found." });
  });

  test("403s across a block with a local author", async () => {
    vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(true);
    await expect(create("viewer", "p1", "hi")).rejects.toMatchObject({ status: 403 });
  });

  test("403s on a remote post whose author the viewer blocked", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(remotePostWithAuthor({ id: "p2" }, { id: "actor" }));
    vi.mocked(relationsRepo.hasRemote).mockResolvedValue(true);
    await expect(create("viewer", "p2", "hi")).rejects.toMatchObject({ status: 403 });
  });

  test("a comment on a remote post notifies nobody but still federates", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(remotePostWithAuthor({ id: "p2" }));
    await create("viewer", "p2", "hi");
    expect(notificationsRepo.create).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith("federate_comment", { commentId: "new" });
  });

  test("the post author commenting on their own post is not notified", async () => {
    await create("author", "p1", "hi");
    expect(notificationsRepo.create).not.toHaveBeenCalled();
  });

  test("a reply attaches to its top-level parent and notifies the replied-to author", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ id: "top", postId: "p1", authorId: "carol" }));
    await create("viewer", "p1", "reply", "top");
    expect(commentsRepo.create).toHaveBeenCalledWith(expect.objectContaining({ parentId: "top" }));
    expect(notifiedTypes()).toEqual([
      ["comment", "author"],
      ["reply", "carol"],
    ]);
  });

  test("replying to a reply re-targets the top-level parent but notifies the reply's author", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(
      commentRow({ id: "child", postId: "p1", parentId: "top", authorId: "dave" }),
    );
    await create("viewer", "p1", "reply", "child");
    expect(commentsRepo.create).toHaveBeenCalledWith(expect.objectContaining({ parentId: "top" }));
    expect(notifiedTypes()).toContainEqual(["reply", "dave"]);
  });

  test("replying to the post author's own comment notifies them once", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ id: "top", postId: "p1", authorId: "author" }));
    await create("viewer", "p1", "reply", "top");
    expect(notifiedTypes()).toEqual([["comment", "author"]]);
  });

  test("replying to a remote comment sends no reply notification", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(
      commentRow({ id: "top", postId: "p1", authorId: null, remoteActorId: "actor" }),
    );
    await create("viewer", "p1", "reply", "top");
    expect(notifiedTypes()).toEqual([["comment", "author"]]);
  });

  test("404s when the parent is missing or belongs to another post", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(null as never);
    await expect(create("viewer", "p1", "x", "gone")).rejects.toMatchObject({ status: 404 });
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ id: "other", postId: "p9" }));
    await expect(create("viewer", "p1", "x", "other")).rejects.toMatchObject({
      status: 404,
      message: "Parent comment not found.",
    });
    expect(commentsRepo.create).not.toHaveBeenCalled();
  });

  // BUG: create() looks the post up with the unfiltered postsRepo.findById and
  // never applies the visibility rules a reader gets (assertVisible in
  // services/posts.ts). Anyone who knows a post id can comment on — and notify
  // the author of — a draft, a scheduled post, or a private account's post.
  test.fails("BUG: refuses to comment on someone else's draft", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1", status: "draft" }, { id: "author" }));
    await expect(create("viewer", "p1", "hi")).rejects.toMatchObject({ status: 404 });
  });

  test.fails("BUG: refuses to comment on a private account's post from a non-follower", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1" }, { id: "author", isPrivate: true }));
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "author", isPrivate: true }));
    await expect(create("viewer", "p1", "hi")).rejects.toMatchObject({ status: 404 });
  });

  // BUG: getPost() refuses any id that is not hex (so LIKE wildcards never reach
  // the prefix match), but create() hands the raw route param to findById,
  // whose prefix lookup is `id::text like '<id>%'`. "%" then matches every post.
  test.fails("BUG: never passes a LIKE wildcard through to the post lookup", async () => {
    await create("viewer", "%", "hi").catch(() => {});
    expect(postsRepo.findById).not.toHaveBeenCalledWith("%");
  });
});

describe("edit", () => {
  test("lets the author edit and federates an Update", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ id: "c1", authorId: "me" }));
    const updated = await edit("me", "c1", "  new text ");
    expect(commentsRepo.update).toHaveBeenCalledWith("c1", "new text");
    expect(updated).toMatchObject({ content: "new text" });
    expect(queue.add).toHaveBeenCalledWith("federate_comment", { commentId: "c1", action: "update" });
  });

  test("refuses anyone else, moderators included", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ id: "c1", authorId: "someone" }));
    await expect(edit("me", "c1", "x")).rejects.toMatchObject({ status: 403 });
    expect(commentsRepo.update).not.toHaveBeenCalled();
  });

  test("refuses to edit a remote comment", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ authorId: null, remoteActorId: "a" }));
    await expect(edit("me", "comment-1", "x")).rejects.toMatchObject({ status: 403 });
  });

  test("validates content before looking anything up", async () => {
    await expect(edit("me", "c1", "   ")).rejects.toMatchObject({ status: 400 });
    await expect(edit("me", "c1", "x".repeat(2001))).rejects.toMatchObject({ status: 400 });
    expect(commentsRepo.findById).not.toHaveBeenCalled();
  });

  test("404s on a missing comment", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(null as never);
    await expect(edit("me", "gone", "x")).rejects.toMatchObject({ status: 404 });
  });
});

describe("remove", () => {
  test("the author deletes and a Delete(Note) federates", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ id: "c1", postId: "p1", authorId: "me" }));
    await remove("me", false, "c1");
    expect(commentsRepo.remove).toHaveBeenCalledWith("c1");
    expect(queue.add).toHaveBeenCalledWith("federate_comment_delete", {
      commentId: "c1",
      authorId: "me",
      postId: "p1",
    });
  });

  test("a moderator may delete someone else's comment", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ id: "c1", authorId: "someone" }));
    await remove("mod", true, "c1");
    expect(commentsRepo.remove).toHaveBeenCalledWith("c1");
    // The Delete is attributed to the comment's author, not the moderator.
    expect(queue.add).toHaveBeenCalledWith("federate_comment_delete", expect.objectContaining({ authorId: "someone" }));
  });

  test("removing a remote reply federates nothing", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ authorId: null, remoteActorId: "a" }));
    await remove("mod", true, "comment-1");
    expect(commentsRepo.remove).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("anyone else is refused", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ authorId: "someone" }));
    await expect(remove("me", false, "comment-1")).rejects.toMatchObject({ status: 403 });
    expect(commentsRepo.remove).not.toHaveBeenCalled();
  });

  test("404s on a missing comment", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(null as never);
    await expect(remove("me", true, "gone")).rejects.toMatchObject({ status: 404 });
  });
});

describe("list", () => {
  beforeEach(() => {
    vi.mocked(commentLikesRepo.statsFor).mockResolvedValue(new Map([["t1", { count: 2, liked: true }]]));
  });

  test("nests replies under their parents and attaches like stats", async () => {
    vi.mocked(commentsRepo.listByPost).mockResolvedValue([
      commentWithAuthor({ id: "t1" }),
      commentWithAuthor({ id: "t2" }),
    ]);
    vi.mocked(commentsRepo.listReplies).mockResolvedValue([
      commentWithAuthor({ id: "r1", parentId: "t1" }),
      commentWithAuthor({ id: "r2", parentId: "t1" }),
      commentWithAuthor({ id: "r3", parentId: "t2" }),
    ]);
    const { items, nextCursor } = await list("p1", null, "viewer");
    expect(nextCursor).toBe(null);
    expect(items.map((i) => [i.comment.id, i.replies.map((r) => r.comment.id)])).toEqual([
      ["t1", ["r1", "r2"]],
      ["t2", ["r3"]],
    ]);
    expect(items[0].likeStats).toEqual({ count: 2, liked: true });
    expect(items[1].likeStats).toEqual({ count: 0, liked: false });
    expect(commentLikesRepo.statsFor).toHaveBeenCalledWith(["t1", "t2", "r1", "r2", "r3"], "viewer");
  });

  test("pages top-level comments and only fetches replies for the kept page", async () => {
    const tops = Array.from({ length: DEFAULT_PAGE_SIZE + 1 }, (_, i) =>
      commentWithAuthor({ id: `t${i}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 59 - i)) }),
    );
    vi.mocked(commentsRepo.listByPost).mockResolvedValue(tops);
    vi.mocked(commentsRepo.listReplies).mockResolvedValue([]);
    const { items, nextCursor } = await list("p1", null, null);
    expect(items).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(vi.mocked(commentsRepo.listReplies).mock.calls[0][0]).toHaveLength(DEFAULT_PAGE_SIZE);
    const last = tops[DEFAULT_PAGE_SIZE - 1].comment;
    expect(decodeCursor(nextCursor)).toEqual({ createdAt: last.createdAt.toISOString(), id: last.id });
  });

  test("an empty thread is an empty page", async () => {
    vi.mocked(commentsRepo.listByPost).mockResolvedValue([]);
    vi.mocked(commentsRepo.listReplies).mockResolvedValue([]);
    expect(await list("p1", null, null)).toEqual({ items: [], nextCursor: null });
  });

  // BUG: list() reads comments straight off the post id with no visibility
  // check, so the responses on a draft or a private account's post are
  // readable by anyone who has the post id.
  test.fails("BUG: hides the comments on someone else's draft", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1", status: "draft" }, { id: "author" }));
    vi.mocked(commentsRepo.listByPost).mockResolvedValue([commentWithAuthor({ id: "t1" })]);
    vi.mocked(commentsRepo.listReplies).mockResolvedValue([]);
    await expect(list("p1", null, "viewer")).rejects.toMatchObject({ status: 404 });
  });
});
