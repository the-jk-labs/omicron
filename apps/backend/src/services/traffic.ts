// SPDX-License-Identifier: AGPL-3.0-or-later
import * as trafficRepo from "@/db/repositories/traffic.ts";
import { type TrafficDimension } from "@/db/schema.ts";
import { readerOptedOut } from "@/lib/analytics.ts";
import {
  isoDay,
  referrerHost,
  shiftDay,
  technology,
  trafficBot,
  trafficPath,
  TRAFFIC_RETENTION_DAYS,
  type TrafficRange,
} from "@/lib/traffic.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { trafficEnabled } from "@/services/settings.ts";
import { countryOf, geographyAvailable } from "@/services/trafficGeo.ts";

export async function acceptsTraffic(headers: Headers): Promise<boolean> {
  if (readerOptedOut(headers) || trafficBot(headers.get("user-agent") ?? "")) return false;
  if (headers.get("origin") !== (await getOrigin())) return false;
  return trafficEnabled();
}

export async function recordPageview(input: {
  path: string;
  referrer: string;
  userAgent: string;
  ip: string;
}): Promise<boolean> {
  const path = trafficPath(input.path);
  if (!path || !(await trafficRepo.publicContentPath(path))) return false;
  const tech = technology(input.userAgent);
  const dimensions: { dimension: Exclude<TrafficDimension, "total">; value: string }[] = [
    { dimension: "path", value: path },
    { dimension: "referrer", value: referrerHost(input.referrer, await getOrigin()) },
    { dimension: "country", value: await countryOf(input.ip) },
    ...Object.entries(tech).map(([dimension, value]) => ({
      dimension: dimension as "device" | "browser" | "os",
      value,
    })),
  ];
  await trafficRepo.record(isoDay(), dimensions);
  return true;
}

export type TrafficMetrics = { pageviews: number };
export type TrafficPoint = TrafficMetrics & { day: string };
export type TrafficSummary = {
  enabled: boolean;
  geographyAvailable: boolean;
  firstDay: string | null;
  range: TrafficRange;
  totals: TrafficMetrics;
  previous: TrafficMetrics;
  series: TrafficPoint[];
  monthly: TrafficPoint[];
  breakdowns: Record<Exclude<TrafficDimension, "total">, { value: string; pageviews: number }[]>;
};

type DailyRow = Awaited<ReturnType<typeof trafficRepo.dailyTotals>>[number];
function metrics(rows: DailyRow[]): TrafficMetrics {
  return { pageviews: rows.reduce((total, row) => total + row.pageviews, 0) };
}

export async function summary(range: TrafficRange): Promise<TrafficSummary> {
  const [enabled, geography, firstDay, rows, breakdowns] = await Promise.all([
    trafficEnabled(),
    geographyAvailable(),
    trafficRepo.firstDay(),
    trafficRepo.dailyTotals(range.previousFrom, range.to),
    trafficRepo.breakdowns(range.from, range.to),
  ]);
  const current = rows.filter((r) => r.day >= range.from);
  const grouped: TrafficSummary["breakdowns"] = {
    path: [],
    referrer: [],
    country: [],
    device: [],
    browser: [],
    os: [],
  };
  for (const row of breakdowns) grouped[row.dimension].push({ value: row.value, pageviews: row.pageviews });
  for (const list of Object.values(grouped))
    list.sort((a, b) => b.pageviews - a.pageviews || a.value.localeCompare(b.value));
  const byDay = new Map(current.map((r) => [r.day, r]));
  const series = Array.from({ length: range.days }, (_, i) => {
    const day = shiftDay(range.from, i);
    const row = byDay.get(day);
    return { day, ...metrics(row ? [row] : []) };
  });
  const months = [...new Set(series.map((r) => r.day.slice(0, 7)))];
  return {
    enabled,
    geographyAvailable: geography,
    firstDay,
    range,
    totals: metrics(current),
    previous: metrics(rows.filter((r) => r.day < range.from)),
    series,
    monthly: months.map((month) => ({
      day: `${month}-01`,
      ...metrics(current.filter((r) => r.day.startsWith(month))),
    })),
    breakdowns: Object.fromEntries(
      Object.entries(grouped).map(([key, list]) => [key, list.slice(0, key === "country" ? 250 : 20)]),
    ) as TrafficSummary["breakdowns"],
  };
}

let started = false;
const sweep = () =>
  trafficRepo
    .prune(shiftDay(isoDay(), -(TRAFFIC_RETENTION_DAYS - 1)))
    .catch(() => console.error("traffic: aggregate retention cleanup failed; will retry."));
export function startTrafficSweeper() {
  if (started) return;
  started = true;
  void sweep();
  setInterval(() => void sweep(), 86400_000);
}
