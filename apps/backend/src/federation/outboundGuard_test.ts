// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit tests for the outbound federation guards behind #128: remote discovery
// (GET /api/remote/*) can trigger outbound WebFinger/actor/outbox fetches and DB
// writes from an anonymous caller, so the read-side resolution path needs the
// same kind of ceilings the write paths get — single-flight coalescing, negative
// caching, a global + per-origin concurrency budget, and a hard deadline.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config.ts", () => ({
  config: {
    RL_REMOTE_MAX_OUTBOUND: 2,
    RL_REMOTE_MAX_PER_ORIGIN: 1,
    REMOTE_LOOKUP_TIMEOUT_MS: 250,
    REMOTE_NEGATIVE_CACHE_TTL_MS: 60_000,
  },
}));

import {
  negativeCached,
  normalizeHandle,
  runOutbound,
  setNegativeCached,
  singleFlight,
} from "@/federation/outboundGuard.ts";

describe("normalizeHandle", () => {
  it("strips a leading @ and lowercases", () => {
    expect(normalizeHandle("@Alice@Example.ORG")).toBe("alice@example.org");
    expect(normalizeHandle("alice@example.org")).toBe("alice@example.org");
  });
});

describe("single-flight", () => {
  it("coalesces concurrent calls for the same handle into one invocation", async () => {
    const fn = vi.fn<() => Promise<string>>(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return "resolved";
    });
    const results = await Promise.all([
      singleFlight("alice@example.org", fn),
      singleFlight("@alice@example.org", fn),
      singleFlight("alice@example.org", fn),
    ]);
    expect(results).toEqual(["resolved", "resolved", "resolved"]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("clears the in-flight entry so a later call re-runs", async () => {
    const fn = vi.fn<() => Promise<string>>(async () => "x");
    await singleFlight("bob@example.org", fn);
    await singleFlight("bob@example.org", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("negative cache", () => {
  it("remembers a failed handle within the TTL window", () => {
    expect(negativeCached("missing@example.org")).toBe(false);
    setNegativeCached("missing@example.org");
    expect(negativeCached("@missing@example.org")).toBe(true);
    expect(negativeCached("other@example.org")).toBe(false);
  });
});

describe("runOutbound", () => {
  it("runs the action and returns its value", async () => {
    const result = await runOutbound("example.org", async () => 42);
    expect(result).toBe(42);
  });

  it("cap the per-origin budget: a second concurrent call waits", async () => {
    let firstDone = false;
    const order: string[] = [];
    const slow = runOutbound("slow.org", async () => {
      order.push("first-start");
      await new Promise((r) => setTimeout(r, 50));
      firstDone = true;
      order.push("first-end");
      return 1;
    });
    const second = runOutbound("slow.org", async () => {
      order.push("second-start");
      return 2;
    });
    await slow;
    await second;
    // The second call must not start until the first releases the per-origin
    // permit, proving the per-origin semaphore (max 1) serializes.
    expect(order.indexOf("first-start")).toBeLessThan(order.indexOf("first-end"));
    expect(order.indexOf("first-end")).toBeLessThan(order.indexOf("second-start"));
    expect(firstDone).toBe(true);
  });

  it("keeps the global budget independent across distinct origins", async () => {
    // Two distinct hosts, each with per-origin max 1, can run concurrently
    // because the global budget is 2.
    let overlap = 0;
    let peak = 0;
    const bump = () => {
      overlap++;
      peak = Math.max(peak, overlap);
      setTimeout(() => overlap--, 0);
    };
    await Promise.all([runOutbound("a.example", async () => bump()), runOutbound("b.example", async () => bump())]);
    expect(peak).toBe(2);
  });
});
