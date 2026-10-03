// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test } from "vitest";
import FeedLanguageFilter from "#lib/components/FeedLanguageFilter.svelte";
import { reading } from "#lib/prefs.svelte.js";

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
});
afterEach(() => {
  reading.feedLangs = [];
  reading.feedLangMode = "show";
});

const pressed = () => screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent?.trim());

test("with no languages chosen it says every language is shown", () => {
  render(FeedLanguageFilter);
  expect(screen.getByText("No filter set. Articles in every language are shown.")).toBeInTheDocument();
  expect(pressed()).toEqual(["Show only these"]);
});

test("the mode toggle switches between show-only and hide", async () => {
  render(FeedLanguageFilter);
  await fireEvent.click(screen.getByRole("button", { name: "Hide these" }));
  expect(reading.feedLangMode).toBe("hide");
  expect(pressed()).toEqual(["Hide these"]);
});

test("chosen languages are listed and can be removed", async () => {
  reading.feedLangs = ["de", "az"];
  render(FeedLanguageFilter);
  expect(screen.queryByText(/No filter set/)).toBe(null);
  await fireEvent.click(screen.getByRole("button", { name: "Remove German" }));
  expect(reading.feedLangs).toEqual(["az"]);
  expect(screen.queryByRole("button", { name: "Remove German" })).toBe(null);
});

test("adding a language from the picker, which then no longer offers it", async () => {
  render(FeedLanguageFilter);
  const trigger = screen.getByRole("button", { name: "Add a language" });
  await fireEvent.keyDown(trigger, { key: "Enter" });
  // bits-ui Select picks on pointer-up, not click.
  const german = await screen.findByRole("option", { name: /German/ });
  await fireEvent.pointerDown(german, { pointerType: "mouse", button: 0 });
  await fireEvent.pointerUp(german, { pointerType: "mouse", button: 0 });
  expect(reading.feedLangs).toEqual(["de"]);
  await screen.findByRole("button", { name: "Remove German" });
  await fireEvent.keyDown(screen.getByRole("button", { name: "Add a language" }), { key: "Enter" });
  await screen.findAllByRole("option");
  expect(screen.queryByRole("option", { name: /German/ })).toBe(null);
});

test("the compact card appears after mount and can be dismissed for good", async () => {
  const { unmount } = render(FeedLanguageFilter, { props: { compact: true } });
  await screen.findByText("Feed languages");
  await fireEvent.click(screen.getByRole("button", { name: "Hide this card" }));
  await waitFor(() => expect(screen.queryByText("Feed languages")).toBe(null));
  unmount();
  // `browser` is false under test, so dismissal isn't persisted here; a
  // previously stored dismissal keeps the card hidden.
  localStorage.setItem("feed-lang-card-dismissed", "1");
  render(FeedLanguageFilter, { props: { compact: true } });
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByText("Feed languages")).toBe(null);
});

test("the settings variant can't be dismissed", () => {
  render(FeedLanguageFilter);
  expect(screen.queryByRole("button", { name: "Hide this card" })).toBe(null);
});
