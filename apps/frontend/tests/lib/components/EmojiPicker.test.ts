// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import EmojiPicker from "#lib/components/EmojiPicker.svelte";

// The real package needs IndexedDB; this stand-in only mirrors how it styles itself.
vi.mock("emoji-picker-element", () => {
  if (!customElements.get("emoji-picker")) {
    customElements.define(
      "emoji-picker",
      class extends HTMLElement {
        constructor() {
          super();
          const style = document.createElement("style");
          style.textContent = ".picker { color: red; }";
          this.attachShadow({ mode: "open" }).appendChild(style);
        }
        connectedCallback() {
          const nav = document.createElement("div");
          nav.className = "nav";
          nav.setAttribute("style", "grid-template-columns:repeat(9,1fr)");
          this.shadowRoot!.appendChild(nav);
        }
      },
    );
  }
  return {};
});

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

// The CSP blocks a <style> element without a nonce; an adopted stylesheet is CSSOM and still applies.
test("moves the picker's own stylesheet out of a CSP-blocked <style> element", async () => {
  render(EmojiPicker, { props: { onPick: vi.fn() } });
  await waitFor(() => expect(picker()).not.toBe(null));
  const root = picker()!.shadowRoot!;
  expect(root.querySelector("style")).toBe(null);
  const rules = root.adoptedStyleSheets.flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText));
  expect(rules).toEqual([".picker { color: red; }"]);
});

// Its layout rides on runtime style attributes, which `style-src-attr` blocks; CSSOM writes are allowed.
test("re-applies the picker's inline style attributes through CSSOM, without looping", async () => {
  const cssText = vi.spyOn(CSSStyleDeclaration.prototype, "cssText", "set");
  render(EmojiPicker, { props: { onPick: vi.fn() } });
  await waitFor(() => expect(cssText).toHaveBeenCalledWith("grid-template-columns:repeat(9,1fr)"));

  picker()!.shadowRoot!.querySelector(".nav")!.setAttribute("style", "grid-template-columns:repeat(10,1fr)");
  await waitFor(() => expect(cssText).toHaveBeenCalledWith("grid-template-columns:repeat(10,1fr)"));
  const calls = cssText.mock.calls.length;
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(cssText.mock.calls.length).toBe(calls);
  cssText.mockRestore();
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
