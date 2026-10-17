// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/lib/redis.ts", () => ({ getRedis: vi.fn<typeof getRedis>() }));
import { getRedis } from "@/lib/redis.ts";

beforeEach(() => {
  vi.resetModules();
});

test("concurrent consumers and a restarted backend share the Redis counter", async () => {
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  let count = 0;
  const evalMock = vi.fn<() => Promise<number[]>>(async () => [++count, 60_000]);
  vi.mocked(getRedis).mockReturnValue({ eval: evalMock } as never);
  const first = (await import("@/auth/rateLimit.ts")).authRateLimitStorage;
  const results = await Promise.all(
    Array.from({ length: 10 }, () => first.consume("login:test", { window: 60, max: 3 })),
  );
  expect(results.filter((result) => result.allowed)).toHaveLength(3);
  expect(results[9].retryAfter).toBeGreaterThan(0);
  expect(evalMock).toHaveBeenCalledWith(expect.stringContaining("INCR"), 1, "rl:auth:login:test", 60_000);
  vi.resetModules();
  const restarted = (await import("@/auth/rateLimit.ts")).authRateLimitStorage;
  expect((await restarted.consume("login:test", { window: 60, max: 3 })).allowed).toBe(false);
});

test("without Redis the local-development limiter still enforces the window", async () => {
  vi.stubEnv("REDIS_URL", "");
  const storage = (await import("@/auth/rateLimit.ts")).authRateLimitStorage;
  expect(await storage.consume("reset:test", { window: 60, max: 1 })).toEqual({ allowed: true, retryAfter: null });
  expect((await storage.consume("reset:test", { window: 60, max: 1 })).allowed).toBe(false);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61_000);
  expect((await storage.consume("reset:test", { window: 60, max: 1 })).allowed).toBe(true);
});
