// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
vi.mock(import("@/db/repositories/traffic.ts"));
vi.mock(import("@/services/instanceSetup.ts"), () => ({ getOrigin: vi.fn<() => Promise<string>>() }));
vi.mock(import("@/services/settings.ts"));
vi.mock(import("@/services/trafficGeo.ts"));

import * as repo from "@/db/repositories/traffic.ts";
import { trafficRange } from "@/lib/traffic.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { trafficEnabled } from "@/services/settings.ts";
import { acceptsTraffic, recordPageview, summary } from "@/services/traffic.ts";
import { countryOf, geographyAvailable } from "@/services/trafficGeo.ts";

const browser = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";
beforeEach(() => {
  vi.mocked(getOrigin).mockResolvedValue("https://blog.test");
  vi.mocked(trafficEnabled).mockResolvedValue(true);
  vi.mocked(repo.publicContentPath).mockResolvedValue(true);
  vi.mocked(countryOf).mockResolvedValue("Unknown");
});

test("requires explicit collection enablement, same origin, a browser, and no privacy opt-out", async () => {
  const headers = { origin: "https://blog.test", "user-agent": browser };
  expect(await acceptsTraffic(new Headers(headers))).toBe(true);
  const overrides: Record<string, string>[] = [
    { dnt: "1" },
    { "sec-gpc": "1" },
    { origin: "https://evil.test" },
    { "user-agent": "curl/8.1" },
  ];
  for (const extra of overrides) {
    expect(await acceptsTraffic(new Headers({ ...headers, ...extra }))).toBe(false);
  }
  vi.mocked(trafficEnabled).mockResolvedValue(false);
  expect(await acceptsTraffic(new Headers(headers))).toBe(false);
});

test("persists only a date and independent sanitized dimensions, without reader identifiers", async () => {
  expect(
    await recordPageview({
      path: "/search?q=secret",
      referrer: "https://example.org/private?token=secret",
      userAgent: browser,
      ip: "test-address",
    }),
  ).toBe(true);
  const call = vi.mocked(repo.record).mock.calls[0];
  expect(call).toHaveLength(2);
  expect(call[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(call[1]).toContainEqual({ dimension: "path", value: "/search" });
  expect(call[1]).toContainEqual({ dimension: "referrer", value: "example.org" });
  expect(call[1]).toContainEqual({ dimension: "country", value: "Unknown" });
  expect(JSON.stringify(call)).not.toMatch(/secret|test-address|Mozilla/);
});

test("does not measure private or nonexistent content", async () => {
  vi.mocked(repo.publicContentPath).mockResolvedValue(false);
  expect(
    await recordPageview({
      path: "/@alice/private",
      referrer: "",
      userAgent: browser,
      ip: "",
    }),
  ).toBe(false);
  expect(repo.record).not.toHaveBeenCalled();
});

test("fills quiet days and sums pageviews across days and partial calendar months", async () => {
  vi.mocked(repo.dailyTotals).mockResolvedValue([
    { day: "2026-01-29", pageviews: 3 },
    { day: "2026-01-31", pageviews: 4 },
    { day: "2026-02-01", pageviews: 5 },
  ]);
  vi.mocked(repo.firstDay).mockResolvedValue("2026-01-29");
  vi.mocked(repo.breakdowns).mockResolvedValue([{ dimension: "path", value: "/", pageviews: 9 }]);
  vi.mocked(geographyAvailable).mockResolvedValue(false);
  const result = await summary(trafficRange("2026-01-30", "2026-02-01", new Date("2026-02-01")));
  expect(result.totals).toEqual({ pageviews: 9 });
  expect(result.previous).toEqual({ pageviews: 3 });
  expect(result.series).toHaveLength(3);
  expect(result.series[0]).toMatchObject({ day: "2026-01-30", pageviews: 0 });
  expect(result.monthly).toEqual([
    { day: "2026-01-01", pageviews: 4 },
    { day: "2026-02-01", pageviews: 5 },
  ]);
  expect(result.breakdowns.path).toEqual([{ value: "/", pageviews: 9 }]);
});

test("empty reports expose zero pageviews, never invented visitor or visit estimates", async () => {
  vi.mocked(repo.dailyTotals).mockResolvedValue([]);
  vi.mocked(repo.breakdowns).mockResolvedValue([]);
  vi.mocked(repo.firstDay).mockResolvedValue(null);
  const result = await summary(trafficRange("2026-02-01", "2026-02-01", new Date("2026-02-01")));
  expect(result.totals).toEqual({ pageviews: 0 });
  expect(result.previous).toEqual({ pageviews: 0 });
  expect(result.series).toEqual([{ day: "2026-02-01", pageviews: 0 }]);
  expect(result.monthly).toEqual([{ day: "2026-02-01", pageviews: 0 }]);
  expect(JSON.stringify(result)).not.toMatch(/visitors|visits/);
});
