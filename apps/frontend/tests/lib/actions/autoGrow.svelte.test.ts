// SPDX-License-Identifier: AGPL-3.0-or-later
import { flushSync } from "svelte";
import { beforeEach, expect, test, vi } from "vitest";
import { autoGrow } from "#lib/actions/autoGrow.svelte.js";

let resized: (() => void) | null;
let disconnected: boolean;
beforeEach(() => {
  resized = null;
  disconnected = false;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        resized = cb;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
  );
});

function textarea(scrollHeight: () => number) {
  const el = document.createElement("textarea");
  el.style.borderTopWidth = "1px";
  el.style.borderBottomWidth = "1px";
  el.style.borderStyle = "solid";
  vi.spyOn(el, "offsetHeight", "get").mockReturnValue(40);
  vi.spyOn(el, "scrollHeight", "get").mockImplementation(scrollHeight);
  return el;
}

test("grows with its content between its initial height and a cap, then scrolls", () => {
  let content = 20;
  let value = $state("");
  const el = textarea(() => content);
  const cleanup = $effect.root(() => autoGrow(el, () => value));
  flushSync();
  // Never below the height it was laid out with.
  expect(el.style.height).toBe("40px");
  expect(el.style.overflowY).toBe("hidden");

  content = 100;
  value = "more";
  flushSync();
  expect(el.style.height).toBe("102px");

  content = 1000;
  value = "much more";
  flushSync();
  expect(el.style.height).toBe("320px");
  expect(el.style.overflowY).toBe("auto");

  cleanup();
  expect(disconnected).toBe(true);
});

test("re-measures when the width changes, not on height-only resizes", () => {
  let content = 50;
  const el = textarea(() => content);
  let width = 300;
  vi.spyOn(el, "clientWidth", "get").mockImplementation(() => width);
  const cleanup = $effect.root(() => autoGrow(el, () => ""));
  flushSync();
  content = 200;
  resized!();
  expect(el.style.height).toBe("52px");
  width = 200;
  resized!();
  expect(el.style.height).toBe("202px");
  cleanup();
});
