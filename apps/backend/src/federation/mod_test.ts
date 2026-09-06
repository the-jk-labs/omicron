// SPDX-License-Identifier: AGPL-3.0-or-later
// Boot regression test: constructing the Federation object must not throw.
// Dispatchers are only *registered* here (no I/O, no database), so this catches
// exactly the failure that once crash-looped the backend in production — two
// object dispatchers for one vocabulary class, which Fedify rejects with a
// RouterError. Any future dispatcher registration runs through this.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config.ts", () => ({
  config: {},
}));

import { getFederation } from "@/federation/mod.ts";

describe("getFederation", () => {
  it("registers every dispatcher without throwing", () => {
    expect(() => getFederation()).not.toThrow();
  });
});
