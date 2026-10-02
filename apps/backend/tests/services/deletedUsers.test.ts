// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test, vi } from "vitest";

vi.mock(import("@/services/moderation.ts"));

import * as moderation from "@/services/moderation.ts";

async function load() {
  vi.resetModules();
  return await import("@/services/deletedUsers.ts");
}

afterEach(() => {
  vi.useRealTimers();
});

test("sweep purges up to 100 expired accounts as of now", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));
  const { sweep } = await load();
  vi.mocked(moderation.purgeExpiredDeletedUsers).mockResolvedValue(3);
  vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await sweep()).toBe(3);
  expect(moderation.purgeExpiredDeletedUsers).toHaveBeenCalledWith(new Date("2026-05-01T00:00:00Z"), 100);
});

test("sweep stays quiet when nothing expired", async () => {
  const { sweep } = await load();
  vi.mocked(moderation.purgeExpiredDeletedUsers).mockResolvedValue(0);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await sweep()).toBe(0);
  expect(log).not.toHaveBeenCalled();
});

test("sweep logs and swallows a failure", async () => {
  const { sweep } = await load();
  vi.mocked(moderation.purgeExpiredDeletedUsers).mockRejectedValue(new Error("db down"));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await sweep()).toBe(0);
  expect(error).toHaveBeenCalled();
});

test("the sweeper runs once at start, then daily, and starts only once", async () => {
  vi.useFakeTimers();
  const { startDeletedUserSweeper } = await load();
  vi.mocked(moderation.purgeExpiredDeletedUsers).mockResolvedValue(0);
  vi.spyOn(console, "log").mockImplementation(() => {});
  startDeletedUserSweeper();
  startDeletedUserSweeper();
  expect(moderation.purgeExpiredDeletedUsers).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
  expect(moderation.purgeExpiredDeletedUsers).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 - 1);
  expect(moderation.purgeExpiredDeletedUsers).toHaveBeenCalledTimes(2);
});
