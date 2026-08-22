// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vitest stand-in for SvelteKit's virtual `$app/navigation` module. Components
// import `goto`/`invalidate` and call them from event handlers; tests only need
// them to resolve, and to be spies when an interaction is being asserted.
import { vi } from "vitest";

export const goto = vi.fn();
export const invalidate = vi.fn();
export const invalidateAll = vi.fn();
export const preloadData = vi.fn();
export const preloadCode = vi.fn();
export const pushState = vi.fn();
export const replaceState = vi.fn();
