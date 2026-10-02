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

// The vmThreads context exposes jsdom's crypto, which has no `subtle`.
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
