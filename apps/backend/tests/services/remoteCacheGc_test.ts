// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/remoteActors.ts"));

import { config } from "@/config.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";

async function load() {
  vi.resetModules();
  // Re-import config too so mutations below land on the copy the service reads.
  const cfg = (await import("@/config.ts")).config;
  return { ...(await import("@/services/remoteCacheGc.ts")), cfg };
}

const NOW = new Date("2026-06-01T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

test("forgets every listed actor older than the retention window", async () => {
  const { sweep, cfg } = await load();
  cfg.REMOTE_CACHE_RETENTION_DAYS = 30;
  vi.mocked(remoteActorsRepo.listPrunable).mockResolvedValue([{ id: "a" }, { id: "b" }]);
  vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await sweep()).toBe(2);
  expect(remoteActorsRepo.listPrunable).toHaveBeenCalledWith(new Date(NOW.getTime() - 30 * 86_400_000), 200);
  expect(vi.mocked(remoteActorsRepo.removeById).mock.calls).toEqual([["a"], ["b"]]);
});

test("a retention of 0 disables pruning entirely", async () => {
  const { sweep, cfg } = await load();
  cfg.REMOTE_CACHE_RETENTION_DAYS = 0;
  expect(await sweep()).toBe(0);
  expect(remoteActorsRepo.listPrunable).not.toHaveBeenCalled();
});

test("one failed delete is skipped and the rest still go", async () => {
  const { sweep } = await load();
  vi.mocked(remoteActorsRepo.listPrunable).mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
  vi.mocked(remoteActorsRepo.removeById).mockImplementation(async (id) => {
    if (id === "b") throw new Error("fk");
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await sweep()).toBe(2);
});

test("a failed listing is logged and returns zero", async () => {
  const { sweep } = await load();
  vi.mocked(remoteActorsRepo.listPrunable).mockRejectedValue(new Error("db down"));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await sweep()).toBe(0);
  expect(error).toHaveBeenCalled();
});

test("the sweeper starts once and repeats daily", async () => {
  vi.useFakeTimers();
  const { startRemoteCacheGcSweeper } = await load();
  vi.mocked(remoteActorsRepo.listPrunable).mockResolvedValue([]);
  vi.spyOn(console, "log").mockImplementation(() => {});
  startRemoteCacheGcSweeper();
  startRemoteCacheGcSweeper();
  await vi.advanceTimersByTimeAsync(0);
  expect(remoteActorsRepo.listPrunable).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(86_400_000);
  expect(remoteActorsRepo.listPrunable).toHaveBeenCalledTimes(2);
});

test("the default retention is the configured 30 days", () => {
  expect(config.REMOTE_CACHE_RETENTION_DAYS).toBe(30);
});
