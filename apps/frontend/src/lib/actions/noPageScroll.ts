// SPDX-License-Identifier: AGPL-3.0-or-later

// Makes an element a scroll dead zone: wheel and touch gestures that start on
// it scroll neither the element nor the page behind it.
//
// This exists because a pinned rail with no overflow of its own (such as the
// left navigation) still lets wheel events bubble through to the window, so
// scrolling while hovering the rail moves the feed — which reads as the rail
// itself scrolling. Stopping the gesture at the rail keeps it fixed in every
// sense, like the discovery rail opposite it.
//
// Ctrl+wheel (trackpad pinch-zoom) is deliberately left alone: blocking it
// would break page zoom, which is an accessibility tool, not scrolling.

export function noPageScroll(node: HTMLElement) {
  node.addEventListener("wheel", onWheel, { passive: false });
  node.addEventListener("touchmove", onTouchMove, { passive: false });
  return {
    destroy() {
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("touchmove", onTouchMove);
    },
  };
}

function onWheel(e: WheelEvent) {
  if (e.ctrlKey) return;
  e.preventDefault();
}

function onTouchMove(e: TouchEvent) {
  e.preventDefault();
}
