import type { Post, User } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";
import ProfilePage from "../../../src/routes/[handle]/+page.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";
import { post } from "../../fixtures";

const viewer = { id: "u-bob", username: "bob", displayName: "Bob", avatarUrl: null } as User;

function localUser(o: Record<string, unknown> = {}) {
  return {
    id: "u-ada",
    username: "ada",
    displayName: "Ada Lovelace",
    bio: "",
    avatarUrl: null,
    isAdmin: false,
    isModerator: false,
    isPrivate: false,
    tags: [],
    links: [],
    customSectionHtml: "",
    publicEmail: "",
    createdAt: "2026-01-01T00:00:00Z",
    ...o,
  };
}

const page = (items: Post[], nextCursor: string | null = null) => ({ items, nextCursor });

function data(o: Record<string, unknown> = {}, profile: Record<string, unknown> = {}) {
  return {
    remote: false,
    user: null,
    seo: { indexingEnabled: true },
    lists: [],
    page: page([post()]),
    recommendations: page([]),
    ...o,
    profile: {
      user: localUser(),
      counts: { followers: 3, following: 2 },
      locked: false,
      isFollowing: false,
      followState: "none",
      isMuted: false,
      isBlocked: false,
      ...profile,
    },
  };
}

function remoteData(o: Record<string, unknown> = {}) {
  return data(
    { remote: true, ...o },
    {
      user: {
        id: "r-zed",
        username: "zed@social.example",
        displayName: "Zed",
        bio: "From afar",
        avatarUrl: null,
        apId: "https://social.example/users/zed",
        host: "social.example",
      },
    },
  );
}

let api: ReturnType<typeof fakeFetch>;
function setup(d: ReturnType<typeof data>, routes: Parameters<typeof fakeFetch>[0] = {}) {
  api = fakeFetch({ "*": apiError(404), ...routes });
  vi.stubGlobal("fetch", api.fetch);
  return render(ProfilePage, { props: { data: d as never } });
}

const writeText = vi.fn<(s: string) => Promise<void>>();
beforeEach(() => {
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

const tabNames = () => screen.getAllByRole("tab").map((t) => t.textContent?.trim());
async function openTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  await fireEvent.mouseDown(tab);
  await fireEvent.click(tab);
  await waitFor(() => expect(tab).toHaveAttribute("aria-selected", "true"));
}

test("a local profile shows its name, handle, counts, posts and RSS link", () => {
  setup(data({}, { user: localUser({ bio: "Counting engines." }) }));
  expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeInTheDocument();
  expect(screen.getByText("@ada")).toBeInTheDocument();
  expect(screen.getByText("Counting engines.")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByText("Hello world")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy RSS feed link for Ada Lovelace" })).toBeInTheDocument();
  expect(tabNames()).toEqual(["Articles", "Lists", "Recommendations", "About"]);
  // Signed out: no follow or menu.
  expect(screen.queryByRole("button", { name: /^Follow/ })).toBe(null);
});

test("with indexing off there's no RSS button", () => {
  setup(data({ seo: { indexingEnabled: false } }));
  expect(screen.queryByRole("button", { name: /Copy RSS feed link/ })).toBe(null);
});

test("your own profile offers Edit profile instead of Follow", () => {
  setup(data({ user: { ...viewer, id: "u-ada" } }));
  expect(screen.getByRole("link", { name: /Edit profile/ })).toHaveAttribute("href", "/settings");
  expect(screen.queryByRole("button", { name: /^Follow/ })).toBe(null);
});

test("someone else's profile offers Follow when signed in", () => {
  setup(data({ user: viewer }));
  expect(screen.getByRole("button", { name: /^Follow/ })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Edit profile/ })).toBe(null);
});

test("a private profile you can't see shows counts but hides posts and lists", () => {
  setup(data({ user: viewer }, { locked: true }));
  expect(screen.getByText("This account is private")).toBeInTheDocument();
  expect(screen.getByText("Follow Ada Lovelace to see their articles.")).toBeInTheDocument();
  expect(screen.queryByText("Hello world")).toBe(null);
  expect(tabNames()).toEqual(["Articles", "About"]);
  // The member lists aren't offered: counts are plain text, not dialog triggers.
  expect(screen.getByText("3").closest("button")).toBe(null);
});

