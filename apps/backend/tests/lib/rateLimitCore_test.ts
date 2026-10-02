// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Eval = (...args: unknown[]) => Promise<unknown>;

const { redis } = vi.hoisted(() => ({
  redis: { client: null as { eval: Eval } | null },
}));

vi.mock(import("@/lib/redis.ts"), () => ({ getRedis: () => redis.client as never }));

import { config } from "@/config.ts";
import { checkRateLimitKey, hit } from "@/lib/rateLimitCore.ts";

let n = 0;
const uniqueKey = () => `key-${++n}-${Math.random()}`;

beforeEach(() => {
  config.RATE_LIMIT_ENABLED = true;
  config.REDIS_URL = undefined;
  redis.client = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hit (in-process)", () => {
  test("allows up to max hits, then refuses", async () => {
    const key = uniqueKey();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hit(key, 60_000, 3));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
  });

  test("keeps one resetAt for the whole window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const key = uniqueKey();
    const first = await hit(key, 10_000, 5);
    vi.setSystemTime(1_005_000);
    const second = await hit(key, 10_000, 5);
    expect(first.resetAt).toBe(1_010_000);
    expect(second.resetAt).toBe(1_010_000);
  });

  test("starts a fresh window once the old one expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    const key = uniqueKey();
    await hit(key, 1_000, 1);
    expect((await hit(key, 1_000, 1)).allowed).toBe(false);
    vi.setSystemTime(2_001_000);
    const fresh = await hit(key, 1_000, 1);
    expect(fresh).toEqual({ allowed: true, remaining: 0, resetAt: 2_002_000 });
  });

  test("buckets are independent per key", async () => {
    const a = uniqueKey();
    const b = uniqueKey();
    await hit(a, 60_000, 1);
    expect((await hit(a, 60_000, 1)).allowed).toBe(false);
    expect((await hit(b, 60_000, 1)).allowed).toBe(true);
  });

  test("sweeps expired buckets without disturbing live ones", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000_000);
    const live = uniqueKey();
    await hit(uniqueKey(), 1_000, 1);
    await hit(live, 600_000, 1);
    // More than a minute later the sweep runs; the live bucket must survive it.
    vi.setSystemTime(10_120_000);
    expect((await hit(live, 600_000, 1)).allowed).toBe(false);
  });
});

describe("hit (redis)", () => {
  test("uses the Lua counter and maps count/ttl to the result", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    config.REDIS_URL = "redis://localhost:6379";
    redis.client = { eval: vi.fn<Eval>().mockResolvedValue([2, 7_000]) };
    const r = await hit("k", 10_000, 3);
    expect(r).toEqual({ allowed: true, remaining: 1, resetAt: 12_000 });
    expect(redis.client.eval).toHaveBeenCalledWith(expect.stringContaining("INCR"), 1, "rl:k", 10_000);
  });

  test("refuses once the redis count exceeds max", async () => {
    config.REDIS_URL = "redis://localhost:6379";
    redis.client = { eval: vi.fn<Eval>().mockResolvedValue([4, 1_000]) };
    expect(await hit("k", 10_000, 3)).toMatchObject({ allowed: false, remaining: 0 });
  });

  test.for([-1, -2])("falls back to a full window when PTTL is %i", async (ttl) => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    config.REDIS_URL = "redis://localhost:6379";
    redis.client = { eval: vi.fn<Eval>().mockResolvedValue([1, ttl]) };
    expect((await hit("k", 10_000, 3)).resetAt).toBe(15_000);
  });

  test("falls back to the in-process limiter when redis errors", async () => {
    config.REDIS_URL = "redis://localhost:6379";
    redis.client = { eval: vi.fn<Eval>().mockRejectedValue(new Error("ECONNREFUSED")) };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const key = uniqueKey();
    expect((await hit(key, 60_000, 1)).allowed).toBe(true);
    expect((await hit(key, 60_000, 1)).allowed).toBe(false);
    expect(error).toHaveBeenCalled();
  });

  test("falls back to in-process when REDIS_URL is set but no client is available", async () => {
    config.REDIS_URL = "redis://localhost:6379";
    redis.client = null;
    const key = uniqueKey();
    expect((await hit(key, 60_000, 1)).allowed).toBe(true);
    expect((await hit(key, 60_000, 1)).allowed).toBe(false);
  });
});

describe("checkRateLimitKey", () => {
  test("always allows when rate limiting is disabled", async () => {
    config.RATE_LIMIT_ENABLED = false;
    const key = uniqueKey();
    for (let i = 0; i < 5; i++) {
      expect(await checkRateLimitKey(key, "n", 60_000, 1)).toEqual({ allowed: true, retryAfter: 0 });
    }
  });

  test("namespaces by name so two limiters never share a bucket", async () => {
    const key = uniqueKey();
    expect((await checkRateLimitKey(key, "a", 60_000, 1)).allowed).toBe(true);
    expect((await checkRateLimitKey(key, "a", 60_000, 1)).allowed).toBe(false);
    expect((await checkRateLimitKey(key, "b", 60_000, 1)).allowed).toBe(true);
  });

  test("reports retryAfter in whole seconds, rounded up", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const key = uniqueKey();
    await checkRateLimitKey(key, "n", 1_500, 1);
    vi.setSystemTime(100);
    expect(await checkRateLimitKey(key, "n", 1_500, 1)).toEqual({ allowed: false, retryAfter: 2 });
  });
});
