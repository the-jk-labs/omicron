import {
  countLabel,
  countWords,
  excerpt,
  formatDate,
  formatDateTime,
  formatRelative,
  formatScheduleLong,
  formatTime,
  readTime,
  readTimeFromWords,
  stripHtml,
  timeAgo,
  timeUntil,
  zoneLabel,
} from "$lib/format";
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regression tests for Markdown syntax leaking into the excerpt (the bug
// reported as "#UserID The user ID from our entry in the password file" and
// "#ProcandprocID An executing instance"). `excerpt` derives its text from
// rendered HTML; a heading written without the space after `#` is not a
// heading, so the `#` survives into the plain text. These tests pin that the
// marker is dropped — on every section, not just the first — while a genuine
// `#` in code or mid-prose is kept. The `countLabel` tests guard the reaction
// counters ("2 0 0" on cards, "5 0 0" on the post page) that once rendered as
// bare numbers: the phrase has to agree in number, or the tooltip and
// screen-reader label would read as broken English.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("excerpt", () => {
  it("drops a heading marker the renderer leaves literal", () => {
    expect(excerpt("<p>#UserID The user ID from our entry in the password file</p>")).toBe(
      "UserID The user ID from our entry in the password file",
    );
  });

  it("drops the marker on every section, not just the first", () => {
    const out = excerpt("<p>#UserID The user id</p><p>#ProcandprocID An executing instance</p>");
    expect(out).toBe("UserID The user id ProcandprocID An executing instance");
    expect(out).not.toContain("#");
  });

  it("keeps a hash inside a code fence", () => {
    const out = excerpt('<p>#NAME proc</p><pre><code class="language-c">#include &lt;sys/types.h&gt;</code></pre>');
    expect(out).toContain("#include <sys/types.h>");
  });

  it("keeps a hash mid-prose", () => {
    expect(excerpt("<p>Read about the #UserID field here</p>")).toContain("#UserID");
  });
});

describe("countLabel", () => {
  it("uses the singular form only for one", () => {
    expect(countLabel(1, "like")).toBe("1 like");
    expect(countLabel(1, "response")).toBe("1 response");
    expect(countLabel(1, "recommendation")).toBe("1 recommendation");
  });

  it("uses the plural form for zero and for many", () => {
    expect(countLabel(0, "like")).toBe("0 likes");
    expect(countLabel(2, "like")).toBe("2 likes");
    expect(countLabel(0, "response")).toBe("0 responses");
    expect(countLabel(5, "response")).toBe("5 responses");
    expect(countLabel(0, "recommendation")).toBe("0 recommendations");
    expect(countLabel(3, "recommendation")).toBe("3 recommendations");
  });

  it("honours an explicit irregular plural", () => {
    expect(countLabel(1, "ox", "oxen")).toBe("1 ox");
    expect(countLabel(2, "ox", "oxen")).toBe("2 oxen");
  });
});

describe("stripHtml", () => {
  it("drops tags, decodes entities and collapses whitespace", () => {
    expect(stripHtml("<p>Tom &amp; Jerry</p>\n<p>&lt;3&nbsp;&quot;x&quot; &apos;y&apos;</p>")).toBe(
      `Tom & Jerry <3 "x" 'y'`,
    );
  });

  it("decodes numeric entities, and leaves unknown or out-of-range ones alone", () => {
    expect(stripHtml("&#233;&#x1F600;&#X41;")).toBe("é😀A");
    expect(stripHtml("&hellip; &#x110000; &#99999999;")).toBe("&hellip; &#x110000; &#99999999;");
  });
});

describe("excerpt length", () => {
  it("keeps short text whole", () => {
    expect(excerpt("<p>Short.</p>", 20)).toBe("Short.");
  });

  it("cuts on a word boundary and trims trailing punctuation before the ellipsis", () => {
    expect(excerpt("<p>one two three, four five six</p>", 16)).toBe("one two three…");
  });

  it("hard-cuts a long unbroken word", () => {
    expect(excerpt(`<p>${"x".repeat(50)}</p>`, 10)).toBe(`${"x".repeat(10)}…`);
  });
});

