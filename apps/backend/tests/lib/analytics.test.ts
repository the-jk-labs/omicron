// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  anonVisitorKey,
  isBot,
  readerOptedOut,
  today,
  userVisitorKey,
  VIEW_COOKIE,
  VIEW_COOKIE_TTL_MS,
} from "@/lib/analytics.ts";

describe("today", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns the UTC calendar date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T23:59:59.999Z"));
    expect(today()).toBe("2026-03-04");
  });

  test("rolls over at UTC midnight, not local midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T00:00:00.000Z"));
    expect(today()).toBe("2026-03-05");
  });
});

describe("visitor keys", () => {
  test("are stable for the same input", async () => {
    expect(await userVisitorKey("user-1")).toBe(await userVisitorKey("user-1"));
    expect(await anonVisitorKey("cookie-1")).toBe(await anonVisitorKey("cookie-1"));
  });

  test("are namespaced so a user id never collides with a cookie value", async () => {
    const u = await userVisitorKey("same");
    const a = await anonVisitorKey("same");
    expect(u).toMatch(/^u:[0-9a-f]{64}$/);
    expect(a).toMatch(/^a:[0-9a-f]{64}$/);
    expect(u).not.toBe(a);
  });

  test("never contain the raw identifier", async () => {
    const key = await userVisitorKey("8f14e45f-ceea-467a-9575-1c3f5f1e2a5b");
    expect(key).not.toContain("8f14e45f");
  });

  test("differ for different inputs", async () => {
    expect(await anonVisitorKey("a")).not.toBe(await anonVisitorKey("b"));
  });

  test("are keyed with the session secret, not a bare hash", async () => {
    const bare = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("user-1"));
    const bareHex = [...new Uint8Array(bare)].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(await userVisitorKey("user-1")).not.toBe(`u:${bareHex}`);
  });
});

describe("readerOptedOut", () => {
  test.for([
    [{ dnt: "1" }, true],
    [{ "sec-gpc": "1" }, true],
    [{ dnt: "1", "sec-gpc": "1" }, true],
    [{ dnt: "0" }, false],
    [{ "sec-gpc": "0" }, false],
    [{}, false],
  ] as const)("%o -> %s", ([headers, expected]) => {
    expect(readerOptedOut(new Headers(headers))).toBe(expected);
  });
});

describe("isBot", () => {
  test.for([
    "",
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0)",
    "Slurp",
    "facebookexternalhit/1.1 Preview",
    "curl/8.4.0",
    "Wget/1.21",
    "Mozilla/5.0 HeadlessChrome/120.0",
    "Mastodon/4.3 (http.rb/5.1; +https://mastodon.social/) Fetcher",
    "UptimeRobot/2.0 monitor",
  ])("flags %j as a bot", (ua) => {
    expect(isBot(ua)).toBe(true);
  });

  test.for([
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
  ])("lets a real browser through: %s", (ua) => {
    expect(isBot(ua)).toBe(false);
  });
});

test("the reader cookie lives exactly 400 days (the browser cap)", () => {
  expect(VIEW_COOKIE).toBe("omicron_reader");
  expect(VIEW_COOKIE_TTL_MS).toBe(400 * 24 * 60 * 60 * 1000);
});
