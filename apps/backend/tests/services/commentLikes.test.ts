// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { commentRow } from "../fixtures.ts";

vi.mock(import("@/db/repositories/commentLikes.ts"));
vi.mock(import("@/db/repositories/comments.ts"));
vi.mock(import("@/db/repositories/relations.ts"));
vi.mock(import("@/db/repositories/notifications.ts"));

import * as commentLikesRepo from "@/db/repositories/commentLikes.ts";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import { like, unlike } from "@/services/commentLikes.ts";

const local = commentRow({ id: "c1", postId: "p1", authorId: "author" });
const remote = commentRow({ id: "c2", postId: "p1", authorId: null, remoteActorId: "actor" });

beforeEach(() => {
  vi.mocked(commentLikesRepo.statsFor).mockResolvedValue(new Map([["c1", { count: 1, liked: true }]]));
  vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(false);
  vi.mocked(relationsRepo.hasRemote).mockResolvedValue(false);
});

describe("like", () => {
  test("likes a local comment and notifies its author with the post and comment", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(local);
    expect(await like("viewer", "c1")).toEqual({ count: 1, liked: true });
    expect(commentLikesRepo.add).toHaveBeenCalledWith("c1", "viewer");
    expect(notificationsRepo.create).toHaveBeenCalledWith({
      recipientId: "author",
      type: "comment_like",
      actorId: "viewer",
      remoteActorId: null,
      postId: "p1",
      commentId: "c1",
    });
  });

  test("404s on a missing comment", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(undefined as never);
    await expect(like("viewer", "x")).rejects.toMatchObject({ status: 404, message: "Comment not found." });
  });

  test("403s across a local block", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(local);
    vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(true);
    await expect(like("viewer", "c1")).rejects.toMatchObject({ status: 403 });
    expect(commentLikesRepo.add).not.toHaveBeenCalled();
  });

  test("403s on a remote author the viewer blocked", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(remote);
    vi.mocked(relationsRepo.hasRemote).mockResolvedValue(true);
    await expect(like("viewer", "c2")).rejects.toMatchObject({ status: 403 });
    expect(relationsRepo.hasRemote).toHaveBeenCalledWith("block", "viewer", "actor");
  });

  test("likes a remote comment without a notification", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(remote);
    vi.mocked(commentLikesRepo.statsFor).mockResolvedValue(new Map());
    expect(await like("viewer", "c2")).toEqual({ count: 0, liked: false });
    expect(notificationsRepo.create).not.toHaveBeenCalled();
  });

  test("a self-like is recorded but not notified", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(local);
    await like("author", "c1");
    expect(commentLikesRepo.add).toHaveBeenCalled();
    expect(notificationsRepo.create).not.toHaveBeenCalled();
  });
});

describe("unlike", () => {
  test("removes the like and its notification", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(local);
    await unlike("viewer", "c1");
    expect(commentLikesRepo.remove).toHaveBeenCalledWith("c1", "viewer");
    expect(notificationsRepo.removeMatching).toHaveBeenCalledWith(
      expect.objectContaining({ type: "comment_like", commentId: "c1", recipientId: "author" }),
    );
  });

  test("404s on a missing comment", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(undefined as never);
    await expect(unlike("viewer", "x")).rejects.toMatchObject({ status: 404 });
  });

  test("unlikes a remote comment without touching notifications", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(remote);
    await unlike("viewer", "c2");
    expect(notificationsRepo.removeMatching).not.toHaveBeenCalled();
  });
});
