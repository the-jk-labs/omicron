// SPDX-License-Identifier: AGPL-3.0-or-later
import { isIP } from "node:net";
import { isbot } from "isbot";
import { UAParser } from "ua-parser-js";

export const TRAFFIC_VISITOR_COOKIE = "omicron_traffic_visitor";
export const TRAFFIC_VISIT_COOKIE = "omicron_traffic_visit";
export const VISITOR_MAX_AGE = 400 * 86400;
export const VISIT_MAX_AGE = 30 * 60;
export const TRAFFIC_RETENTION_DAYS = 730;
export const DAY_MS = 86400_000;
export const isoDay = (date = new Date()): string => date.toISOString().slice(0, 10);
export const shiftDay = (day: string, days: number): string => isoDay(new Date(Date.parse(day) + days * DAY_MS));

const STATIC_PATHS = new Set(["/", "/about", "/contact", "/privacy", "/status", "/search"]);
const unsafeCharacters = (value: string) =>
  value.includes("\\") || value.split("").some((char) => char.charCodeAt(0) < 32);

// Only public reader routes; never search terms, tokens, account/admin paths or URL fragments.
export function trafficPath(input: string): string | null {
  if (input.length > 512 || !input.startsWith("/") || input.startsWith("//") || unsafeCharacters(input)) return null;
  let path: string;
  try {
    path = decodeURI(new URL(input, "https://traffic.invalid").pathname).replace(/\/$/, "") || "/";
  } catch {
    return null;
  }
  if (/[?#%]/.test(path) || unsafeCharacters(path) || path.length > 300) return null;
  if (STATIC_PATHS.has(path)) return path;
  if (/^\/tags\/[^/@]+$/.test(path)) return path;
  if (/^\/@[^/]+(?:\/[^/]+)?$/.test(path)) return path;
  if (/^\/lists\/(?:[a-z0-9-]+-)?[a-f0-9]{8}$/i.test(path)) return path;
  return null;
}

export function referrerHost(input: string, ownOrigin: string): string {
  try {
    const url = new URL(input);
    if (!["https:", "http:"].includes(url.protocol) || url.origin === ownOrigin) return "Direct / internal";
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (isIP(hostname.replace(/^\[|\]$/g, "")) || hostname === "localhost" || !hostname.includes("."))
      return "Direct / internal";
    return hostname.slice(0, 253);
  } catch {
    return "Direct / internal";
  }
}

export function trafficBot(userAgent: string): boolean {
  return !userAgent || isbot(userAgent) || /mastodon|pleroma|misskey|akkoma|fedify|headless/i.test(userAgent);
}

export function technology(userAgent: string): { device: string; browser: string; os: string } {
  const parsed = UAParser(userAgent.slice(0, 1024));
  const device =
    parsed.device.type === "mobile"
      ? "Mobile"
      : parsed.device.type === "tablet"
        ? "Tablet"
        : parsed.device.type
          ? "Other"
          : "Desktop";
  return { device, browser: parsed.browser.name || "Unknown", os: parsed.os.name || "Unknown" };
}

export type TrafficRange = { from: string; to: string; previousFrom: string; previousTo: string; days: number };

export function trafficRange(from?: string, to?: string, now = new Date()): TrafficRange {
  const today = isoDay(now);
  const end = to ?? today;
  const start = from ?? shiftDay(end, -29);
  const valid = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && isoDay(new Date(value)) === value;
  if (!valid(start) || !valid(end)) throw new Error("Use calendar dates in YYYY-MM-DD format.");
  const days = (Date.parse(end) - Date.parse(start)) / DAY_MS + 1;
  if (days < 1 || days > 365 || end > today || start < shiftDay(today, -(TRAFFIC_RETENTION_DAYS - 1))) {
    throw new Error("Choose 1–365 days within the last 730 days, ending no later than today (UTC).");
  }
  return { from: start, to: end, previousFrom: shiftDay(start, -days), previousTo: shiftDay(start, -1), days };
}
