// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { lastmod, newest, sitemapIndexResponse, urlsetResponse, xmlResponse } from "#lib/sitemap.js";

describe("lastmod", () => {
  test("is the UTC date of a timestamp", () => {
    expect(lastmod("2026-03-04T23:30:00-05:00")).toBe("2026-03-05");
    expect(lastmod("2026-03-04 10:00:00+00")).toBe("2026-03-04");
  });

  test.for([null, undefined, "", "not a date"])("drops %o rather than printing Invalid Date", (v) => {
    expect(lastmod(v)).toBe(null);
  });
});

test("newest picks the latest valid date, ignoring junk", () => {
  expect(newest(["2026-01-01T00:00:00Z", null, "junk", "2026-02-01T00:00:00Z"])).toBe("2026-02-01");
  expect(newest([])).toBe(null);
  expect(newest([null, "junk"])).toBe(null);
});

test("a urlset escapes locations and omits a missing lastmod", async () => {
  const res = urlsetResponse([
    { loc: "https://blog.example/a?x=1&y=2", lastmod: "2026-01-01" },
    { loc: "https://blog.example/b" },
  ]);
  expect(res.headers.get("content-type")).toBe("application/xml; charset=utf-8");
  expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
  expect(await res.text()).toBe(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://blog.example/a?x=1&amp;y=2</loc>
    <lastmod>2026-01-01</lastmod>
  </url>
  <url>
    <loc>https://blog.example/b</loc>
  </url>
</urlset>
`,
  );
});

test("an index wraps <sitemap> entries", async () => {
  const text = await sitemapIndexResponse([{ loc: "https://blog.example/sitemap/posts-1.xml" }]).text();
  expect(text).toContain("<sitemapindex xmlns=");
  expect(text).toContain("<sitemap>\n    <loc>https://blog.example/sitemap/posts-1.xml</loc>\n  </sitemap>");
});

test("an empty urlset is still a valid document", async () => {
  expect(await urlsetResponse([]).text()).toContain("<urlset");
  expect(await xmlResponse("<x/>").text()).toBe("<x/>");
});