test("an empty profile says it has no articles", () => {
  setup(data({ page: page([]) }));
  expect(screen.getByText("No articles yet.")).toBeInTheDocument();
});

test("Show more appends the next page of posts", async () => {
  setup(data({ page: page([post()], "c1") }), {
    "GET /api/users/ada/posts?cursor=c1": page([post({ id: "p2", title: "Second post" })]),
  });
  await fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  await screen.findByText("Second post");
  expect(screen.getByText("Hello world")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Show more" })).toBe(null);
});

test("a failed Show more tells the reader", async () => {
  setup(data({ page: page([post()], "c1") }), {
    "GET /api/users/ada/posts?cursor=c1": apiError(500, "Feed down"),
  });
  await fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  await screen.findByText(/couldn't load|failed to load|try again|Feed down/i, undefined, { timeout: 500 });
});

test("the Recommendations tab pages through recommended posts", async () => {
  setup(data({ recommendations: page([post({ id: "r1", title: "Recommended one" })], "rc") }), {
    "GET /api/users/ada/recommendations?cursor=rc": page([post({ id: "r2", title: "Recommended two" })]),
  });
  await openTab("Recommendations");
  expect(screen.getByText("Recommended one")).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  await screen.findByText("Recommended two");
});

test("empty Lists and Recommendations read differently for you and for visitors", async () => {
  const { unmount } = setup(data({ user: { ...viewer, id: "u-ada" } }));
  await openTab("Lists");
  expect(screen.getByText("You haven't shared any lists yet.")).toBeInTheDocument();
  await openTab("Recommendations");
  expect(screen.getByText("You haven't recommended anything yet.")).toBeInTheDocument();
  unmount();
  setup(data());
  await openTab("Lists");
  expect(screen.getByText("No public lists yet.")).toBeInTheDocument();
  await openTab("Recommendations");
  expect(screen.getByText("Ada Lovelace hasn't recommended anything yet.")).toBeInTheDocument();
});

test("About shows the custom section, links, public email, role and full address", async () => {
  setup(
    data(
      {},
      {
        user: localUser({
          isModerator: true,
          publicEmail: "ada@example.com",
          customSectionHtml: "<p>Custom <strong>about</strong></p>",
          links: [{ platform: "github", url: "https://github.com/ada", label: "" }],
        }),
      },
    ),
  );
  await openTab("About");
  expect(screen.getByText("about").tagName).toBe("STRONG");
  expect(screen.getByRole("link", { name: "ada@example.com" })).toHaveAttribute("href", "mailto:ada@example.com");
  expect(screen.getByText("Moderator")).toBeInTheDocument();
  expect(screen.getByText(`@ada@${location.host}`)).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "GitHub" })[0]).toHaveAttribute("rel", "me noopener noreferrer");
  await fireEvent.click(screen.getByRole("button", { name: "Copy fediverse address" }));
  expect(writeText).toHaveBeenCalledWith(`@ada@${location.host}`);
});

test("a remote profile is read-only, links to its origin and uses the remote endpoints", async () => {
  setup(remoteData({ user: viewer, page: page([post()], "c1") }), {
    "GET /api/remote/users/zed%40social.example/posts?cursor=c1": page([post({ id: "p9", title: "From afar post" })]),
  });
  expect(screen.getByText("@zed")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /social\.example/ })).toHaveAttribute(
    "href",
    "https://social.example/users/zed",
  );
  expect(tabNames()).toEqual(["Articles", "Recommendations", "About"]);
  expect(screen.queryByRole("button", { name: /Copy RSS feed link/ })).toBe(null);
  expect(screen.getByRole("button", { name: /^Follow/ })).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  await screen.findByText("From afar post");
  await openTab("About");
  expect(screen.getByText("@zed@social.example")).toBeInTheDocument();
});

test("a remote profile has no actions for a signed-out visitor", () => {
  setup(remoteData());
  expect(screen.queryByRole("button", { name: /^Follow/ })).toBe(null);
});
