import { page } from "$app/state";
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
  reading.feedLangCardDismissed = false;
  page.data = { user: null };
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

test("the compact card shows from the first render and can be dismissed", async () => {
  render(FeedLanguageFilter, { props: { compact: true } });
  expect(screen.getByText("Feed languages")).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Hide this card" }));
  await waitFor(() => expect(screen.queryByText("Feed languages")).toBe(null));
  expect(reading.feedLangCardDismissed).toBe(true);
});

// `browser` is false here, as on the server: the saved filter comes from the layout data.
test("the server renders the saved filter, so nothing flips on hydration", () => {
  page.data = { user: null, feedFilter: { mode: "hide", langs: ["de"], cardDismissed: false } } as never;
  render(FeedLanguageFilter);
  expect(pressed()).toEqual(["Hide these"]);
  expect(screen.getByRole("button", { name: "Remove German" })).toBeInTheDocument();
});

test("the server leaves out a card the reader dismissed", () => {
  page.data = { user: null, feedFilter: { mode: "show", langs: [], cardDismissed: true } } as never;
  render(FeedLanguageFilter, { props: { compact: true } });
  expect(screen.queryByText("Feed languages")).toBe(null);
});

test("the settings variant can't be dismissed", () => {
  render(FeedLanguageFilter);
  expect(screen.queryByRole("button", { name: "Hide this card" })).toBe(null);
});
