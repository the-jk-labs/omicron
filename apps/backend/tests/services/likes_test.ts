// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { postWithAuthor, remotePostWithAuthor } from "../fixtures.ts";

vi.mock(import("@/db/repositories/likes.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/relations.ts"));
vi.mock(import("@/db/repositories/notifications.ts"));

import * as likesRepo from "@/db/repositories/likes.ts";
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import { like, unlike } from "@/services/likes.ts";

const localPost = postWithAuthor({ id: "p1" }, { id: "author" });
const remotePost = remotePostWithAuthor({ id: "p2" }, { id: "actor" });

beforeEach(() => {
  vi.mocked(likesRepo.statsFor).mockResolvedValue(new Map([["p1", { count: 3, liked: true }]]));
  vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(false);
  vi.mocked(relationsRepo.hasRemote).mockResolvedValue(false);
  vi.mocked(notificationsRepo.create).mockResolvedValue(undefined as never);
});

describe("like", () => {
  test("adds the like, notifies the author and returns fresh stats", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(localPost);
    expect(await like("viewer", "p1")).toEqual({ count: 3, liked: true });
    expect(likesRepo.add).toHaveBeenCalledWith("p1", "viewer");
    expect(notificationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "author", type: "like", actorId: "viewer", postId: "p1" }),
    );
  });

  test("404s on a missing post without writing anything", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(undefined as never);
    await expect(like("viewer", "nope")).rejects.toMatchObject({ status: 404, message: "Post not found." });
    expect(likesRepo.add).not.toHaveBeenCalled();
  });

  test("403s when the viewer and a local author block each other", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(localPost);
    vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(true);
    await expect(like("viewer", "p1")).rejects.toMatchObject({ status: 403 });
    expect(relationsRepo.localBlockExists).toHaveBeenCalledWith("viewer", "author");
    expect(likesRepo.add).not.toHaveBeenCalled();
  });

  test("403s when the viewer blocked the remote author", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(remotePost);
    vi.mocked(relationsRepo.hasRemote).mockResolvedValue(true);
    await expect(like("viewer", "p2")).rejects.toMatchObject({ status: 403 });
    expect(relationsRepo.hasRemote).toHaveBeenCalledWith("block", "viewer", "actor");
  });

  test("likes a remote post without notifying anyone", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(remotePost);
    await like("viewer", "p2");
    expect(likesRepo.add).toHaveBeenCalledWith("p2", "viewer");
    expect(notificationsRepo.create).not.toHaveBeenCalled();
  });

  test("never notifies an author about liking their own post", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(localPost);
    await like("author", "p1");
    expect(likesRepo.add).toHaveBeenCalled();
    expect(notificationsRepo.create).not.toHaveBeenCalled();
  });

  test("reports zero stats when the repository has no row for the post", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(localPost);
    vi.mocked(likesRepo.statsFor).mockResolvedValue(new Map());
    expect(await like("viewer", "p1")).toEqual({ count: 0, liked: false });
  });

  test("still succeeds when the notification write fails", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(localPost);
    vi.mocked(notificationsRepo.create).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(like("viewer", "p1")).resolves.toEqual({ count: 3, liked: true });
  });
});

describe("unlike", () => {
  test("removes the like and the notification", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(localPost);
    await unlike("viewer", "p1");
    expect(likesRepo.remove).toHaveBeenCalledWith("p1", "viewer");
    expect(notificationsRepo.removeMatching).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "author", type: "like", actorId: "viewer", postId: "p1" }),
    );
  });

  test("404s on a missing post", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(undefined as never);
    await expect(unlike("viewer", "nope")).rejects.toMatchObject({ status: 404 });
    expect(likesRepo.remove).not.toHaveBeenCalled();
  });

  test("unlikes a remote post without touching notifications", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(remotePost);
    await unlike("viewer", "p2");
    expect(notificationsRepo.removeMatching).not.toHaveBeenCalled();
  });

  test("is allowed even when a block now exists (cleanup must always work)", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(localPost);
    vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(true);
    await expect(unlike("viewer", "p1")).resolves.toBeDefined();
    expect(likesRepo.remove).toHaveBeenCalled();
  });
});

describe("visibility", () => {
  // BUG: like() uses the unfiltered postsRepo.findById and never applies the
  // reader's visibility rules (assertVisible in services/posts.ts), so a post
  // its author has not published, or that a private account keeps to its
  // followers, can still be liked by anyone with its id.
  test.fails("BUG: refuses to like someone else's draft", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1", status: "draft" }, { id: "author" }));
    await expect(like("viewer", "p1")).rejects.toMatchObject({ status: 404 });
  });

  test.fails("BUG: refuses to like someone else's scheduled post", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(
      postWithAuthor({ id: "p1", status: "scheduled", publishAt: new Date(Date.now() + 3_600_000) }, { id: "author" }),
    );
    await expect(like("viewer", "p1")).rejects.toMatchObject({ status: 404 });
  });

  // BUG: the raw route param reaches findById's `id::text like '<id>%'` prefix
  // lookup; "%" matches every post (getPost guards this, like() does not).
  test.fails("BUG: never passes a LIKE wildcard through to the post lookup", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(localPost);
    await like("viewer", "%").catch(() => {});
    expect(postsRepo.findById).not.toHaveBeenCalledWith("%");
  });
});
