// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";

const env = vi.hoisted(() => ({ browser: true }));
vi.mock(import("$app/env"), () => ({
  get browser() {
    return env.browser;
  },
  building: false,
  dev: true,
  version: "test",
}));

async function load() {
  vi.resetModules();
  return (await import("#lib/prefs.svelte.js")).reading;
}

beforeEach(() => {
  env.browser = true;
  localStorage.clear();
});

describe("restoring saved preferences", () => {
  test("valid saved values are restored", async () => {
    localStorage.setItem("default-feed", "local");
    localStorage.setItem("feed-lang-mode", "hide");
    localStorage.setItem("feed-langs", JSON.stringify(["en", 42, "tr"]));
    localStorage.setItem("compose-lang", "az");
    const reading = await load();
    expect(reading.defaultFeed).toBe("local");
    expect(reading.feedLangMode).toBe("hide");
    expect(reading.feedLangs).toEqual(["en", "tr"]);
    expect(reading.composeLang).toBe("az");
  });

  test("tampered or missing values fall back to defaults", async () => {
    localStorage.setItem("default-feed", "trending");
    localStorage.setItem("feed-lang-mode", "maybe");
    localStorage.setItem("feed-langs", "{not json");
    vi.spyOn(navigator, "language", "get").mockReturnValue("tlh-QO");
    const reading = await load();
    expect(reading.defaultFeed).toBe(null);
    expect(reading.feedLangMode).toBe("show");
    expect(reading.feedLangs).toEqual([]);
    expect(reading.composeLang).toBe(null);
  });

  test("the composer language defaults to the browser's, when it is a known one", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("tr-TR");
    expect((await load()).composeLang).toBe("tr");
    localStorage.setItem("feed-langs", JSON.stringify({ not: "an array" }));
    expect((await load()).feedLangs).toEqual([]);
  });

  test("on the server everything is the default", async () => {
    env.browser = false;
    localStorage.setItem("default-feed", "local");
    const reading = await load();
    expect([reading.defaultFeed, reading.feedLangMode, reading.feedLangs, reading.composeLang]).toEqual([
      null,
      "show",
      [],
      null,
    ]);
    reading.setDefaultFeed("global");
    expect(localStorage.getItem("default-feed")).toBe("local");
  });

  test("a browser that blocks storage still gets the defaults", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    const reading = await load();
    expect(reading.defaultFeed).toBe(null);
  });
});

test("changes are applied and persisted", async () => {
  const reading = await load();
  reading.setDefaultFeed("global");
  reading.setFeedLangMode("hide");
  reading.addFeedLang("en");
  reading.addFeedLang("en");
  reading.addFeedLang("tr");
  reading.removeFeedLang("en");
  reading.setComposeLang("az");
  expect(localStorage.getItem("default-feed")).toBe("global");
  expect(localStorage.getItem("feed-lang-mode")).toBe("hide");
  expect(JSON.parse(localStorage.getItem("feed-langs")!)).toEqual(["tr"]);
  expect(localStorage.getItem("compose-lang")).toBe("az");
  reading.setComposeLang(null);
  expect(localStorage.getItem("compose-lang")).toBe(null);
  expect(reading.composeLang).toBe(null);
});

test("the feed query is null when the filter is off, else mode + joined codes", async () => {
  const reading = await load();
  expect(reading.feedLangQuery()).toBe(null);
  reading.addFeedLang("en");
  reading.addFeedLang("tr");
  expect(reading.feedLangQuery()).toEqual({ langMode: "show", langs: "en,tr" });
});
