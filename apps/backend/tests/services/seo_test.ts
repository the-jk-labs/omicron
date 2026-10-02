// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/instanceSettings.ts"));

import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { getSeoSettings, setSeoSettings, VERIFICATION_ENGINES } from "@/services/seo.ts";

let settings: Record<string, unknown>;

beforeEach(() => {
  settings = {};
  vi.mocked(settingsRepo.get).mockImplementation(async (key: string) => settings[key]);
  vi.mocked(settingsRepo.set).mockImplementation(async (key: string, value: unknown) => {
    settings[key] = value;
  });
});

describe("getSeoSettings", () => {
  test("defaults: indexable, no verification, IndexNow off", async () => {
    expect(await getSeoSettings()).toEqual({
      indexingEnabled: true,
      verification: {},
      indexNowEnabled: false,
      indexNowKey: null,
    });
  });

  test("drops unknown engines and blank tokens from stored verification", async () => {
    settings["seo.verification"] = { google: "  g-token ", bing: "   ", altavista: "x", yandex: 42 };
    expect((await getSeoSettings()).verification).toEqual({ google: "g-token" });
  });

  test("tolerates a corrupt stored verification value", async () => {
    settings["seo.verification"] = "not an object";
    expect((await getSeoSettings()).verification).toEqual({});
  });
});

describe("setSeoSettings", () => {
  test("a partial update leaves the other settings alone", async () => {
    settings["seo.verification"] = { google: "keep" };
    await setSeoSettings({ indexingEnabled: false });
    expect(settings).toEqual({ "seo.verification": { google: "keep" }, "seo.indexingEnabled": false });
  });

  test("verification is cleaned before it is stored", async () => {
    await setSeoSettings({ verification: { google: " g ", bing: "" } });
    expect(settings["seo.verification"]).toEqual({ google: "g" });
  });

  test("the first enable mints a 32-hex IndexNow key", async () => {
    await setSeoSettings({ indexNowEnabled: true });
    expect(settings["seo.indexNowEnabled"]).toBe(true);
    expect(settings["seo.indexNowKey"]).toMatch(/^[0-9a-f]{32}$/);
  });

  test("the key survives disable and re-enable", async () => {
    await setSeoSettings({ indexNowEnabled: true });
    const key = settings["seo.indexNowKey"];
    await setSeoSettings({ indexNowEnabled: false });
    await setSeoSettings({ indexNowEnabled: true });
    expect(settings["seo.indexNowKey"]).toBe(key);
  });

  test("disabling never mints a key", async () => {
    await setSeoSettings({ indexNowEnabled: false });
    expect(settings).not.toHaveProperty("seo.indexNowKey");
  });
});

test("each engine maps to the meta name its search console expects", () => {
  expect(VERIFICATION_ENGINES).toEqual({
    google: "google-site-verification",
    bing: "msvalidate.01",
    yandex: "yandex-verification",
  });
});
