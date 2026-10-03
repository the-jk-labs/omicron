// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vitest setup: registers the jest-dom matchers on Vitest's `expect` (e.g.
// `toHaveAttribute`, `toHaveAccessibleName`, `toBeInTheDocument`). Runs once
// before the suite; `svelteTesting()` handles per-test DOM cleanup.
import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";

// jsdom has no ResizeObserver; components that only observe sizes need a no-op.
// Tests that drive resize callbacks stub their own with vi.stubGlobal.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom has no matchMedia (svelte/motion's prefersReducedMotion reads it); nothing matches.
globalThis.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

// jsdom has no Web Animations; Svelte transitions run through element.animate.
// This one finishes at once, so transitioned elements settle as without motion.
if (!("animate" in Element.prototype)) {
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value() {
      const animation = { onfinish: null as (() => void) | null, cancel() {}, finish() {}, play() {}, pause() {} };
      queueMicrotask(() => animation.onfinish?.());
      return animation;
    },
  });
}

// The vmThreads context exposes jsdom's crypto, which has no `subtle`.
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
