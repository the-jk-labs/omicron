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

test("drops characters XML 1.0 does not allow", () => {
  expect(escapeXml("bad\u0008title\u0000")).toBe("badtitle");
});
