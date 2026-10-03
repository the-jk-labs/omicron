// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import EmojiPicker from "#lib/components/EmojiPicker.svelte";

// The real package registers a custom element that needs IndexedDB; an
// unregistered <emoji-picker> is enough to drive the wrapper.
vi.mock("emoji-picker-element", () => ({}));

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const picker = () => document.querySelector<HTMLElement>("emoji-picker");

test("mounts a self-hosted, version-pinned picker", async () => {
  render(EmojiPicker, { props: { onPick: vi.fn() } });
  await waitFor(() => expect(picker()).not.toBe(null));
  expect(picker()).toHaveAttribute("data-source", "/emoji-data.json");
  expect(picker()).toHaveAttribute("emoji-version", "15.0");
  expect(picker()).toHaveClass("omicron-emoji-picker", "light");
});

test("a clicked emoji is handed back as Unicode; one without it is ignored", async () => {
  const onPick = vi.fn<(e: string) => void>();
  render(EmojiPicker, { props: { onPick } });
  await waitFor(() => expect(picker()).not.toBe(null));
  picker()!.dispatchEvent(new CustomEvent("emoji-click", { detail: { unicode: "🎉" } }));
  picker()!.dispatchEvent(new CustomEvent("emoji-click", { detail: {} }));
  expect(onPick.mock.calls).toEqual([["🎉"]]);
});

test("follows the site theme as it changes", async () => {
  render(EmojiPicker, { props: { onPick: vi.fn() } });
  await waitFor(() => expect(picker()).not.toBe(null));
  document.documentElement.classList.add("dark");
  await waitFor(() => expect(picker()).toHaveClass("dark"));
  expect(picker()).not.toHaveClass("light");
});

test("is removed on unmount", async () => {
  const { unmount } = render(EmojiPicker, { props: { onPick: vi.fn() } });
  await waitFor(() => expect(picker()).not.toBe(null));
  unmount();
  expect(picker()).toBe(null);
});
