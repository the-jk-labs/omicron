// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vitest setup: registers the jest-dom matchers on Vitest's `expect` (e.g.
// `toHaveAttribute`, `toHaveAccessibleName`, `toBeInTheDocument`). Runs once
// before the suite; `svelteTesting()` handles per-test DOM cleanup.
import "@testing-library/jest-dom/vitest";