describe("read time", () => {
  it("is words / 200, rounded, never below a minute", () => {
    expect(countWords("  one\ttwo\nthree  ")).toBe(3);
    expect(countWords("")).toBe(0);
    expect(readTimeFromWords(0)).toBe(1);
    expect(readTimeFromWords(299)).toBe(1);
    expect(readTimeFromWords(300)).toBe(2);
    expect(readTime(`<p>${"word ".repeat(1000)}</p>`)).toBe(5);
  });
});

describe("dates", () => {
  const NOW = new Date("2026-06-15T12:00:00Z");
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  const ahead = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it("formats in the given zone and locale, defaulting to en-US", () => {
    expect(formatDate("2026-01-01T23:30:00Z", "UTC")).toBe("Jan 1, 2026");
    expect(formatDate("2026-01-01T23:30:00Z", "Asia/Baku")).toBe("Jan 2, 2026");
    expect(formatDate("2026-01-01T12:00:00Z", "UTC", "de-DE")).toBe("1. Jan. 2026");
    expect(formatTime("2026-01-01T23:05:00Z", "UTC")).toBe("23:05");
    expect(formatDateTime("2026-01-01T23:05:00Z", "UTC")).toBe("Jan 1, 2026, 23:05");
    expect(formatScheduleLong("2026-01-01T23:05:00Z", "UTC")).toBe("Thursday, January 1, 2026 at 23:05");
  });

  it("timeAgo steps through now, minutes, hours and days, then a date", () => {
    expect(timeAgo(ago(30_000))).toBe("now");
    expect(timeAgo(ahead(HOUR))).toBe("now");
    expect(timeAgo(ago(5 * MIN))).toBe("5m");
    expect(timeAgo(ago(3 * HOUR))).toBe("3h");
    expect(timeAgo(ago(6 * DAY))).toBe("6d");
    expect(timeAgo(ago(8 * DAY), "UTC")).toBe("Jun 7, 2026");
  });

  it("formatRelative picks the coarsest sensible unit, past and future", () => {
    expect(formatRelative(ago(10_000))).toBe("10 seconds ago");
    expect(formatRelative(ahead(5 * MIN))).toBe("in 5 minutes");
    expect(formatRelative(ago(2 * HOUR))).toBe("2 hours ago");
    expect(formatRelative(ago(DAY))).toBe("yesterday");
    expect(formatRelative(ahead(14 * DAY))).toBe("in 2 weeks");
    expect(formatRelative(ago(90 * DAY))).toBe("3 months ago");
    expect(formatRelative(ahead(800 * DAY))).toBe("in 2 years");
    expect(formatRelative(ago(2 * HOUR), "tr")).toBe("2 saat önce");
  });

  it("formatRelative falls back to timeAgo for a locale Intl rejects", () => {
    expect(formatRelative(ago(5 * MIN), "!!")).toBe("5m");
  });

  it("timeUntil counts down in plain English", () => {
    expect(timeUntil(ago(1))).toBe("any moment now");
    expect(timeUntil(ahead(20_000))).toBe("in under a minute");
    expect(timeUntil(ahead(MIN))).toBe("in 1 minute");
    expect(timeUntil(ahead(45 * MIN))).toBe("in 45 minutes");
    expect(timeUntil(ahead(HOUR))).toBe("in 1 hour");
    expect(timeUntil(ahead(5 * HOUR))).toBe("in 5 hours");
    expect(timeUntil(ahead(DAY))).toBe("in 1 day");
    expect(timeUntil(ahead(20 * DAY))).toBe("in 3 weeks");
    expect(timeUntil(ahead(100 * DAY))).toBe("in 3 months");
  });

  it("timeUntil uses Intl for any other locale", () => {
    expect(timeUntil(ahead(2 * HOUR), "tr")).toBe("2 saat sonra");
  });

  it("zoneLabel names the offset", () => {
    expect(zoneLabel("Asia/Baku")).toBe("GMT+4");
    expect(zoneLabel("UTC")).toMatch(/^GMT(\+0)?$/);
  });
});
