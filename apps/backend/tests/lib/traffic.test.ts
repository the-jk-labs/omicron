// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { referrerHost, technology, trafficBot, trafficPath, trafficRange } from "@/lib/traffic.ts";

test.for([
  "/",
  "/about",
  "/search",
  "/@alice",
  "/@alice/hello-world",
  "/tags/svelte",
  "/@bob@remote.test",
  "/@bob@remote.test/01234567",
  "/lists/reading-01234567",
])("accepts public path %s", (path) => {
  expect(trafficPath(path)).toBe(path);
});
test.for([
  "/admin",
  "/settings",
  "/api/auth",
  "/compose",
  "/notifications",
  "/lists/private-id",
  "/oauth/authorize",
  "//evil.test/",
  "https://evil.test/",
  "/@alice/a%2fb",
  "/@alice/%00",
  "/%invalid",
  "/@alice\\secret",
])("excludes private or malformed path %s", (path) => {
  expect(trafficPath(path)).toBeNull();
});
test("strips search terms, tokens and fragments, and normalizes trailing slashes", () => {
  expect(trafficPath("/search?q=private#secret")).toBe("/search");
  expect(trafficPath("/about/")).toBe("/about");
});
test("keeps only an external hostname, never referrer paths or query strings", () => {
  expect(referrerHost("https://www.example.org/private?token=secret", "https://blog.test")).toBe("example.org");
  for (const input of [
    "",
    "garbage",
    "https://blog.test/private",
    "file:///secret",
    "http://127.0.0.1/private",
    "http://[::1]/",
  ]) {
    expect(referrerHost(input, "https://blog.test")).toBe("Direct / internal");
  }
});
test("parses broad technology categories, not raw user agents", () => {
  expect(
    technology(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    ),
  ).toEqual({ device: "Mobile", browser: "Mobile Safari", os: "iOS" });
});
test.for(["", "Googlebot/2.1", "curl/8.1", "Mastodon/4.3.7", "HeadlessChrome/130.0"])("filters %s", (agent) =>
  expect(trafficBot(agent)).toBe(true),
);
test("does not call a normal browser a bot", () =>
  expect(trafficBot("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0")).toBe(false));

const now = new Date("2026-03-01T02:00:00Z");
test("date ranges are inclusive UTC dates with an adjacent equal-length comparison", () => {
  expect(trafficRange("2026-02-01", "2026-02-28", now)).toEqual({
    from: "2026-02-01",
    to: "2026-02-28",
    previousFrom: "2026-01-04",
    previousTo: "2026-01-31",
    days: 28,
  });
  expect(trafficRange(undefined, undefined, now).days).toBe(30);
});
test.for([
  ["2026-02-30", "2026-03-01"],
  ["2026-03-01", "2026-02-28"],
  ["2026-03-01", "2026-03-02"],
  ["2024-01-01", "2026-03-01"],
  ["x", "x"],
])("rejects invalid range %o", ([from, to]) => {
  expect(() => trafficRange(from, to, now)).toThrow(/calendar dates|Choose/);
});
