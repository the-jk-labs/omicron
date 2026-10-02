// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/notifications.ts"));

import type { NotificationRow } from "@/db/repositories/notifications.ts";
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import { DEFAULT_PAGE_SIZE, decodeCursor } from "@/lib/pagination.ts";
import { list, markAllRead, markRead, notify, unnotify, unreadCount } from "@/services/notifications.ts";

describe("notify", () => {
  test("creates a row with every optional field defaulted to null", async () => {
    await notify({ recipientId: "r", type: "post_published" });
    expect(notificationsRepo.create).toHaveBeenCalledWith({
      recipientId: "r",
      type: "post_published",
      actorId: null,
      remoteActorId: null,
      postId: null,
      commentId: null,
    });
  });

  test("passes a remote actor through", async () => {
    await notify({ recipientId: "r", type: "follow", remoteActorId: "actor" });
    expect(notificationsRepo.create).toHaveBeenCalledWith(expect.objectContaining({ remoteActorId: "actor" }));
  });

  test("skips self-notifications", async () => {
    await notify({ recipientId: "same", type: "like", actorId: "same", postId: "p" });
    expect(notificationsRepo.create).not.toHaveBeenCalled();
  });

  test("swallows and logs a repository failure", async () => {
    vi.mocked(notificationsRepo.create).mockRejectedValueOnce(new Error("boom"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notify({ recipientId: "r", type: "like", actorId: "a" })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});

describe("unnotify", () => {
  test("removes the matching row", async () => {
    await unnotify({ recipientId: "r", type: "follow", actorId: "a" });
    expect(notificationsRepo.removeMatching).toHaveBeenCalledWith({
      recipientId: "r",
      type: "follow",
      actorId: "a",
      remoteActorId: null,
      postId: null,
      commentId: null,
    });
  });

  test("skips self-actions", async () => {
    await unnotify({ recipientId: "same", type: "like", actorId: "same" });
    expect(notificationsRepo.removeMatching).not.toHaveBeenCalled();
  });

  test("swallows and logs a repository failure", async () => {
    vi.mocked(notificationsRepo.removeMatching).mockRejectedValueOnce(new Error("boom"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(unnotify({ recipientId: "r", type: "like", actorId: "a" })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});

function row(i: number, overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    notification: {
      id: `n${i}`,
      recipientId: "r",
      type: "like",
      actorId: "a",
      remoteActorId: null,
      postId: "p",
      commentId: null,
      readAt: null,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 60 - i)),
    },
    actor: { id: "a", username: "ann", displayName: "Ann", avatarUrl: null },
    remoteActor: null,
    postTitle: "Title",
    commentContent: null,
    ...overrides,
  };
}

describe("list", () => {
  test("returns a page without a cursor when there are no more rows", async () => {
    vi.mocked(notificationsRepo.listFor).mockResolvedValue([row(1), row(2)]);
    const page = await list("r", null);
    expect(page.nextCursor).toBe(null);
    expect(page.items.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(notificationsRepo.listFor).toHaveBeenCalledWith("r", null, DEFAULT_PAGE_SIZE);
  });

  test("trims the probe row and emits a cursor for the last kept row", async () => {
    const rows = Array.from({ length: DEFAULT_PAGE_SIZE + 1 }, (_, i) => row(i));
    vi.mocked(notificationsRepo.listFor).mockResolvedValue(rows);
    const page = await list("r", null);
    expect(page.items).toHaveLength(DEFAULT_PAGE_SIZE);
    const last = rows[DEFAULT_PAGE_SIZE - 1].notification;
    expect(decodeCursor(page.nextCursor)).toEqual({ createdAt: last.createdAt.toISOString(), id: last.id });
  });

  test("serializes local and remote actors and read state", async () => {
    vi.mocked(notificationsRepo.listFor).mockResolvedValue([
      row(1, {
        actor: null,
        remoteActor: { id: "ra", handle: "bob@x.example", displayName: "<p>Bob &amp; co</p>", avatarUrl: null },
      }),
      row(2, { notification: { ...row(2).notification, readAt: new Date() } }),
    ]);
    const { items } = await list("r", null);
    expect(items[0].actor).toEqual({
      id: "ra",
      username: "bob@x.example",
      displayName: "Bob & co",
      avatarUrl: null,
      remote: true,
    });
    expect(items[0].read).toBe(false);
    expect(items[1].actor?.remote).toBe(false);
    expect(items[1].read).toBe(true);
  });

  test("an empty inbox is an empty page", async () => {
    vi.mocked(notificationsRepo.listFor).mockResolvedValue([]);
    expect(await list("r", null)).toEqual({ items: [], nextCursor: null });
  });
});

test("unreadCount / markAllRead / markRead delegate to the repository", async () => {
  vi.mocked(notificationsRepo.unreadCount).mockResolvedValue(4);
  expect(await unreadCount("r")).toBe(4);
  await markAllRead("r");
  expect(notificationsRepo.markAllRead).toHaveBeenCalledWith("r");
  await markRead("r", "n1");
  expect(notificationsRepo.markRead).toHaveBeenCalledWith("r", "n1");
});
