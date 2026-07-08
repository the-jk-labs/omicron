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

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Date plus 24h hh:mm time, e.g. "Jul 8, 2026, 14:05".
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${formatDate(iso)}, ${time}`;
}