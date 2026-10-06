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

const composeCookie = () => document.cookie.match(/(?:^|; )compose-lang=([^;]*)/)?.[1] ?? null;

beforeEach(() => {
  env.browser = true;
  localStorage.clear();
  document.cookie = "compose-lang=; path=/; max-age=0";
  document.cookie = "default-feed=; path=/; max-age=0";
});

describe("restoring saved preferences", () => {
  test("valid saved values are restored", async () => {
    document.cookie = "default-feed=local; path=/";
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
    document.cookie = "default-feed=trending; path=/";
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
    document.cookie = "default-feed=local; path=/";
    const reading = await load();
    expect([reading.defaultFeed, reading.feedLangMode, reading.feedLangs, reading.composeLang]).toEqual([
      null,
      "show",
      [],
      null,
    ]);
    reading.setDefaultFeed("global");
    expect(document.cookie).toContain("default-feed=local");
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
  expect(document.cookie).toContain("default-feed=global");
  expect(localStorage.getItem("feed-lang-mode")).toBe("hide");
  expect(JSON.parse(localStorage.getItem("feed-langs")!)).toEqual(["tr"]);
  expect(localStorage.getItem("compose-lang")).toBe("az");
  reading.setComposeLang(null);
  expect(localStorage.getItem("compose-lang")).toBe(null);
  expect(reading.composeLang).toBe(null);
});

test("the composer language is also kept in a cookie, so the server renders it", async () => {
  const reading = await load();
  reading.setComposeLang("az");
  expect(composeCookie()).toBe("az");
  reading.setComposeLang(null);
  expect(composeCookie()).toBe(null);
});

test("the feed query is null when the filter is off, else mode + joined codes", async () => {
  const reading = await load();
  expect(reading.feedLangQuery()).toBe(null);
  reading.addFeedLang("en");
  reading.addFeedLang("tr");
  expect(reading.feedLangQuery()).toEqual({ langMode: "show", langs: "en,tr" });
});
