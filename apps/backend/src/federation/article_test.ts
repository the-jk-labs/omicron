import { PUBLIC_COLLECTION } from "@fedify/fedify/vocab";
// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit tests for the inbound visibility gate behind #123: only remote Articles
// addressed to the ActivityStreams Public collection may be cached, so a
// followers-only or direct-message post is never persisted and surfaced on
// anonymous read paths. The module under test imports config (which needs a
// Deno runtime for env access), so it is mocked; the logic tested is real. No
// origin is provided: article.ts reads the federation origin from
// federationState, which falls back to its own config-derived default — and
// isPubliclyAddressed never consults it.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config.ts", () => ({ config: {} }));

import { isPubliclyAddressed } from "@/federation/article.ts";

// The minimal shape isPubliclyAddressed reads (Fedify's synchronous `*Ids`
// accessors on an ActivityPub Object).
type Addressed = {
  toIds: URL[];
  ccIds: URL[];
  audienceIds: URL[];
};

const followers = () => new URL("https://remote.example/users/alice/followers");
const bob = () => new URL("https://omicron.example/users/bob");

function obj(o: Partial<Addressed>): Addressed {
  return { toIds: [], ccIds: [], audienceIds: [], ...o };
}

describe("isPubliclyAddressed", () => {
  it("accepts an Article addressed to the Public collection in to", () => {
    expect(isPubliclyAddressed(obj({ toIds: [PUBLIC_COLLECTION] }))).toBe(true);
  });

  it("accepts an Article addressed to Public in cc", () => {
    expect(isPubliclyAddressed(obj({ ccIds: [PUBLIC_COLLECTION] }))).toBe(true);
  });

  it("accepts an Article addressed to Public in audience", () => {
    expect(isPubliclyAddressed(obj({ audienceIds: [PUBLIC_COLLECTION] }))).toBe(true);
  });

  it("rejects a followers-only Article (the #123 reproduction)", () => {
    expect(isPubliclyAddressed(obj({ toIds: [followers()] }))).toBe(false);
  });

  it("rejects an Article addressed only to a specific user", () => {
    expect(isPubliclyAddressed(obj({ toIds: [bob()], ccIds: [followers()] }))).toBe(false);
  });

  it("never treats bcc as publicity", () => {
    // A defensive check: Public in bcc alone must not make a post "public".
    const withBcc = obj({ toIds: [], ccIds: [], audienceIds: [] }) as Addressed & {
      bccIds: URL[];
    };
    withBcc.bccIds = [PUBLIC_COLLECTION];
    expect(isPubliclyAddressed(withBcc)).toBe(false);
  });

  it("rejects an Article with no addressing at all", () => {
    expect(isPubliclyAddressed(obj({}))).toBe(false);
  });
});
