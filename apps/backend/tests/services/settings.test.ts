// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/instanceSettings.ts"));

import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { onInstanceViewsEnabled, SETTING_KEYS, setOnInstanceViewsEnabled } from "@/services/settings.ts";

test("on-instance view counting is on by default", async () => {
  vi.mocked(settingsRepo.get).mockResolvedValue(undefined);
  expect(await onInstanceViewsEnabled()).toBe(true);
  expect(settingsRepo.get).toHaveBeenCalledWith("analytics.onInstanceViews");
});

test.for([true, false])("reads a stored %s", async (stored) => {
  vi.mocked(settingsRepo.get).mockResolvedValue(stored);
  expect(await onInstanceViewsEnabled()).toBe(stored);
});

test("a stored null still means the default (on)", async () => {
  vi.mocked(settingsRepo.get).mockResolvedValue(null);
  expect(await onInstanceViewsEnabled()).toBe(true);
});

test("setting the flag writes the documented key", async () => {
  await setOnInstanceViewsEnabled(false);
  expect(settingsRepo.set).toHaveBeenCalledWith(SETTING_KEYS.analyticsOnInstanceViews, false);
});
