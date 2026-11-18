// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/instanceSettings.ts"));

import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import {
  getFederationNetwork,
  onInstanceViewsEnabled,
  SETTING_KEYS,
  setFederationNetwork,
  setOnInstanceViewsEnabled,
  setStaffTwoFactorRequired,
  staffTwoFactorRequired,
  twoFactorRequiredFor,
} from "@/services/settings.ts";

test("moderators and admins need two-factor sign-in unless an admin turns it off", async () => {
  vi.mocked(settingsRepo.get).mockResolvedValue(undefined);
  expect(await staffTwoFactorRequired()).toBe(true);
  vi.mocked(settingsRepo.get).mockResolvedValue(false);
  expect(await staffTwoFactorRequired()).toBe(false);
  await setStaffTwoFactorRequired(false);
  expect(settingsRepo.set).toHaveBeenCalledWith("security.staffTwoFactorRequired", false);
});

test("only moderators and admins are ever required to use it", async () => {
  vi.mocked(settingsRepo.get).mockResolvedValue(undefined);
  expect(await twoFactorRequiredFor({ isAdmin: false, isModerator: false })).toBe(false);
  expect(await twoFactorRequiredFor({ isAdmin: false, isModerator: true })).toBe(true);
  expect(await twoFactorRequiredFor({ isAdmin: true, isModerator: false })).toBe(true);
});

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

test("the federation network defaults to auto-caching with FediDB discovery on", async () => {
  vi.mocked(settingsRepo.get).mockResolvedValue(undefined);
  expect(await getFederationNetwork()).toEqual({
    autoCache: true,
    fedidbDiscovery: true,
    syncIntervalHours: 6,
    authorsPerInstance: 20,
  });
});

test("stored federation numbers are clamped and junk falls back to the defaults", async () => {
  vi.mocked(settingsRepo.get).mockResolvedValue({
    autoCache: "yes",
    fedidbDiscovery: false,
    syncIntervalHours: 10_000,
    authorsPerInstance: 0.4,
  });
  expect(await getFederationNetwork()).toEqual({
    autoCache: true,
    fedidbDiscovery: false,
    syncIntervalHours: 168,
    authorsPerInstance: 1,
  });
});

test("a federation patch merges into what is stored", async () => {
  vi.mocked(settingsRepo.get).mockResolvedValue({ syncIntervalHours: 3 });
  await setFederationNetwork({ fedidbDiscovery: false });
  expect(settingsRepo.set).toHaveBeenCalledWith(SETTING_KEYS.federationNetwork, {
    autoCache: true,
    fedidbDiscovery: false,
    syncIntervalHours: 3,
    authorsPerInstance: 20,
  });
});
