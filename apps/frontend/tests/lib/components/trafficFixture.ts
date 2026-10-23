// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TrafficSummary } from "#lib/types.js";
export function trafficSummary(extra: Partial<TrafficSummary> = {}): TrafficSummary {
  return {
    enabled: true,
    geographyAvailable: false,
    firstDay: "2026-01-01",
    range: { from: "2026-01-01", to: "2026-01-02", previousFrom: "2025-12-30", previousTo: "2025-12-31", days: 2 },
    totals: { pageviews: 200, visitors: 50, visits: 75 },
    previous: { pageviews: 100, visitors: 25, visits: 50 },
    series: [
      { day: "2026-01-01", pageviews: 80, visitors: 30, visits: 40 },
      { day: "2026-01-02", pageviews: 120, visitors: 40, visits: 50 },
    ],
    monthly: [{ day: "2026-01-01", pageviews: 200, visitors: 50, visits: 75 }],
    breakdowns: {
      path: [
        { value: "/", pageviews: 150 },
        { value: "/about", pageviews: 50 },
      ],
      referrer: [{ value: "example.org", pageviews: 100 }],
      country: [{ value: "Unknown", pageviews: 200 }],
      device: [{ value: "Mobile", pageviews: 150 }],
      browser: [{ value: "Firefox", pageviews: 125 }],
      os: [{ value: "Android", pageviews: 150 }],
    },
    ...extra,
  };
}
