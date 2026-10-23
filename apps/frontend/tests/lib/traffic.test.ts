// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import {
  createTrafficReporter,
  countryName,
  presetRange,
  trafficChange,
  type TrafficNavigation,
} from "#lib/traffic.js";

const navigation = (extra: Partial<TrafficNavigation> = {}): TrafficNavigation => ({
  enabled: true,
  staff: false,
  status: 200,
  routeId: "/",
  url: new URL("https://blog.test/?q=secret#fragment"),
  from: null,
  referrer: "https://example.org/private?token=secret",
  optedOut: false,
  ...extra,
});

test("calendar presets handle year boundaries and leap years in UTC", () => {
  const now = new Date("2024-03-01T00:00:00Z");
  expect(presetRange("lastMonth", now)).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  expect(presetRange("month", now)).toEqual({ from: "2024-03-01", to: "2024-03-01" });
  expect(presetRange("7d", now)).toEqual({ from: "2024-02-24", to: "2024-03-01" });
  expect(presetRange("lastMonth", new Date("2026-01-05"))).toEqual({ from: "2025-12-01", to: "2025-12-31" });
});
test("growth never divides by zero or implies infinity", () => {
  expect(trafficChange(150, 100)).toBe("+50.0%");
  expect(trafficChange(0, 100)).toBe("-100.0%");
  expect(trafficChange(150, 0)).toBe("No previous traffic");
  expect(trafficChange(0, 0)).toBe("No change");
  expect(countryName("US")).toBe("United States");
  expect(countryName("Unknown")).toBe("Unknown");
});
test("sends only the path and referrer origin with a first-party, best-effort request", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  await createTrafficReporter(fetch)(navigation());
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("/api/traffic/pageview");
  expect(JSON.parse(init?.body as string)).toEqual({ path: "/", referrer: "https://example.org" });
  expect(init).toMatchObject({ keepalive: true, credentials: "omit", referrerPolicy: "no-referrer" });
  expect(init?.headers).toEqual({ "content-type": "application/json" });
});
test.for<Partial<TrafficNavigation>>([
  { enabled: false },
  { staff: true },
  { optedOut: true },
  { status: 404 },
  { routeId: "/admin" },
  { routeId: "/settings" },
  { from: new URL("https://blog.test/?old=query#old") },
])("does not collect %o", async (extra) => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  await createTrafficReporter(fetch)(navigation(extra));
  expect(fetch).not.toHaveBeenCalled();
});
test("queues rapid navigations without sending credentials or introducing identifiers", async () => {
  const { promise: first, resolve: release } = Promise.withResolvers<Response>();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockReturnValueOnce(first)
    .mockResolvedValue(new Response(null, { status: 204 }));
  const report = createTrafficReporter(fetch);
  const a = report(navigation());
  const b = report(
    navigation({ url: new URL("https://blog.test/about"), routeId: "/about", from: new URL("https://blog.test/") }),
  );
  await Promise.resolve();
  expect(fetch).toHaveBeenCalledTimes(1);
  release(new Response(null, { status: 204 }));
  await Promise.all([a, b]);
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [, init] of fetch.mock.calls) {
    expect(init?.credentials).toBe("omit");
    expect(Object.keys(JSON.parse(init?.body as string)).toSorted()).toEqual(["path", "referrer"]);
  }
  expect(JSON.parse(fetch.mock.calls[1][1]?.body as string).referrer).toBe("https://blog.test");
});
test("network failures do not reject navigation or cause retries", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("offline"));
  await expect(createTrafficReporter(fetch)(navigation())).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledOnce();
});
