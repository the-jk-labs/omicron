// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import { apiError, type Routes } from "../../../fakeFetch";
import { event } from "../../event";

async function pages(routes: Routes) {
  vi.resetModules();
  const { GET } = await import("../../../../src/routes/sitemap/pages.xml/+server");
  return await (await GET(event({ url: "https://www.blog.example/sitemap/pages.xml", routes }).event)).text();
}

const base = { "GET /api/seo": { indexingEnabled: true }, "GET /api/instance": { domain: "blog.example" } };

test("profiles, tags and lists on the canonical origin, each with its own lastmod", async () => {
  const xml = await pages({
    ...base,
    "GET /api/seo/sitemap-entries": {
      profiles: [{ username: "ada", lastPostAt: "2026-01-01T00:00:00Z" }],
      tags: [{ slug: "deno", lastPostAt: "junk" }],
      lists: [{ id: "66635376-aaaa", title: "Weekend reads", lastItemAt: "2026-02-01T00:00:00Z" }],
    },
  });
  expect(xml).toContain("<loc>https://blog.example/@ada</loc>\n    <lastmod>2026-01-01</lastmod>");
  expect(xml).toContain("<loc>https://blog.example/tags/deno</loc>\n  </url>");
  expect(xml).toContain("<loc>https://blog.example/lists/weekend-reads-66635376</loc>");
});

test("indexing off or no data is an empty urlset", async () => {
  expect(await pages({ ...base, "GET /api/seo": { indexingEnabled: false } })).not.toContain("<url>");
  expect(await pages({ ...base, "GET /api/seo/sitemap-entries": apiError(500) })).not.toContain("<url>");
});
