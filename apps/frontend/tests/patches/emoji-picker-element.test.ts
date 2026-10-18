// SPDX-License-Identifier: AGPL-3.0-or-later
// The CSP blocks nonce-less <style> elements and style attributes. Chromium keeps a
// blocked attribute's text but Firefox empties it, so the picker must never write
// either: patches/emoji-picker-element.patch moves both onto CSSOM, which the CSP allows.
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function mountPicker() {
  await import("emoji-picker-element");
  const picker = document.createElement("emoji-picker");
  document.body.append(picker);
  await vi.waitFor(() => expect(picker.shadowRoot!.querySelector(".nav")).not.toBe(null));
  return picker;
}

test("ships its stylesheet as an adopted sheet, not a <style> element", async () => {
  const root = (await mountPicker()).shadowRoot!;
  expect(root.querySelector("style")).toBe(null);
  expect(root.adoptedStyleSheets).toHaveLength(1);
  expect(root.adoptedStyleSheets[0].cssRules.length).toBeGreaterThan(0);
});

test("lays itself out through CSSOM, never a style attribute", async () => {
  const setAttribute = vi.spyOn(Element.prototype, "setAttribute");
  const root = (await mountPicker()).shadowRoot!;
  expect(setAttribute.mock.calls.filter(([name]) => name === "style")).toEqual([]);
  expect(root.querySelector<HTMLElement>(".nav")!.style.gridTemplateColumns).toMatch(/^repeat\(9, ?1fr\)$/);
  expect(root.querySelector<HTMLElement>(".indicator")!.style.transform).toBe("translateX(0%)");
});
