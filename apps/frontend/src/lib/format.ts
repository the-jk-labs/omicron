// SPDX-License-Identifier: AGPL-3.0-or-later
// Small presentation helpers shared across feed/profile/post views.

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function excerpt(html: string, len = 180): string {
  const text = stripHtml(html);
  return text.length > len ? `${text.slice(0, len).trimEnd()}…` : text;
}

// Rough Medium-style read time (~200 words/min, floored at 1).
export function readTime(html: string): number {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// Every date helper below takes the zone to render in rather than reading the
// runtime default, because the two runtimes disagree: the server is UTC, the
// reader's browser is wherever they are. Left to the default the same timestamp
// renders one way in the server's HTML and another on hydration, and the reader
// sees it change under them. `$lib/timezone` resolves the zone to pass in.
//
// The locale is pinned for the same reason — the server's default locale is not
// the browser's, and an unpinned one turns "Aug 3, 2026" into "3 avq 2026" on
// hydration. The UI is English throughout, so en-US is the honest choice.
const LOCALE = "en-US";

export function formatDate(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

// Compact relative time, e.g. "now", "5m", "3h", "2d", falling back to an
// absolute date past a week. Used where space is tight (notification rows).
export function timeAgo(iso: string, timeZone?: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return formatDate(iso, timeZone);
}

// Date plus 24h hh:mm time, e.g. "Jul 8, 2026, 14:05".
export function formatDateTime(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
  return `${formatDate(iso, timeZone)}, ${time}`;
}