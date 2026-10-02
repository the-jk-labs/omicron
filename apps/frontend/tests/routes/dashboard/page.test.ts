import { timeZone } from "$lib/timezone";
import type { DashboardSummary, PostStat } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, within } from "@testing-library/svelte";
import type { Writable } from "svelte/store";
import { afterEach, expect, test, vi } from "vitest";
import DashboardPage from "../../../src/routes/dashboard/+page.svelte";

vi.mock(import("$lib/timezone"), async (importOriginal) => {
  const { writable } = await import("svelte/store");
  return { ...(await importOriginal()), timeZone: writable("UTC") };
});
vi.mock(import("$lib/locale"), async (importOriginal) => {
  const { readable } = await import("svelte/store");
  return { ...(await importOriginal()), locale: readable("en-US") };
});

afterEach(() => (timeZone as Writable<string>).set("UTC"));

function stat(o: Partial<PostStat> = {}): PostStat {
  return {
    postId: "p1",
    title: "First",
    slug: "first",
    createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    views: 0,
    likes: 0,
    comments: 0,
    ...o,
  };
}

function summary(o: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    onInstanceViews: true,
    totals: { views: 1200, likes: 30, comments: 10, followers: 4 },
    series: [
      { day: "2026-01-04", views: 0 },
      { day: "2026-01-05", views: 8 },
      { day: "2026-01-06", views: 2 },
    ],
    posts: [stat()],
    ...o,
  };
}

const setup = (s: DashboardSummary) =>
  render(DashboardPage, { props: { data: { summary: s, username: "ada" } as never } });
const card = (label: string) => screen.getAllByText(label, { selector: "span" })[0].closest("div")!.parentElement!;

test("an author with no posts is told stats appear after publishing", () => {
  setup(summary({ posts: [] }));
  expect(screen.getByText("Publish an article and its stats will show up here.")).toBeInTheDocument();
});

test("summary cards show compact totals, engagement as likes + comments", () => {
  setup(summary());
  expect(within(card("Views")).getByText("1.2K")).toBeInTheDocument();
  expect(within(card("Engagement")).getByText("40")).toBeInTheDocument();
  expect(within(card("Followers")).getByText("4")).toBeInTheDocument();
});

test("with view counting off there's no Views card, chart or column, and a note says why", () => {
  setup(summary({ onInstanceViews: false }));
  expect(screen.queryByText("Views", { selector: "span" })).toBe(null);
  expect(screen.getByText(/On-instance view counting is turned off/)).toBeInTheDocument();
  expect(screen.queryByText("Views over time")).toBe(null);
  expect(screen.queryByRole("columnheader", { name: "Views" })).toBe(null);
});

test("the views chart totals the range and labels each day on hover", async () => {
  setup(summary());
  expect(screen.getByText("10 in the last 3 days")).toBeInTheDocument();
  const day = screen.getByRole("button", { name: "Jan 5: 8 views" });
  await fireEvent.mouseEnter(day);
  expect(screen.getByText("Jan 5 · 8")).toBeInTheDocument();
  await fireEvent.mouseLeave(day);
  expect(screen.queryByText("Jan 5 · 8")).toBe(null);
});

test("an all-quiet range shows no chart", () => {
  setup(summary({ series: [{ day: "2026-01-05", views: 0 }] }));
  expect(screen.queryByText("Views over time")).toBe(null);
});

test("day labels don't shift a day for readers west of UTC", () => {
  (timeZone as Writable<string>).set("America/New_York");
  setup(summary());
  expect(screen.getByRole("button", { name: "Jan 5: 8 views" })).toBeInTheDocument();
});

test("the reach breakdown shares each signal and hides empty ones", () => {
  setup(summary({ totals: { views: 60, likes: 40, comments: 0, followers: 0 } }));
  expect(screen.getByText("60%")).toBeInTheDocument();
  expect(screen.getByText("40%")).toBeInTheDocument();
  expect(screen.queryByText("Comments", { selector: "span:not(.text-xs)" })).toBe(null);
});

test("no engagement at all says so", () => {
  setup(summary({ onInstanceViews: false, totals: { views: 0, likes: 0, comments: 0, followers: 0 } }));
  expect(screen.getByText("No engagement yet.")).toBeInTheDocument();
});

test("posts are ranked by reach, the leader is marked Top, and rows link to the article", () => {
  setup(
    summary({
      posts: [
        stat({ postId: "a", title: "Quiet", slug: "quiet", views: 1 }),
        stat({ postId: "b", title: null, slug: null, views: 50, likes: 5 }),
      ],
    }),
  );
  const rows = screen.getAllByRole("row").slice(1);
  expect(within(rows[0]).getByText("Top")).toBeInTheDocument();
  // An untitled post has no slug, so it links by its short id.
  expect(within(rows[0]).getByRole("link", { name: "Untitled" }).getAttribute("href")).toMatch(/^\/@ada\/[^/]+$/);
  expect(within(rows[1]).getByRole("link", { name: "Quiet" })).toHaveAttribute("href", "/@ada/quiet");
});

test("per-day engagement is likes + comments over days live, a dash when none", () => {
  setup(
    summary({
      posts: [stat({ postId: "a", title: "Busy", likes: 20, comments: 5 }), stat({ postId: "b", title: "Silent" })],
    }),
  );
  const rows = screen.getAllByRole("row").slice(1);
  expect(within(rows[0]).getByText("2.5/d")).toBeInTheDocument();
  expect(within(rows[1]).getByText("-")).toBeInTheDocument();
});

test("nobody is crowned Top when nothing has any reach", () => {
  setup(summary({ onInstanceViews: false, posts: [stat()] }));
  expect(screen.queryByText("Top")).toBe(null);
});
