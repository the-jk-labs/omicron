import { escapeXml } from "$lib/xml";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";

test("escapes the five XML specials, ampersand first", () => {
  expect(escapeXml(`<a href="x">Tom & Jerry's</a>`)).toBe(
    "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;",
  );
  expect(escapeXml("&amp;")).toBe("&amp;amp;");
  expect(escapeXml("plain")).toBe("plain");
});

// BUG: XML 1.0 forbids most C0 control characters even when escaped, and a
// feed or sitemap carrying one is rejected whole by every parser. Titles in the
// list feeds come from federated posts, i.e. another server, so a single title
// with a stray \u0008 breaks the reading list's feed for every subscriber.
test.fails("BUG: drops characters XML 1.0 does not allow", () => {
  expect(escapeXml("bad\u0008title\u0000")).toBe("badtitle");
});
