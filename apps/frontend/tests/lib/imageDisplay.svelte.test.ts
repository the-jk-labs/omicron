// SPDX-License-Identifier: AGPL-3.0-or-later
import { tick } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("$app/env"), () => ({ browser: true, building: false, dev: true, version: "test" }));
let reduced = false;
let changed: ((event: { matches: boolean }) => void) | undefined;
let stop: (() => void) | undefined;
beforeEach(() => {
  localStorage.clear();
  reduced = false;
  document.body.innerHTML = '<img alt="A graph" src="/a.gif">';
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_: string, callback: typeof changed) => (changed = callback),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  stop?.();
  document.body.replaceChildren();
  delete document.documentElement.dataset.imageDisplay;
});

async function load() {
  vi.resetModules();
  const state = (await import("#lib/imageDisplay.svelte.js")).imageDisplay;
  stop = state.start(document.body);
  await tick();
  return state;
}

test("system reduced-motion preference hides images and descriptions stay available", async () => {
  reduced = true;
  const state = await load();
  expect(state.hidden).toBe(true);
  expect(document.documentElement.dataset.imageDisplay).toBe("hide");
  expect(document.querySelector(".hidden-image-description")).toHaveTextContent("A graph");
  changed!({ matches: false });
  await tick();
  expect(state.hidden).toBe(false);
  expect(document.querySelector(".hidden-image-description")).toBeNull();
});

test("explicit preferences persist and override live OS changes", async () => {
  const state = await load();
  state.set("hide");
  await tick();
  expect(localStorage.getItem("image-display")).toBe("hide");
  changed!({ matches: false });
  expect(state.hidden).toBe(true);
  state.set("show");
  changed!({ matches: true });
  await tick();
  expect(state.hidden).toBe(false);
  state.set("system");
  await tick();
  expect(localStorage.getItem("image-display")).toBeNull();
  expect(state.hidden).toBe(true);
});

test("saved and invalid preferences resolve safely, including blocked browser storage", async () => {
  localStorage.setItem("image-display", "hide");
  expect((await load()).hidden).toBe(true);
  stop?.();
  localStorage.setItem("image-display", "invalid");
  expect((await load()).preference).toBe("system");
  stop?.();
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  reduced = true;
  const state = await load();
  expect(state.hidden).toBe(true);
  expect(() => state.set("show")).not.toThrow();
});
