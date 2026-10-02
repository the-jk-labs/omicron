import RssButton from "$lib/components/RssButton.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test("copies the feed URL, confirms, then resets", async () => {
  const writeText = vi.fn<(s: string) => Promise<void>>(async () => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(RssButton, { props: { path: "/@ada/feed.xml", label: "Copy RSS feed link" } });
  await fireEvent.click(screen.getByRole("button", { name: "Copy RSS feed link" }));
  expect(writeText).toHaveBeenCalledWith("http://localhost/@ada/feed.xml");
  expect(screen.getByRole("button", { name: "RSS feed link copied" })).toHaveTextContent("Copied");
  await vi.advanceTimersByTimeAsync(1500);
  expect(screen.getByRole("button", { name: "Copy RSS feed link" })).toHaveTextContent("RSS");
});

test("a refused clipboard changes nothing", async () => {
  vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
  render(RssButton, { props: { path: "/x", label: "Copy" } });
  await fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  expect(screen.getByRole("button", { name: "Copy" })).toHaveTextContent("RSS");
});
