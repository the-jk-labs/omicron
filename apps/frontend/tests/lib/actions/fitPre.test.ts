import { fitPre } from "$lib/actions/fitPre";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";

let resizeCallbacks: (() => void)[];
beforeEach(() => {
  resizeCallbacks = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        resizeCallbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
});

// jsdom has no layout: give a <pre> the widths a browser would measure.
function pre(clientWidth: number, scrollWidth: number, fontSize = "16px") {
  const el = document.createElement("pre");
  el.style.fontSize = fontSize;
  el.style.paddingLeft = "8px";
  el.style.paddingRight = "8px";
  vi.spyOn(el, "clientWidth", "get").mockReturnValue(clientWidth);
  vi.spyOn(el, "scrollWidth", "get").mockReturnValue(scrollWidth);
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    (node) =>
      ({
        fontSize: (node as HTMLElement).style.fontSize || fontSize,
        paddingLeft: "8px",
        paddingRight: "8px",
      }) as CSSStyleDeclaration,
  );
  return el;
}

function host(...pres: HTMLElement[]) {
  const node = document.createElement("div");
  node.append(...pres);
  return node;
}

test("a block that fits is left alone, unwrapped", () => {
  const p = pre(416, 300);
  fitPre(host(p));
  expect(p.style.whiteSpace).toBe("pre");
  expect(p.style.fontSize).toBe("");
});

test("a block that overflows shrinks its font to fit", () => {
  const p = pre(416, 616);
  fitPre(host(p));
  // 400px available for 600px of content: two thirds the size, less a 1% margin.
  expect(p.style.fontSize).toBe(`${16 * (400 / 600) * 0.99}px`);
  expect(p.style.whiteSpace).toBe("pre");
});

test("below the legibility floor it wraps instead", () => {
  const p = pre(116, 1616);
  fitPre(host(p));
  expect(p.style.fontSize).toBe("9px");
  expect(p.style.whiteSpace).toBe("pre-wrap");
});

test("a container resize refits, but only when the width actually changed", () => {
  const p = pre(416, 816);
  const node = host(p);
  vi.spyOn(node, "clientWidth", "get").mockReturnValue(600);
  fitPre(node);
  p.style.fontSize = "1px";
  resizeCallbacks[0]();
  expect(p.style.fontSize).not.toBe("1px");
  p.style.fontSize = "1px";
  resizeCallbacks[0]();
  expect(p.style.fontSize).toBe("1px");
});

test("new code blocks are fitted as they appear; destroy stops observing", async () => {
  const node = host();
  const action = fitPre(node);
  const p = pre(416, 816);
  node.append(p);
  await vi.waitFor(() => expect(p.style.fontSize).not.toBe(""));
  action.destroy();
  const late = pre(416, 816);
  node.append(late);
  await new Promise((r) => setTimeout(r, 0));
  expect(late.style.fontSize).toBe("16px");
});
