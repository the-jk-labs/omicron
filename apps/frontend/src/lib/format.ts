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

// A heading written `#UserID` — no space after the marker — is not an ATX
// heading as far as the markdown renderer is concerned, so it renders as a
// literal `#` at the start of a paragraph rather than a heading. That hash is
// Markdown syntax, not prose, and it leaked into the excerpt ("#UserID The user
// ID …"). Drop it here. Anchoring the strip to a block-level opening tag —
// never `<pre>`/`<code>` — leaves a genuine `#` untouched, whether that is
// `#include` inside a code fence or a hashtag mid-prose.
function stripHeadingMarkers(html: string): string {
  return html.replace(/(<(?:p|li|blockquote|td|th)(?:\s[^>]*)?>)\s*#{1,6}(?=\S)/g, "$1");
}

// Clipped at a word boundary, not at the character the limit happens to land
// on: a slice mid-word ("the functions open, read, wri…") reads as damage
// rather than as an abbreviation, and this text is the card excerpt, the
// og:description on every share and the RSS item description.
//
// The rule is the backend's `summarize` (lib/webhook.ts), deliberately: an
// ingested post carries a summary derived there and an editor-written one is
// summarized here, and the two sit side by side in the same feed. Keep them
// the same shape. A short last word is dropped; a boundary that would throw
// away more than 40% of the allowance is ignored and the hard cut kept, so a
// single very long token can't collapse the excerpt to nothing. Trailing
// punctuation goes before the ellipsis so it doesn't read as ",…".
export function excerpt(html: string, len = 180): string {
  const text = stripHtml(stripHeadingMarkers(html));
  if (text.length <= len) return text;
  const clipped = text.slice(0, len);
  const lastSpace = clipped.lastIndexOf(" ");
  const head = lastSpace > len * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return `${head.replace(/[\s.,;:!?-]+$/, "")}…`;
}

// A counter as a phrase — "2 likes", "1 response" — for tooltips and
// screen-reader labels, where the bare number the counter shows ("2") names
// nothing on its own.
export function countLabel(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
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
// Locale is the same story — the server's default is not the browser's, and an
// unpinned one turns "Aug 3, 2026" into "3 avq 2026" on hydration. Every helper
// therefore takes an explicit `locale` (from `$lib/locale`, which mirrors the
// timezone cookie/Accept-Language dance) and falls back to `en-US` only when
// nothing was resolved yet. Callers should pass `$locale` alongside `$timeZone`.
const FALLBACK_LOCALE = "en-US";

export function formatDate(iso: string, timeZone?: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale ?? FALLBACK_LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

// Compact relative time, e.g. "now", "5m", "3h", "2d", falling back to an
// absolute date past a week. Used where space is tight (notification rows).
// `locale` only affects the absolute fallback (the compact tokens are
// language-agnostic).
export function timeAgo(iso: string, timeZone?: string, locale?: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return formatDate(iso, timeZone, locale);
}

// Localized, human relative time — e.g. "2 days ago", "2 gün əvvəl",
// "vor 2 Tagen" via `Intl.RelativeTimeFormat`. Used where the spec asks for
// nisbi zaman rather than the compact `timeAgo` above.
export function formatRelative(iso: string, locale?: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const sec = Math.round(diffMs / 1000);
  const absSec = Math.abs(sec);
  const loc = locale ?? FALLBACK_LOCALE;
  try {
    const rtf = new Intl.RelativeTimeFormat(loc, { numeric: "auto" });
    if (absSec < 60) return rtf.format(sec, "second");
    const min = Math.round(sec / 60);
    if (Math.abs(min) < 60) return rtf.format(min, "minute");
    const hr = Math.round(sec / 3600);
    if (Math.abs(hr) < 24) return rtf.format(hr, "hour");
    const day = Math.round(sec / 86400);
    if (Math.abs(day) < 7) return rtf.format(day, "day");
    const week = Math.round(sec / 604800);
    if (Math.abs(week) < 5) return rtf.format(week, "week");
    const month = Math.round(sec / 2629746);
    if (Math.abs(month) < 12) return rtf.format(month, "month");
    const year = Math.round(sec / 31556952);
    return rtf.format(year, "year");
  } catch {
    // Fallback for unknown locale — fall back to compact timeAgo logic.
    return timeAgo(iso, undefined, loc);
  }
}

// 24h hh:mm clock time, e.g. "14:05". Separate from `formatDateTime` so a
// caller that has room for the day but not the time — a feed card on a phone —
// can drop just the time rather than reformatting the whole stamp.
export function formatTime(iso: string, timeZone?: string, locale?: string): string {
  return new Date(iso).toLocaleTimeString(locale ?? FALLBACK_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
}

// Date plus 24h hh:mm time — e.g. "Aug 18, 2026, 13:40" in en-US or
// "18 avq 2026 13:40" in az. A single `toLocaleString` call lets `Intl` handle
// the punctuation for the active locale, rather than a manual
// `${date}, ${time}` which produced the stray "2026 , 13:40" (space before
// comma) and ignored the locale's own separator.
export function formatDateTime(iso: string, timeZone?: string, locale?: string): string {
  return new Date(iso).toLocaleString(locale ?? FALLBACK_LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
}

// The forward-looking counterpart to `timeAgo`, and deliberately wordier: this
// one appears where the reader is deciding whether a time is what they meant
// ("in 2 days"), not scanning a list of things that already happened.
export function timeUntil(iso: string, locale?: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "any moment now";
  const loc = locale ?? FALLBACK_LOCALE;
  // Prefer localized relative for future as well when a non-English locale is
  // active — "2 gün sonra" reads better than "in 2 days" for an Azerbaijani
  // reader. `formatRelative` already handles future via positive `diff`.
  if (loc !== FALLBACK_LOCALE) {
    try {
      return formatRelative(iso, loc);
    } catch {
      // fall through to English wordy form
    }
  }
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
export function formatScheduleLong(iso: string, timeZone?: string, locale?: string): string {
  const date = new Date(iso).toLocaleDateString(locale ?? FALLBACK_LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  });
  return `${date} at ${formatTime(iso, timeZone, locale)}`;
}

// The zone a time is being read in, as a short offset like "GMT+4". Shown
// beside any time the author is choosing: a schedule is the one place where
// "09:00 in whose morning?" has a wrong answer.
export function zoneLabel(timeZone?: string, locale?: string): string {
  const parts = new Intl.DateTimeFormat(locale ?? FALLBACK_LOCALE, {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(new Date());
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}
