// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test, vi } from "vitest";
import { mount } from "./harness.ts";

vi.mock(import("@/services/notifications.ts"));

import { encodeCursor } from "@/lib/pagination.ts";
import { notificationRoutes } from "@/routes/notifications.ts";
import * as notifications from "@/services/notifications.ts";

const api = mount("/api/notifications", notificationRoutes);

test.for([
  ["GET", "/api/notifications"],
  ["GET", "/api/notifications/unread-count"],
  ["POST", "/api/notifications/read"],
  ["POST", "/api/notifications/n1/read"],
])("%s %s requires a signed-in user", async ([method, path]) => {
  api.signOut();
  expect((await api.request(path, { method })).status).toBe(401);
});

describe("signed in", () => {
  test("lists with a decoded cursor", async () => {
    api.signIn();
    vi.mocked(notifications.list).mockResolvedValue({ items: [], nextCursor: null });
    const cursor = encodeCursor({ createdAt: "2026-01-01T00:00:00.000Z", id: "00000000-0000-4000-8000-000000000009" });
    expect(await (await api.request(`/api/notifications?cursor=${cursor}`)).json()).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(notifications.list).toHaveBeenCalledWith("me", {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000009",
    });
  });

  test("an undecodable cursor starts from the top", async () => {
    api.signIn();
    vi.mocked(notifications.list).mockResolvedValue({ items: [], nextCursor: null });
    await api.request("/api/notifications?cursor=@@@");
    expect(notifications.list).toHaveBeenCalledWith("me", null);
  });

  test("unread count", async () => {
    api.signIn();
    vi.mocked(notifications.unreadCount).mockResolvedValue(7);
    expect(await (await api.request("/api/notifications/unread-count")).json()).toEqual({ count: 7 });
  });

  test("mark all / one read", async () => {
    api.signIn();
    vi.mocked(notifications.markAllRead).mockResolvedValue();
    vi.mocked(notifications.markRead).mockResolvedValue();
    expect(await (await api.request("/api/notifications/read", { method: "POST" })).json()).toEqual({ ok: true });
    expect(await (await api.request("/api/notifications/n1/read", { method: "POST" })).json()).toEqual({ ok: true });
    expect(notifications.markRead).toHaveBeenCalledWith("me", "n1");
  });
});
