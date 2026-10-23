// SPDX-License-Identifier: AGPL-3.0-or-later
export const TRAFFIC_PRESETS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "month", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "365d", label: "Last 12 months" },
] as const;
export type TrafficPreset = (typeof TRAFFIC_PRESETS)[number]["value"];
const DAY = 86400_000;
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

export function presetRange(preset: TrafficPreset, now = new Date()): { from: string; to: string } {
  if (preset === "month") return { from: `${dayOf(now).slice(0, 7)}-01`, to: dayOf(now) };
  if (preset === "lastMonth")
    return {
      from: dayOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))),
      to: dayOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))),
    };
  const days = Number.parseInt(preset, 10);
  return { from: dayOf(new Date(now.getTime() - (days - 1) * DAY)), to: dayOf(now) };
}

export function trafficChange(current: number, previous: number): string {
  if (!previous) return current ? "No previous traffic" : "No change";
  const percent = ((current - previous) / previous) * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
}

export type TrafficNavigation = {
  enabled: boolean;
  staff: boolean;
  status: number;
  routeId: string | null;
  url: URL;
  from: URL | null;
  referrer: string;
  optedOut: boolean;
};
const PUBLIC_ROUTES = new Set([
  "/",
  "/about",
  "/contact",
  "/privacy",
  "/status",
  "/search",
  "/tags/[tag]",
  "/lists/[id]",
  "/[handle]",
  "/[handle]/[slug]",
]);

export function createTrafficReporter(fetcher: typeof fetch = globalThis.fetch) {
  let queue = Promise.resolve();
  let pending = 0;
  return (navigation: TrafficNavigation): Promise<void> => {
    const { enabled, staff, status, routeId, url, from, optedOut } = navigation;
    if (
      !enabled ||
      staff ||
      optedOut ||
      status !== 200 ||
      !PUBLIC_ROUTES.has(routeId ?? "") ||
      (from && from.pathname === url.pathname) ||
      pending >= 20
    )
      return queue;
    let referrer = "";
    try {
      referrer = from?.origin ?? new URL(navigation.referrer).origin;
    } catch {
      /* An empty referrer is a direct visit. */
    }
    const body = JSON.stringify({ path: url.pathname, referrer });
    pending++;
    // Bound pending work so measurement never overwhelms navigation.
    const send = async () => {
      try {
        await fetcher("/api/traffic/pageview", {
          method: "POST",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        /* Analytics must never interrupt navigation or retry and double-count. */
      } finally {
        pending--;
      }
    };
    queue = queue.then(send);
    return queue;
  };
}
