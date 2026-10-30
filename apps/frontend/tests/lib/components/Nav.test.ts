import { goto, refreshAll } from "$app/navigation";
import { page } from "$app/state";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import Nav from "#lib/components/Nav.svelte";
import { notifications } from "#lib/notifications.svelte.js";
import { reading } from "#lib/prefs.svelte.js";
import { theme } from "#lib/theme.svelte.js";
import type { Notification, User } from "#lib/types.js";
import { apiError, fakeFetch, type Routes } from "../../fakeFetch";
import { post } from "../../fixtures";

const signOut = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
vi.mock("#lib/auth-client.js", () => ({ authClient: { signOut } }));

afterEach(() => {
  notifications.count = 0;
  page.url = new URL("http://localhost/");
  page.data = { user: null };
  reading.defaultFeed = null;
  reading.feedLangs = [];
  reading.feedLangMode = "show";
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
    actor: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null, remote: false },
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
  routes: Routes = {},
) {
  api = fakeFetch({
    "GET /api/notifications": { items, nextCursor: null },
    "POST /api/notifications/read": { ok: true },
    "*": { ok: true },
    ...routes,
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
  expect(screen.queryByRole("button", { name: "Random post" })).toBe(null);
  expect(screen.getByRole("button", { name: "Toggle dark mode" })).toBeInTheDocument();
});

test.for(["local", "global"])("the dice open a random %s post with live language filters", async (scope) => {
  page.url = new URL(`http://localhost/?tab=${scope}`);
  reading.feedLangs = ["en", "az"];
  setup(me, {}, [], { "GET /api/posts/random": { post: post() } });
  await fireEvent.click(screen.getByRole("button", { name: "Random post" }));
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/@ada/hello-world"));
  expect(api.calls.some((c) => c.path === `/api/posts/random?scope=${scope}&langMode=show&langs=en%2Caz`)).toBe(true);

  reading.feedLangs = ["tr"];
  reading.feedLangMode = "hide";
  await fireEvent.click(screen.getByRole("button", { name: "Random post" }));
  await waitFor(() =>
    expect(api.calls.some((c) => c.path === `/api/posts/random?scope=${scope}&langMode=hide&langs=tr`)).toBe(true),
  );
});

test("For you rolls without a language filter and keeps its scope on an article", async () => {
  reading.feedLangs = ["en"];
  setup(me, {}, [], { "GET /api/posts/random": { post: post() } });
  const button = screen.getByRole("button", { name: "Random post" });
  await fireEvent.click(button);
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/@ada/hello-world"));
  page.url = new URL("http://localhost/@ada/hello-world");
  await fireEvent.click(button);
  await waitFor(() => expect(api.calls.filter((c) => c.path === "/api/posts/random?scope=for-you")).toHaveLength(2));
});

test("switching tabs changes the next roll, and article navigation preserves that scope", async () => {
  setup(me, {}, [], { "GET /api/posts/random": { post: post() } });
  page.url = new URL("http://localhost/?tab=local");
  const button = screen.getByRole("button", { name: "Random post" });
  await fireEvent.click(button);
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/@ada/hello-world"));
  page.url = new URL("http://localhost/@ada/hello-world");
  await fireEvent.click(button);
  await waitFor(() => expect(api.calls.filter((c) => c.path === "/api/posts/random?scope=local")).toHaveLength(2));
});

test("a remote random post opens its on-instance permalink", async () => {
  setup(me, {}, [], {
    "GET /api/posts/random": {
      post: post({
        remote: true,
        slug: null,
        author: {
          id: "remote",
          username: "writer@remote.example",
          displayName: "Writer",
          avatarUrl: null,
          remote: true,
        },
      }),
    },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Random post" }));
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/@writer@remote.example/9e962281"));
});

test("away from Home the dice fall back to the saved default feed", async () => {
  page.url = new URL("http://localhost/settings");
  reading.defaultFeed = "local";
  setup(me, {}, [], { "GET /api/posts/random": { post: post() } });
  await fireEvent.click(screen.getByRole("button", { name: "Random post" }));
  await waitFor(() => expect(api.calls.some((c) => c.path === "/api/posts/random?scope=local")).toBe(true));
});

test("the dice use the server-selected home tab when the URL has no override", async () => {
  page.data = { user: null, tab: "global" } as typeof page.data;
  reading.defaultFeed = "local";
  setup(me, {}, [], { "GET /api/posts/random": { post: null } });
  await fireEvent.click(screen.getByRole("button", { name: "Random post" }));
  await screen.findByRole("status");
  expect(api.calls.some((c) => c.path === "/api/posts/random?scope=global")).toBe(true);
});

test("no matches and server failures leave the reader in place and allow retrying", async () => {
  let attempts = 0;
  setup(me, {}, [], {
    "GET /api/posts/random": () =>
      ++attempts === 1 ? Response.json({ post: null }) : apiError(503, "Please try again."),
  });
  const button = screen.getByRole("button", { name: "Random post" });
  await fireEvent.click(button);
  expect(await screen.findByRole("status")).toHaveTextContent("No posts match your current feed filters.");
  expect(button).toBeEnabled();
  await fireEvent.click(button);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Please try again."));
  expect(button).toBeEnabled();
  expect(goto).not.toHaveBeenCalled();
});

test("the dice disable while loading to prevent duplicate rolls", async () => {
  let resolve!: (value: Response) => void;
  setup(me, {}, [], {
    "GET /api/posts/random": () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  });
  const button = screen.getByRole("button", { name: "Random post" });
  await fireEvent.click(button);
  expect(button).toBeDisabled();
  await fireEvent.click(button);
  expect(api.calls.filter((c) => c.path.startsWith("/api/posts/random"))).toHaveLength(1);
  resolve(Response.json({ post: post() }));
  await waitFor(() => expect(button).toBeEnabled());
});

test("the signed-in header has no duplicate Write action", async () => {
  setup();
  expect(screen.queryByRole("link", { name: "Write" })).toBe(null);
  await openMenu("Account menu");
  expect(screen.getByRole("menuitem", { name: "Write an article" })).toBeInTheDocument();
});

test("the theme button toggles the theme", async () => {
  const toggle = vi.spyOn(theme, "toggle").mockImplementation(() => {});
  setup(null);
  await fireEvent.click(screen.getByRole("button", { name: "Toggle dark mode" }));
  expect(toggle).toHaveBeenCalled();
});

// The server can't know the theme, so the toggle must not depend on it: CSS picks
// the icon from the `dark` class set before first paint.
function toggleMarkup(current: "light" | "dark") {
  theme.current = current;
  const { unmount } = setup(null);
  const html = screen.getByRole("button", { name: "Toggle dark mode" }).innerHTML;
  unmount();
  return html;
}

test("the theme button renders the same in either theme, so its icon never flips", () => {
  const light = toggleMarkup("light");
  expect(toggleMarkup("dark")).toBe(light);
  expect(document.createRange().createContextualFragment(light).querySelectorAll("svg")).toHaveLength(2);
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

// The nav is on protected pages too (settings, compose), where refreshing in place would hit the guard.
test("signing out goes straight home, never through the sign-in page", async () => {
  signOut.mockResolvedValue({});
  // As in SvelteKit: refreshing a protected page while signed out runs its guard,
  // which redirects to the sign-in page.
  vi.mocked(refreshAll).mockImplementation(async () => {
    await goto("/login");
  });
  setup();
  await openMenu("Account menu");
  await fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/", { refreshAll: true }));
  expect(signOut).toHaveBeenCalled();
  expect(goto).not.toHaveBeenCalledWith("/login");
});
