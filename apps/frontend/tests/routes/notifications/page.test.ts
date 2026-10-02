import { notifications } from "$lib/notifications.svelte";
import type { Notification } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import NotificationsPage from "../../../src/routes/notifications/+page.svelte";
import { fakeFetch } from "../../fakeFetch";

afterEach(() => {
  notifications.count = 0;
});

function notif(o: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    type: "follow",
    actor: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
    postId: null,
    postTitle: null,
    commentSnippet: null,
    read: false,
    createdAt: new Date().toISOString(),
    ...o,
  };
}

let api: ReturnType<typeof fakeFetch>;
function setup(items: Notification[], nextCursor: string | null = null, routes: Parameters<typeof fakeFetch>[0] = {}) {
  api = fakeFetch({ "POST /api/notifications/read": { ok: true }, ...routes });
  vi.stubGlobal("fetch", api.fetch);
  return render(NotificationsPage, { props: { data: { page: { items, nextCursor } } as never } });
}

const markedRead = () => api.calls.some((c) => c.path === "/api/notifications/read");

test("no notifications says so", () => {
  setup([]);
  expect(screen.getByText("You don't have any notifications yet.")).toBeInTheDocument();
});

test("each row names who did what and links to it", () => {
  setup([
    notif(),
    notif({ id: "n2", type: "comment", postId: "p1", postTitle: null, commentSnippet: "Great post", read: true }),
  ]);
  const [follow, comment] = screen.getAllByRole("link", { name: /Bob/ });
  expect(follow).toHaveAttribute("href", "/@bob");
  expect(comment.getAttribute("href")).toMatch(/^\/posts\/p1/);
  expect(screen.getByText("Great post")).toBeInTheDocument();
});

test("opening the page marks everything read and clears the badge", async () => {
  notifications.count = 3;
  setup([notif()]);
  await waitFor(() => expect(markedRead()).toBe(true));
  expect(notifications.count).toBe(0);
});

test("Load more appends older notifications", async () => {
  setup([notif()], "c1", {
    "GET /api/notifications?cursor=c1": {
      items: [notif({ id: "n9", actor: { id: "u3", username: "cy", displayName: "Cy", avatarUrl: null } })],
      nextCursor: null,
    },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByText("Cy");
  expect(screen.queryByRole("button", { name: "Load more" })).toBe(null);
});

test("unread notifications on screen are marked read even before the badge count arrives", async () => {
  notifications.count = 0;
  setup([notif({ read: false })]);
  await waitFor(() => expect(markedRead()).toBe(true), { timeout: 500 });
});
