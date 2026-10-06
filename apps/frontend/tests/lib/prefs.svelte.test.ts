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
  for (const name of ["default-feed", "feed-lang-mode", "feed-langs", "feed-lang-card-dismissed"])
    document.cookie = `${name}=; path=/; max-age=0`;
});

const cookie = (name: string) => document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1] ?? null;

describe("restoring saved preferences", () => {
  test("valid saved values are restored", async () => {
    document.cookie = "default-feed=local; path=/";
    document.cookie = "feed-lang-mode=hide; path=/";
    document.cookie = `feed-langs=${encodeURIComponent("en,xx,tr,en")}; path=/`;
    document.cookie = "feed-lang-card-dismissed=1; path=/";
    localStorage.setItem("compose-lang", "az");
    const reading = await load();
    expect(reading.defaultFeed).toBe("local");
    expect(reading.feedLangMode).toBe("hide");
    expect(reading.feedLangs).toEqual(["en", "tr"]);
    expect(reading.feedLangCardDismissed).toBe(true);
    expect(reading.composeLang).toBe("az");
  });

  test("tampered or missing values fall back to defaults", async () => {
    document.cookie = "default-feed=trending; path=/";
    document.cookie = "feed-lang-mode=maybe; path=/";
    document.cookie = "feed-langs=%7Bnot json; path=/";
    vi.spyOn(navigator, "language", "get").mockReturnValue("tlh-QO");
    const reading = await load();
    expect(reading.defaultFeed).toBe(null);
    expect(reading.feedLangMode).toBe("show");
    expect(reading.feedLangs).toEqual([]);
    expect(reading.feedLangCardDismissed).toBe(false);
    expect(reading.composeLang).toBe(null);
  });

  test("the composer language defaults to the browser's, when it is a known one", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("tr-TR");
    expect((await load()).composeLang).toBe("tr");
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
  reading.dismissFeedLangCard();
  expect(cookie("default-feed")).toBe("global");
  expect(cookie("feed-lang-mode")).toBe("hide");
  expect(cookie("feed-langs")).toBe("tr");
  expect(cookie("feed-lang-card-dismissed")).toBe("1");
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
