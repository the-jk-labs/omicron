// SPDX-License-Identifier: AGPL-3.0-or-later
// Small presentation helpers shared across feed/profile/post views.

// Turning markup back into text means undoing its escaping too. A body holding
// `5 &lt; 7` or `it&#39;s` is displaying those characters, not those entities —
// leaving them encoded put the raw `&lt;` in front of the reader, in every card
// excerpt and every link preview. The set is small on purpose: these five plus
// numeric escapes are what an HTML serializer emits, and anything else is left
// as written rather than guessed at.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    const lower = body.toLowerCase();
    if (lower[0] !== "#") return NAMED_ENTITIES[lower] ?? match;
    const code = lower[1] === "x" ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    // A code point outside Unicode would throw; leave the escape as written.
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

/** Markup to the plain text it renders as — tags dropped, entities decoded. */
export function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function excerpt(html: string, len = 180): string {
  const text = stripHtml(html);
  return text.length > len ? `${text.slice(0, len).trimEnd()}…` : text;
}

// Rough Medium-style read time (~200 words/min, floored at 1).
export function readTime(html: string): number {
  return readTimeFromWords(countWords(stripHtml(html)));
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// Split out so the editor's live counter and the reader's badge cannot drift:
// the editor has the words already and would otherwise re-derive them from its
// own HTML with a second, subtly different rule.
export function readTimeFromWords(words: number): number {
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

// 24h hh:mm clock time, e.g. "14:05". Separate from `formatDateTime` so a
// caller that has room for the day but not the time — a feed card on a phone —
// can drop just the time rather than reformatting the whole stamp.
export function formatTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
}

// Date plus 24h hh:mm time, e.g. "Jul 8, 2026, 14:05".
export function formatDateTime(iso: string, timeZone?: string): string {
  return `${formatDate(iso, timeZone)}, ${formatTime(iso, timeZone)}`;
}

// The forward-looking counterpart to `timeAgo`, and deliberately wordier: this
// one appears where the reader is deciding whether a time is what they meant
// ("in 2 days"), not scanning a list of things that already happened.
export function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "any moment now";
  const m = Math.round(ms / 60_000);
  if (m < 1) return "in under a minute";
  if (m < 60) return `in ${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  if (h < 24) return `in ${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  if (d < 14) return `in ${d} day${d === 1 ? "" : "s"}`;
  const w = Math.round(d / 7);
  if (w < 9) return `in ${w} week${w === 1 ? "" : "s"}`;
  const mo = Math.round(d / 30);
  return `in ${mo} month${mo === 1 ? "" : "s"}`;
}

// The unabbreviated form — "Thursday, 21 August 2026 at 09:00". Used where the
// reader is confirming a time they are about to commit to rather than glancing
// at one, so nothing is shortened: the weekday is spelled out because "is that
// a Thursday?" is exactly the question someone scheduling a post asks.
export function formatScheduleLong(iso: string, timeZone?: string): string {
  const date = new Date(iso).toLocaleDateString(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  });
  return `${date} at ${formatTime(iso, timeZone)}`;
}

// The zone a time is being read in, as a short offset like "GMT+4". Shown
// beside any time the author is choosing: a schedule is the one place where
// "09:00 in whose morning?" has a wrong answer.
export function zoneLabel(timeZone?: string): string {
  const parts = new Intl.DateTimeFormat(LOCALE, { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date());
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}
