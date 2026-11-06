import { goto } from "$app/navigation";
import { page } from "$app/state";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import SearchBar from "#lib/components/SearchBar.svelte";

afterEach(() => {
  page.url = new URL("http://localhost/");
});

const field = () => screen.getByRole<HTMLInputElement>("searchbox", { name: "Search articles and people" });

async function typeAndSubmit(value: string) {
  field().focus();
  await fireEvent.input(field(), { target: { value } });
  await fireEvent.submit(field().form!);
}

test("submits the trimmed query to the search page", async () => {
  render(SearchBar);
  await typeAndSubmit("  deno & rust ");
  expect(goto).toHaveBeenCalledWith("/search?q=deno%20%26%20rust");
});

test("an empty submit does nothing, except clear an existing search", async () => {
  const first = render(SearchBar);
  await typeAndSubmit("   ");
  expect(goto).not.toHaveBeenCalled();
  first.unmount();

  page.url = new URL("http://localhost/search?q=old");
  render(SearchBar);
  await typeAndSubmit("");
  expect(goto).toHaveBeenCalledWith("/search");
});

test("on the search page it starts from the current query", () => {
  page.url = new URL("http://localhost/search?q=perseid");
  render(SearchBar);
  expect(field()).toHaveValue("perseid");
});

test("an unfocused box forgets a stale query once the reader has left the search page", async () => {
  render(SearchBar);
  field().focus();
  await fireEvent.input(field(), { target: { value: "draft" } });
  expect(field()).toHaveValue("draft");
  field().blur();
  await fireEvent.input(field(), { target: { value: "draft2" } });
  expect(field()).toHaveValue("");
});

test("Ctrl/Cmd+K focuses the box on a wide screen", async () => {
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
  render(SearchBar);
  await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  expect(field()).toHaveFocus();
});

// WCAG 2.1.4: speech input can fire a lone character, and nothing could turn this one off.
test("a lone '/' does nothing", async () => {
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
  render(SearchBar);
  await fireEvent.keyDown(window, { key: "/" });
  expect(field()).not.toHaveFocus();
  expect(goto).not.toHaveBeenCalled();
});

test("on a phone the shortcut opens the search page instead", async () => {
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(375);
  render(SearchBar);
  await fireEvent.keyDown(window, { key: "K", metaKey: true });
  expect(goto).toHaveBeenCalledExactlyOnceWith("/search");
});
