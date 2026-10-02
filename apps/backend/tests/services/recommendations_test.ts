// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { postWithAuthor, remotePostWithAuthor, uuid } from "../fixtures.ts";

vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/recommendations.ts"));
vi.mock(import("@/db/repositories/relations.ts"));
vi.mock(import("@/db/repositories/notifications.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import * as notificationsRepo from "@/db/repositories/notifications.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import type { RecommendedPostRow } from "@/db/repositories/recommendations.ts";
import * as recommendationsRepo from "@/db/repositories/recommendations.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import { DEFAULT_PAGE_SIZE, decodeCursor } from "@/lib/pagination.ts";
import { queue } from "@/queue/queue.ts";
import { listByRemoteActor, listByUser, recommend, unrecommend } from "@/services/recommendations.ts";

const post = postWithAuthor({ id: "p1" }, { id: "author" });

beforeEach(() => {
  vi.mocked(postsRepo.findById).mockResolvedValue(post);
  vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(false);
  vi.mocked(relationsRepo.hasRemote).mockResolvedValue(false);
  vi.mocked(recommendationsRepo.statsFor).mockResolvedValue(new Map([["p1", { count: 1, recommended: true }]]));
});

describe("recommend", () => {
  test("records it, notifies the author, federates an Announce and returns stats", async () => {
    expect(await recommend("me", "p1")).toEqual({ count: 1, recommended: true });
    expect(recommendationsRepo.add).toHaveBeenCalledWith("p1", "me");
    expect(notificationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "author", type: "recommend", actorId: "me", postId: "p1" }),
    );
    expect(queue.add).toHaveBeenCalledWith("send_recommend", { userId: "me", postId: "p1" });
  });

  test("a remote post federates without a local notification", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(remotePostWithAuthor({ id: "p2" }));
    vi.mocked(recommendationsRepo.statsFor).mockResolvedValue(new Map());
    expect(await recommend("me", "p2")).toEqual({ count: 0, recommended: false });
    expect(notificationsRepo.create).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith("send_recommend", { userId: "me", postId: "p2" });
  });

  test("404s on a missing post", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(null);
    await expect(recommend("me", "x")).rejects.toMatchObject({ status: 404 });
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("403s across a local block and federates nothing", async () => {
    vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(true);
    await expect(recommend("me", "p1")).rejects.toMatchObject({ status: 403 });
    expect(recommendationsRepo.add).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("403s on a remote post whose author the viewer blocked", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(remotePostWithAuthor({ id: "p2" }, { id: "actor" }));
    vi.mocked(relationsRepo.hasRemote).mockResolvedValue(true);
    await expect(recommend("me", "p2")).rejects.toMatchObject({ status: 403 });
  });

  // Recommending queues send_recommend, which would federate an Announce of a
  // post nobody else may read.
  test("refuses to recommend (and federate) someone else's draft", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1", status: "draft" }, { id: "author" }));
    await expect(recommend("me", "p1")).rejects.toMatchObject({ status: 404 });
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe("unrecommend", () => {
  test("removes it, clears the notification and federates Undo(Announce)", async () => {
    await unrecommend("me", "p1");
    expect(recommendationsRepo.remove).toHaveBeenCalledWith("p1", "me");
    expect(notificationsRepo.removeMatching).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "author", type: "recommend", actorId: "me" }),
    );
    expect(queue.add).toHaveBeenCalledWith("send_unrecommend", { userId: "me", postId: "p1" });
  });

  test("404s on a missing post", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(null);
    await expect(unrecommend("me", "x")).rejects.toMatchObject({ status: 404 });
  });

  test("a remote post skips the notification cleanup", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(remotePostWithAuthor({ id: "p2" }));
    await unrecommend("me", "p2");
    expect(notificationsRepo.removeMatching).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith("send_unrecommend", { userId: "me", postId: "p2" });
  });
});

function recRows(n: number): RecommendedPostRow[] {
  return Array.from({ length: n }, (_, i) => ({
    ...postWithAuthor({ id: `p${i}` }),
    recommendationId: uuid(i),
    recommendedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 59 - i)),
  }));
}

describe.each([
  ["listByUser", listByUser, "listByUser"],
  ["listByRemoteActor", listByRemoteActor, "listByRemoteActor"],
] as const)("%s", (_name, fn, repoFn) => {
  test("returns a full page without a cursor", async () => {
    vi.mocked(recommendationsRepo[repoFn]).mockResolvedValue(recRows(2));
    const page = await fn("owner", "viewer", null);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe(null);
    expect(recommendationsRepo[repoFn]).toHaveBeenCalledWith("owner", "viewer", null, DEFAULT_PAGE_SIZE);
  });

  test("keys the cursor on the recommendation, not the post", async () => {
    const rows = recRows(DEFAULT_PAGE_SIZE + 1);
    vi.mocked(recommendationsRepo[repoFn]).mockResolvedValue(rows);
    const page = await fn("owner", null, null);
    expect(page.items).toHaveLength(DEFAULT_PAGE_SIZE);
    const last = rows[DEFAULT_PAGE_SIZE - 1];
    expect(decodeCursor(page.nextCursor)).toEqual({
      createdAt: last.recommendedAt.toISOString(),
      id: last.recommendationId,
    });
  });
});
