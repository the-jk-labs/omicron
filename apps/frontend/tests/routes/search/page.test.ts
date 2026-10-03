import { goto } from "$app/navigation";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import SearchPage from "../../../src/routes/search/+page.svelte";
import { post } from "../../fixtures";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type Results = { posts: unknown[]; people: unknown[]; tags: unknown[] };
const none: Results = { posts: [], people: [], tags: [] };
const person = { id: "u1", username: "ada", displayName: "Ada", avatarUrl: null };
const tag = (name: string, postCount: number) => ({ slug: name, name, postCount });

function setup(query: string, results: Partial<Results> = {}, filters: { tag?: string; author?: string } = {}) {
  return render(SearchPage, { props: { data: { query, ...filters, results: { ...none, ...results } } as never } });
}

const selectedTab = () =>
  screen
    .getAllByRole("tab")
    .find((t) => t.getAttribute("aria-selected") === "true")
    ?.textContent?.trim();

test("with no query it shows the prompt and no results", () => {
  setup("");
  expect(screen.getByText("Search articles and people across the fediverse.")).toBeInTheDocument();
  expect(screen.queryByRole("tab")).toBe(null);
});

test.for([
  [{ posts: [post()], tags: [tag("deno", 1)], people: [person] }, /^Articles/],
  [{ tags: [tag("deno", 1)], people: [person] }, /^Tags/],
  [{ people: [person] }, /^People/],
  [{}, /^Articles/],
] as const)("opens the first tab with matches (%#)", ([results, expected]) => {
  setup("de", results as Partial<Results>);
  expect(selectedTab()).toMatch(expected);
});

test("tags link to their pages with article counts", () => {
  setup("de", { tags: [tag("deno", 1), tag("design", 7)] });
  expect(screen.getByRole("link", { name: /deno/ })).toHaveAttribute("href", "/tags/deno");
  expect(screen.getByText(/1\s+article$/)).toBeInTheDocument();
  expect(screen.getByText(/7\s+articles/)).toBeInTheDocument();
});

test("people link to their profiles", () => {
  setup("ad", { people: [person] });
  expect(screen.getByRole("link", { name: /Ada/ })).toHaveAttribute("href", "/@ada");
  expect(screen.getByText("@ada")).toBeInTheDocument();
});

test("empty tabs say nothing matched the query", () => {
  setup("zzz");
  expect(screen.getByText(/No articles match “zzz”/)).toBeInTheDocument();
});

test("typing re-runs the search after a pause, in place", async () => {
  setup("de");
  const box = screen.getByRole("searchbox", { name: "Search articles and people" });
  await fireEvent.input(box, { target: { value: "den" } });
  await fireEvent.input(box, { target: { value: " deno " } });
  vi.advanceTimersByTime(249);
  expect(goto).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(goto).toHaveBeenCalledTimes(1);
  expect(goto).toHaveBeenCalledWith("/search?q=deno", { reset: false, replace: true });
});

test("the same state as shown doesn't navigate", async () => {
  setup("deno");
  await fireEvent.input(screen.getByRole("searchbox", { name: "Search articles and people" }), {
    target: { value: " deno " },
  });
  vi.advanceTimersByTime(500);
  expect(goto).not.toHaveBeenCalled();
});

test("submitting searches immediately", async () => {
  setup("de");
  const box = screen.getByRole("searchbox", { name: "Search articles and people" });
  await fireEvent.input(box, { target: { value: "rust" } });
  await fireEvent.submit(box.closest("form")!);
  expect(goto).toHaveBeenCalledWith("/search?q=rust", expect.anything());
});

test("tag and author filters narrow the articles and are named in the header", async () => {
  setup("de", {}, { tag: "deno", author: "ada" });
  expect(screen.getByText(/Filtered/).textContent?.replace(/\s+/g, " ")).toContain("by tag #deno · by author ada");
  await fireEvent.input(screen.getByRole("searchbox", { name: "Filter articles by tag" }), {
    target: { value: "rust" },
  });
  vi.advanceTimersByTime(250);
  expect(goto).toHaveBeenLastCalledWith("/search?q=de&tag=rust&author=ada", expect.anything());
});

test("filters can be removed one at a time or all at once", async () => {
  setup("de", {}, { tag: "deno", author: "ada" });
  await fireEvent.click(screen.getByRole("button", { name: "Remove author filter" }));
  vi.advanceTimersByTime(250);
  expect(goto).toHaveBeenLastCalledWith("/search?q=de&tag=deno", expect.anything());
  await fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
  vi.advanceTimersByTime(250);
  expect(goto).toHaveBeenLastCalledWith("/search?q=de", expect.anything());
});

test("an empty filtered result offers to clear the filters", async () => {
  setup("de", {}, { tag: "deno" });
  await fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  vi.advanceTimersByTime(250);
  expect(goto).toHaveBeenLastCalledWith("/search?q=de", expect.anything());
});

test("a new query arriving by navigation refills the field", async () => {
  const { rerender } = setup("de");
  await rerender({ data: { query: "svelte", results: none } as never });
  expect(screen.getByRole("searchbox", { name: "Search articles and people" })).toHaveValue("svelte");
  vi.advanceTimersByTime(500);
  expect(goto).not.toHaveBeenCalled();
});

test("clearing the query goes back to the bare search page", async () => {
  setup("de");
  await fireEvent.input(screen.getByRole("searchbox", { name: "Search articles and people" }), {
    target: { value: "" },
  });
  vi.advanceTimersByTime(250);
  expect(goto).toHaveBeenCalledWith("/search", expect.anything());
});

test("the filtered empty state keeps its spaces", () => {
  setup("de", {}, { tag: "deno", author: "ada" });
  expect(screen.getByText(/No articles match/).textContent).toContain("“de” with tag #deno by ada.");
});
