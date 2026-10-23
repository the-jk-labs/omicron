// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
vi.mock(import("@/db/repositories/traffic.ts"));
vi.mock(import("@/services/instanceSetup.ts"), () => ({ getOrigin: vi.fn<() => Promise<string>>() }));
vi.mock(import("@/services/settings.ts"));
vi.mock(import("@/services/trafficGeo.ts"));

import * as repo from "@/db/repositories/traffic.ts";
import { REGISTERS } from "@/lib/cardinality.ts";
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

test("persists only register maxima and sanitized aggregate dimensions", async () => {
  expect(
    await recordPageview({
      path: "/search?q=secret",
      referrer: "https://example.org/private?token=secret",
      visitor: "visitor-secret",
      visit: "visit-secret",
      userAgent: browser,
      ip: "test-address",
    }),
  ).toBe(true);
  const call = vi.mocked(repo.record).mock.calls[0];
  expect(call[1]).toMatchObject({ index: expect.any(Number), rank: expect.any(Number) });
  expect(call[3]).toContainEqual({ dimension: "path", value: "/search" });
  expect(call[3]).toContainEqual({ dimension: "referrer", value: "example.org" });
  expect(JSON.stringify(call)).not.toMatch(/secret|test-address|Mozilla/);
});

test("does not measure private or nonexistent content", async () => {
  vi.mocked(repo.publicContentPath).mockResolvedValue(false);
  expect(
    await recordPageview({
      path: "/@alice/private",
      referrer: "",
      visitor: "a",
      visit: "b",
      userAgent: browser,
      ip: "",
    }),
  ).toBe(false);
  expect(repo.record).not.toHaveBeenCalled();
});

test("fills quiet days and merges unique visitors across days and calendar months", async () => {
  const sketch = new Uint8Array(REGISTERS);
  sketch[42] = 3;
  vi.mocked(repo.dailyTotals).mockResolvedValue([
    { day: "2026-01-29", pageviews: 3, visitors: sketch, visits: sketch },
    { day: "2026-01-31", pageviews: 4, visitors: sketch, visits: sketch },
    { day: "2026-02-01", pageviews: 5, visitors: sketch, visits: sketch },
  ]);
  vi.mocked(repo.firstDay).mockResolvedValue("2026-01-29");
  vi.mocked(repo.breakdowns).mockResolvedValue([{ dimension: "path", value: "/", pageviews: 9 }]);
  vi.mocked(geographyAvailable).mockResolvedValue(false);
  const result = await summary(trafficRange("2026-01-30", "2026-02-01", new Date("2026-02-01")));
  expect(result.totals).toEqual({ pageviews: 9, visitors: 1, visits: 1 });
  expect(result.previous).toEqual({ pageviews: 3, visitors: 1, visits: 1 });
  expect(result.series).toHaveLength(3);
  expect(result.series[0]).toMatchObject({ day: "2026-01-30", pageviews: 0 });
  expect(result.monthly).toEqual([
    { day: "2026-01-01", pageviews: 4, visitors: 1, visits: 1 },
    { day: "2026-02-01", pageviews: 5, visitors: 1, visits: 1 },
  ]);
  expect(result.breakdowns.path).toEqual([{ value: "/", pageviews: 9 }]);
});
