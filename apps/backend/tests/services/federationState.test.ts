// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit tests for the federation origin holder behind #122: the origin used to
// build ActivityPub identities is seeded at boot from the *persisted* instance
// domain (wizard → env → default), not pinned to the boot-time APP_DOMAIN.
import { describe, expect, it, vi } from "vitest";

// The origin is module state; a fresh copy per test keeps them order-independent.
async function load() {
  vi.resetModules();
  return await import("@/services/federationState.ts");
}

describe("federation origin (#122)", () => {
  it("defaults to the config-derived origin when nothing has been seeded", async () => {
    const { federationOrigin } = await load();
    expect(federationOrigin()).toBe("http://localhost:5173");
  });

  it("returns the wizard-persisted origin after seeding", async () => {
    const { federationOrigin, seedFederationOrigin } = await load();
    seedFederationOrigin("https://blog.example.com");
    expect(federationOrigin()).toBe("https://blog.example.com");
  });
});
