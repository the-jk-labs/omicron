import { describe, expect, it, vi } from "vitest";
// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit tests for the federation origin holder behind #122: the origin used to
// build ActivityPub identities is seeded at boot from the *persisted* instance
// domain (wizard → env → default), not pinned to the boot-time APP_DOMAIN. The
// default must also survive a config mocked without the field (as other unit
// tests do), so the derivation is defensive.
vi.mock("@/config.ts", () => ({ config: { APP_DOMAIN: "localhost:5173" } }));

import { federationOrigin, seedFederationOrigin } from "@/services/federationState.ts";

describe("federation origin (#122)", () => {
  it("defaults to the config-derived origin when nothing has been seeded", () => {
    expect(federationOrigin()).toBe("http://localhost:5173");
  });

  it("returns the wizard-persisted origin after seeding", () => {
    seedFederationOrigin("https://blog.example.com");
    expect(federationOrigin()).toBe("https://blog.example.com");
  });
});
