// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test, vi } from "vitest";
vi.mock(import("@/db/repositories/oauth.ts"));
import * as repo from "@/db/repositories/oauth.ts";

afterEach(() => {
  vi.useRealTimers();
});

test("cleanup errors are contained without logging credentials or database details", async () => {
  const { sweep } = await import("@/services/oauthGc.ts");
  vi.mocked(repo.cleanup).mockRejectedValue(new Error("sensitive database detail"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(sweep()).resolves.toBeUndefined();
  expect(log).toHaveBeenCalledWith("oauth-gc: cleanup failed; the next sweep will retry.");
});

test("starts once, cleans up immediately, then repeats hourly", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const { startOAuthSweeper } = await import("@/services/oauthGc.ts");
  startOAuthSweeper();
  startOAuthSweeper();
  expect(repo.cleanup).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3600_000);
  expect(repo.cleanup).toHaveBeenCalledTimes(2);
});
