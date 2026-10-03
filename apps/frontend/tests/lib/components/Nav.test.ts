import { goto, refreshAll } from "$app/navigation";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import Nav from "#lib/components/Nav.svelte";
import { notifications } from "#lib/notifications.svelte.js";
import { theme } from "#lib/theme.svelte.js";
import type { Notification, User } from "#lib/types.js";
import { fakeFetch } from "../../fakeFetch";

const signOut = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
vi.mock("#lib/auth-client.js", () => ({ authClient: { signOut } }));

afterEach(() => {
  notifications.count = 0;
});

const me = {
  id: "u1",
  username: "ada",
  displayName: "Ada",
  avatarUrl: null,
  isAdmin: false,
  isModerator: false,
  isPrivate: false,
} as User;

function notif(o: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    type: "like",
    actor: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
    postId: "p1",
    postTitle: "Hello world",
    commentSnippet: null,
    read: false,
    createdAt: new Date().toISOString(),
    ...o,
  };
}

let api: ReturnType<typeof fakeFetch>;
function setup(
  user: User | null = me,
  props: { minimal?: boolean; appName?: string } = {},
  items: Notification[] = [],
) {
  api = fakeFetch({
    "GET /api/notifications": { items, nextCursor: null },
    "POST /api/notifications/read": { ok: true },
    "*": { ok: true },
  });
  vi.stubGlobal("fetch", api.fetch);
  return render(Nav, { props: { user, ...props } });
}

async function openMenu(label: string) {
  await fireEvent.keyDown(screen.getByRole("button", { name: label }), { key: "Enter" });
  await screen.findByRole("menu");
}
const items = () => screen.getAllByRole("menuitem").map((i) => i.textContent?.replace(/\s+/g, " ").trim());

test("a guest gets sign-in and get-started, plus search", () => {
  setup(null, { appName: "Starlog" });
  expect(screen.getByText("Starlog")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/register");
  expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
  expect(screen.queryByRole("button", { name: "Notifications" })).toBe(null);
});

test("the minimal nav is just the logo and the theme toggle", () => {
  setup(me, { minimal: true });
  expect(screen.queryByRole("link", { name: "Search" })).toBe(null);
  expect(screen.queryByRole("button", { name: "Account menu" })).toBe(null);
  expect(screen.getByRole("button", { name: "Toggle dark mode" })).toBeInTheDocument();
});

test("the theme button toggles the theme", async () => {
  const toggle = vi.spyOn(theme, "toggle").mockImplementation(() => {});
  setup(null);
  await fireEvent.click(screen.getByRole("button", { name: "Toggle dark mode" }));
  expect(toggle).toHaveBeenCalled();
});

test("the bell shows the unread count, capped at 99+", () => {
  notifications.count = 150;
  setup();
  expect(screen.getByRole("button", { name: "Notifications" })).toHaveTextContent("99+");
});

test("opening the bell lists notifications, marks them read and clears the badge", async () => {
  notifications.count = 2;
  setup(me, {}, [notif(), notif({ id: "n2", type: "comment", postTitle: null, commentSnippet: "Nice!", read: true })]);
  await openMenu("Notifications");
  await screen.findByText("Hello world");
  expect(screen.getByText("Nice!")).toBeInTheDocument();
  await waitFor(() => expect(api.calls.some((c) => c.path === "/api/notifications/read")).toBe(true));
  expect(notifications.count).toBe(0);
  await fireEvent.click(screen.getByRole("menuitem", { name: /Hello world/ }));
  expect(goto).toHaveBeenCalledWith(expect.stringMatching(/^\/(posts|@)/));
});

test("an empty bell says so and links to all notifications", async () => {
  setup();
  await openMenu("Notifications");
  await screen.findByText("No notifications yet.");
  expect(api.calls.some((c) => c.path === "/api/notifications/read")).toBe(false);
  await fireEvent.click(screen.getByRole("menuitem", { name: "See all" }));
  expect(goto).toHaveBeenCalledWith("/notifications");
});

test("opening the bell marks fresh unread notifications read", async () => {
  notifications.count = 0;
  setup(me, {}, [notif()]);
  await openMenu("Notifications");
  await screen.findByText("Hello world");
  await waitFor(() => expect(api.calls.some((c) => c.path === "/api/notifications/read")).toBe(true), { timeout: 500 });
});

test("the account menu adapts to the account", async () => {
  const { unmount } = setup();
  await openMenu("Account menu");
  expect(items()).toEqual(["Profile", "Write an article", "Your posts", "Lists", "Stats", "Settings", "Sign out"]);
  unmount();
  setup({ ...me, isPrivate: true, isModerator: true });
  await openMenu("Account menu");
  expect(items()).toEqual([
    "Profile",
    "Follow requests",
    "Write an article",
    "Your posts",
    "Lists",
    "Stats",
    "Moderation",
    "Settings",
    "Sign out",
  ]);
});

test("menu items navigate; an admin's entry says Admin", async () => {
  setup({ ...me, isAdmin: true });
  await openMenu("Account menu");
  await fireEvent.click(screen.getByRole("menuitem", { name: "Admin" }));
  expect(goto).toHaveBeenCalledWith("/admin");
  await openMenu("Account menu");
  await fireEvent.click(screen.getByRole("menuitem", { name: "Profile" }));
  expect(goto).toHaveBeenCalledWith("/@ada");
});

test("signing out reloads the session and goes home", async () => {
  signOut.mockResolvedValue({});
  setup();
  await openMenu("Account menu");
  await fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
  expect(signOut).toHaveBeenCalled();
  expect(refreshAll).toHaveBeenCalled();
});
