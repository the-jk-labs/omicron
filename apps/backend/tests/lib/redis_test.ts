// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";

const { RedisMock } = vi.hoisted(() => {
  class FakeRedis {
    static instances: FakeRedis[] = [];
    handlers: Record<string, (err: Error) => void> = {};
    constructor(
      public url: string,
      public options: Record<string, unknown>,
    ) {
      FakeRedis.instances.push(this);
    }
    on(event: string, fn: (err: Error) => void) {
      this.handlers[event] = fn;
      return this;
    }
  }
  return { RedisMock: FakeRedis };
});

vi.mock(import("ioredis"), () => ({ Redis: RedisMock as never }));

// redis.ts reads a freshly loaded config each time, so the env var is the input.
async function load() {
  vi.resetModules();
  return await import("@/lib/redis.ts");
}

beforeEach(() => {
  vi.stubEnv("REDIS_URL", undefined);
  RedisMock.instances = [];
});

describe("without REDIS_URL", () => {
  test("redis is disabled and there is no shared client", async () => {
    const mod = await load();
    expect(mod.redisEnabled()).toBe(false);
    expect(mod.getRedis()).toBe(null);
    expect(RedisMock.instances).toHaveLength(0);
  });

  test("newRedis refuses to connect", async () => {
    const mod = await load();
    expect(() => mod.newRedis()).toThrow("newRedis() called without REDIS_URL configured");
  });
});

describe("with REDIS_URL", () => {
  beforeEach(() => {
    vi.stubEnv("REDIS_URL", "redis://cache:6379/0");
  });

  test("the shared client is created once and memoized", async () => {
    const mod = await load();
    expect(mod.redisEnabled()).toBe(true);
    const a = mod.getRedis();
    const b = mod.getRedis();
    expect(a).toBe(b);
    expect(RedisMock.instances).toHaveLength(1);
  });

  test("connections pin RESP2 and never buffer forever", async () => {
    const mod = await load();
    mod.newRedis();
    const [conn] = RedisMock.instances;
    expect(conn.url).toBe("redis://cache:6379/0");
    expect(conn.options).toMatchObject({ protocol: 2, maxRetriesPerRequest: null });
  });

  test("reconnect backoff grows linearly and caps at five seconds", async () => {
    const mod = await load();
    mod.newRedis();
    const retry = RedisMock.instances[0].options.retryStrategy as (n: number) => number;
    expect(retry(1)).toBe(200);
    expect(retry(10)).toBe(2_000);
    expect(retry(25)).toBe(5_000);
    expect(retry(1_000)).toBe(5_000);
  });

  test("logs connection errors instead of crashing", async () => {
    const mod = await load();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mod.newRedis();
    RedisMock.instances[0].handlers.error(new Error("boom"));
    expect(error).toHaveBeenCalledWith("redis: connection error:", "boom");
  });

  test("the factory mints a new connection per call", async () => {
    const mod = await load();
    const factory = mod.redisFactory();
    expect(factory()).not.toBe(factory());
    expect(RedisMock.instances).toHaveLength(2);
  });
});
