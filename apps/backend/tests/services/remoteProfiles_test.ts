// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit tests for the stricter cache-miss budget behind #128: the general GET
// pass-through lets remote discovery through, but a request that actually
// misses the local cache performs outbound federation work, so it must count
// against a tighter per-caller cap than a plain cached read. A fresh cache hit
// never reaches the meter; a miss does, and once exhausted it is refused 429.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config.ts", () => ({
  config: { RATE_LIMIT_ENABLED: true, REDIS_URL: undefined, RL_REMOTE_MISS_MAX: 2 },
}));

vi.mock("@/db/repositories/remoteActors.ts", () => ({
  findByHandle: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@/db/repositories/follows.ts", () => ({ isFollowingRemote: vi.fn<() => Promise<unknown>>() }));
vi.mock("@/db/repositories/relations.ts", () => ({ hasRemote: vi.fn<() => Promise<unknown>>() }));
vi.mock("@/db/repositories/tags.ts", () => ({ tagsForRemoteActor: vi.fn<() => Promise<unknown>>() }));
vi.mock("@/db/repositories/posts.ts", () => ({ listByRemoteActor: vi.fn<() => Promise<unknown>>() }));

vi.mock("@/federation/outboundGuard.ts", () => ({
  negativeCached: () => false,
  setNegativeCached: () => {},
  singleFlight: (_h: string, fn: () => unknown) => fn(),
}));

vi.mock("@/federation/remote.ts", () => ({
  resolveActor: () => Promise.resolve(null),
  fetchOutboxPosts: () => Promise.resolve(),
}));

vi.mock("@/queue/queue.ts", () => ({ queue: { add: vi.fn<() => void>() } }));

import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import { getProfile } from "@/services/remoteProfiles.ts";

const freshActor = (handle: string) => ({
  id: "actor-id",
  apId: `https://example.com/users/${handle}`,
  handle,
  username: handle,
  host: "example.com",
  displayName: handle,
  fetchedAt: new Date(),
});

describe("cache-miss budget (#128)", () => {
  it("serves repeated fresh cache hits without ever hitting the miss budget", async () => {
    // A fresh cached actor short-circuits before the meter; even far more
    // hits than the cap must all succeed.
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(freshActor("alice@example.com") as never);
    const key = `no-miss-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      const actor = await getProfile("alice@example.com", key);
      expect(actor.handle).toBe("alice@example.com");
    }
  });

  it("rejects excessive cache-miss lookups with 429 once the budget is spent", async () => {
    // Always a miss: no cached actor, not negatively cached, resolution fails.
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(null as never);
    const key = `miss-${Date.now()}`;

    // The first RL_REMOTE_MISS_MAX (=2) misses resolve (and fail as not-found).
    for (let i = 0; i < 2; i++) {
      await expect(getProfile(`missing${i}@example.com`, key)).rejects.toMatchObject({ status: 404 });
    }
    // The next miss is refused by the stricter budget before any outbound work.
    await expect(getProfile("missing3@example.com", key)).rejects.toMatchObject({ status: 429 });
  });
});
