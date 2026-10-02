import { noPageScroll } from "$lib/actions/noPageScroll";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";

const wheel = (ctrlKey = false) => new WheelEvent("wheel", { cancelable: true, ctrlKey });
const touch = () => new Event("touchmove", { cancelable: true });

test("swallows wheel and touch scrolling over the node, but not pinch-zoom", () => {
  const node = document.createElement("div");
  const action = noPageScroll(node);
  const w = wheel();
  node.dispatchEvent(w);
  expect(w.defaultPrevented).toBe(true);
  const t = touch();
  node.dispatchEvent(t);
  expect(t.defaultPrevented).toBe(true);
  const zoom = wheel(true);
  node.dispatchEvent(zoom);
  expect(zoom.defaultPrevented).toBe(false);

  action.destroy();
  const after = wheel();
  node.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});
