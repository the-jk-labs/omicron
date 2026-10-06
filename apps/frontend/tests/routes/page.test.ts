// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { reading } from "#lib/prefs.svelte.js";
import type { Page, Post } from "#lib/types.js";
import HomePage from "../../src/routes/+page.svelte";
import { apiError, fakeFetch } from "../fakeFetch";
import { post } from "../fixtures";

afterEach(() => {
  reading.defaultFeed = null;
  reading.feedLangs = [];
  reading.feedLangMode = "show";
});

const page = (items: Post[], nextCursor: string | null = null): Page<Post> => ({ items, nextCursor });

let api: ReturnType<typeof fakeFetch>;
function setup(
  personalized: boolean,
  preload: Page<Post>,
  routes: Parameters<typeof fakeFetch>[0] = {},
  tab = personalized ? "for-you" : "global",
) {
  api = fakeFetch({ "*": apiError(404), ...routes });
  vi.stubGlobal("fetch", api.fetch);
  return render(HomePage, { props: { data: { personalized, page: preload, tab } as never } });
}

const tabNames = () => screen.getAllByRole("tab").map((t) => t.textContent?.trim());
const selected = () =>
  screen
    .getAllByRole("tab")
    .find((t) => t.getAttribute("aria-selected") === "true")
    ?.textContent?.trim();
async function openTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  await fireEvent.mouseDown(tab);
  await fireEvent.click(tab);
}
const feedCalls = () =>
  api.calls.map((c) => c.path).filter((p) => p.startsWith("/api/posts") || p.startsWith("/api/feed"));

test("a guest sees the hero and the preloaded Global feed", () => {
  setup(false, page([post()]));
  expect(screen.getByRole("heading", { name: "Human articles & ideas" })).toBeInTheDocument();
  expect(tabNames()).toEqual(["Global", "Local"]);
  expect(selected()).toBe("Global");
  expect(screen.getByText("Hello world")).toBeInTheDocument();
  expect(feedCalls()).toEqual([]);
});

test("a signed-in reader starts on For you, with no hero", () => {
  setup(true, page([post()]));
  expect(screen.queryByRole("heading", { name: "Human articles & ideas" })).toBe(null);
  expect(tabNames()).toEqual(["For you", "Local", "Global"]);
  expect(selected()).toBe("For you");
});

test("another tab loads once, the first time it opens", async () => {
  setup(false, page([post()]), { "GET /api/posts?scope=local": page([post({ id: "l1", title: "Local post" })]) });
  await openTab("Local");
  await screen.findByText("Local post");
  await openTab("Global");
  await openTab("Local");
  expect(feedCalls()).toEqual(["/api/posts?scope=local"]);
});

test("an empty feed says what would fill it", () => {
  setup(true, page([]));
  expect(screen.getByText("Your feed is empty. Follow some writers to fill it.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Write an article/ })).toHaveAttribute("href", "/compose");
});

test("Show more appends the next page and drops posts already shown", async () => {
  setup(false, page([post({ id: "a", title: "A" }), post({ id: "b", title: "B" })], "c1"), {
    "GET /api/posts?cursor=c1": page([post({ id: "b", title: "B" }), post({ id: "c", title: "C" })]),
  });
  await fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  await screen.findByText("C");
  expect(screen.getAllByText("B")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Show more" })).toBe(null);
});

test("the tab the server chose is open from the first render, with its preloaded posts", async () => {
  setup(true, page([post({ id: "l1", title: "Local post" })]), {}, "local");
  expect(selected()).toBe("Local");
  await screen.findByText("Local post");
  expect(feedCalls()).toEqual([]);
});

test("a saved language filter doesn't refetch the timeline the server already filtered", async () => {
  reading.feedLangs = ["de", "fr"];
  setup(true, page([post()]), { "GET /api/posts": page([]) }, "global");
  await new Promise((r) => setTimeout(r, 20));
  expect(feedCalls()).toEqual([]);
});

test("changing the language filter refetches the visible timeline", async () => {
  setup(true, page([]), { "GET /api/posts": page([]) }, "local");
  await screen.findByText("No articles on this instance yet.");
  reading.addFeedLang("az");
  await waitFor(() => expect(feedCalls().at(-1)).toBe("/api/posts?scope=local&langMode=show&langs=az"));
});

test("a guest's timelines are never language-filtered", async () => {
  reading.feedLangs = ["de"];
  setup(false, page([post()]), { "GET /api/posts": page([]) });
  await openTab("Local");
  await waitFor(() => expect(feedCalls()).toEqual(["/api/posts?scope=local"]));
});

test("a tab that fails to load doesn't claim to be empty", async () => {
  setup(false, page([post()]), { "GET /api/posts?scope=local": apiError(500, "Timeline down") });
  await openTab("Local");
  await waitFor(() => expect(feedCalls()).toContain("/api/posts?scope=local"));
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText("No articles on this instance yet.")).toBe(null);
});

test("a filter change made mid-load still applies", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  setup(true, page([]), {
    "GET /api/posts": async (req) => {
      if (!new URL(req.url).searchParams.has("langs")) await gate;
      return Response.json(page([]));
    },
  });
  await openTab("Local");
  await waitFor(() => expect(feedCalls()).toEqual(["/api/posts?scope=local"]));
  reading.addFeedLang("az");
  release();
  await screen.findByText("No articles on this instance yet.");
  await waitFor(() => expect(feedCalls().at(-1)).toBe("/api/posts?scope=local&langMode=show&langs=az"), {
    timeout: 500,
  });
});
