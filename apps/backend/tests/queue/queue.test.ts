// SPDX-License-Identifier: AGPL-3.0-or-later
// The Redis-backed worker runs against an in-memory Redis that implements the
// four list commands it uses, with BRPOPLPUSH really blocking until a push.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

class FakeRedis {
  lists = new Map<string, string[]>();
  #waiters: (() => void)[] = [];
  failNextPop = false;

  #list(key: string) {
    let l = this.lists.get(key);
    if (!l) this.lists.set(key, (l = []));
    return l;
  }

  lpush(key: string, value: string) {
    this.#list(key).unshift(value);
    for (const w of this.#waiters.splice(0)) w();
    return Promise.resolve(this.#list(key).length);
  }

  rpoplpush(src: string, dst: string) {
    const v = this.#list(src).pop();
    if (v === undefined) return Promise.resolve(null);
    this.#list(dst).unshift(v);
    return Promise.resolve(v);
  }

  async brpoplpush(src: string, dst: string) {
    if (this.failNextPop) {
      this.failNextPop = false;
      throw new Error("connection reset");
    }
    while (this.#list(src).length === 0) await new Promise<void>((r) => this.#waiters.push(r));
    return this.rpoplpush(src, dst);
  }

  lrem(key: string, _count: number, value: string) {
    const l = this.#list(key);
    const i = l.indexOf(value);
    if (i !== -1) l.splice(i, 1);
    return Promise.resolve(i === -1 ? 0 : 1);
  }
}

const state = vi.hoisted(() => ({ enabled: false, redis: null as unknown }));

vi.mock(import("@/lib/redis.ts"), () => ({
  redisEnabled: () => state.enabled,
  newRedis: (() => state.redis) as never,
}));

let redis: FakeRedis;

async function load() {
  vi.resetModules();
  return await import("@/queue/queue.ts");
}

const JOBS = "omicron:jobs";
const PROCESSING = "omicron:jobs:processing";
const DEAD = "omicron:jobs:dead";

beforeEach(() => {
  redis = new FakeRedis();
  state.redis = redis;
  state.enabled = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("in-process queue (no Redis)", () => {
  test("runs the handler asynchronously, after add returns", async () => {
    const { queue, registerHandler } = await load();
    const handler = vi.fn<(p: unknown) => Promise<void>>().mockResolvedValue();
    registerHandler("send_follow", handler);
    queue.add("send_follow", { followerId: "u", targetActor: "t" });
    expect(handler).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledWith({ followerId: "u", targetActor: "t" }));
  });

  test("a job with no handler is dropped with a warning", async () => {
    const { queue } = await load();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    queue.add("send_follow", { followerId: "u", targetActor: "t" });
    expect(warn).toHaveBeenCalledWith('queue: no handler registered for "send_follow" (dropping job)');
  });

  test("the worker is a no-op without Redis", async () => {
    const { startJobWorker } = await load();
    startJobWorker();
    expect(redis.lists.size).toBe(0);
  });
});

describe("Redis-backed queue", () => {
  beforeEach(() => {
    state.enabled = true;
  });

  test("add pushes a JSON envelope with zero attempts", async () => {
    const { queue } = await load();
    queue.add("send_follow", { followerId: "u", targetActor: "t" });
    await vi.waitFor(() => expect(redis.lists.get(JOBS)).toHaveLength(1));
    expect(JSON.parse(redis.lists.get(JOBS)![0])).toEqual({
      name: "send_follow",
      payload: { followerId: "u", targetActor: "t" },
      attempts: 0,
    });
  });

  test("a failed push is logged, not thrown", async () => {
    const { queue } = await load();
    redis.lpush = () => Promise.reject(new Error("OOM"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => queue.add("send_follow", { followerId: "u", targetActor: "t" })).not.toThrow();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
  });

  test("the worker drains jobs and clears them from processing", async () => {
    const { queue, registerHandler, startJobWorker } = await load();
    const handler = vi.fn<(p: unknown) => Promise<void>>().mockResolvedValue();
    registerHandler("send_follow", handler);
    vi.spyOn(console, "log").mockImplementation(() => {});
    startJobWorker();
    queue.add("send_follow", { followerId: "u", targetActor: "t" });
    queue.add("send_follow", { followerId: "v", targetActor: "t" });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(redis.lists.get(PROCESSING)).toEqual([]));
    expect(redis.lists.get(JOBS)).toEqual([]);
  });

  test("starting twice runs one worker", async () => {
    const { queue, registerHandler, startJobWorker } = await load();
    const handler = vi.fn<(p: unknown) => Promise<void>>().mockResolvedValue();
    registerHandler("send_follow", handler);
    vi.spyOn(console, "log").mockImplementation(() => {});
    startJobWorker();
    startJobWorker();
    queue.add("send_follow", { followerId: "u", targetActor: "t" });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
  });

  test("jobs left mid-flight by a crashed worker are recovered at start", async () => {
    const { registerHandler, startJobWorker } = await load();
    const handler = vi.fn<(p: unknown) => Promise<void>>().mockResolvedValue();
    registerHandler("send_follow", handler);
    redis.lists.set(PROCESSING, [
      JSON.stringify({ name: "send_follow", payload: { followerId: "crash" }, attempts: 1 }),
    ]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    startJobWorker();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledWith({ followerId: "crash" }));
  });

  test("a failing job is retried with an incremented attempt count after a backoff", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const { queue, registerHandler, startJobWorker } = await load();
    const handler = vi
      .fn<(p: unknown) => Promise<void>>()
      .mockRejectedValueOnce(new Error("remote down"))
      .mockResolvedValue();
    registerHandler("send_follow", handler);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    startJobWorker();
    queue.add("send_follow", { followerId: "u", targetActor: "t" });
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining("attempt 1"), expect.any(Error)));
    // The retry is held back for attempts × 1s.
    expect(handler).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2));
  });

  test("a job that keeps failing is dead-lettered after five attempts", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const { registerHandler, startJobWorker } = await load();
    const handler = vi.fn<(p: unknown) => Promise<void>>().mockRejectedValue(new Error("always"));
    registerHandler("send_follow", handler);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    redis.lists.set(JOBS, [JSON.stringify({ name: "send_follow", payload: {}, attempts: 3 })]);
    startJobWorker();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.waitFor(() => expect(redis.lists.get(DEAD)).toHaveLength(1));
    expect(JSON.parse(redis.lists.get(DEAD)![0]).attempts).toBe(5);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(redis.lists.get(JOBS)).toEqual([]);
    expect(redis.lists.get(PROCESSING)).toEqual([]);
  });

  test("a Redis error in the loop backs off and keeps going", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const { queue, registerHandler, startJobWorker } = await load();
    const handler = vi.fn<(p: unknown) => Promise<void>>().mockResolvedValue();
    registerHandler("send_follow", handler);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    redis.failNextPop = true;
    startJobWorker();
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith("queue: worker loop error:", expect.any(Error)));
    queue.add("send_follow", { followerId: "u", targetActor: "t" });
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
  });
});
