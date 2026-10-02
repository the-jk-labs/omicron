// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/notifications.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import * as notificationsRepo from "@/db/repositories/notifications.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import { queue } from "@/queue/queue.ts";

async function load() {
  vi.resetModules();
  return await import("@/services/scheduledPosts.ts");
}

afterEach(() => {
  vi.useRealTimers();
});

test("publishes each claimed post: federate, IndexNow and tell the author", async () => {
  const { sweep } = await load();
  vi.mocked(postsRepo.claimDue).mockResolvedValue([
    { id: "p1", authorId: "a1" },
    { id: "p2", authorId: null },
  ]);
  vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await sweep()).toBe(2);
  expect(postsRepo.claimDue).toHaveBeenCalledWith(50);
  expect(vi.mocked(queue.add).mock.calls).toEqual([
    ["federate_post", { postId: "p1", action: "create" }],
    ["indexnow_submit", { postId: "p1" }],
    ["federate_post", { postId: "p2", action: "create" }],
    ["indexnow_submit", { postId: "p2" }],
  ]);
  expect(notificationsRepo.create).toHaveBeenCalledOnce();
  expect(notificationsRepo.create).toHaveBeenCalledWith(
    expect.objectContaining({ recipientId: "a1", type: "post_published", postId: "p1", actorId: null }),
  );
});

test("nothing due is a silent no-op", async () => {
  const { sweep } = await load();
  vi.mocked(postsRepo.claimDue).mockResolvedValue([]);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await sweep()).toBe(0);
  expect(queue.add).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

test("a failed claim is logged and retried next tick", async () => {
  const { sweep } = await load();
  vi.mocked(postsRepo.claimDue).mockRejectedValue(new Error("db down"));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await sweep()).toBe(0);
  expect(error).toHaveBeenCalled();
});

test("a failing notification does not stop the next post's fan-out", async () => {
  const { sweep } = await load();
  vi.mocked(postsRepo.claimDue).mockResolvedValue([
    { id: "p1", authorId: "a1" },
    { id: "p2", authorId: "a2" },
  ]);
  vi.mocked(notificationsRepo.create).mockRejectedValueOnce(new Error("boom"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await sweep()).toBe(2);
  expect(vi.mocked(queue.add).mock.calls.filter(([n]) => n === "federate_post")).toHaveLength(2);
});

test("the sweeper runs at start and then every 30 seconds, once per process", async () => {
  vi.useFakeTimers();
  const { startScheduleSweeper } = await load();
  vi.mocked(postsRepo.claimDue).mockResolvedValue([]);
  vi.spyOn(console, "log").mockImplementation(() => {});
  startScheduleSweeper();
  startScheduleSweeper();
  expect(postsRepo.claimDue).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(postsRepo.claimDue).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(90_000);
  expect(postsRepo.claimDue).toHaveBeenCalledTimes(5);
});
