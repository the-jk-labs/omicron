// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import { apiError, type Routes } from "../../fakeFetch";
import { event } from "../event";

async function sitemap(routes: Routes) {
  vi.resetModules();
  const { GET } = await import("../../../src/routes/sitemap.xml/+server");
  return await (await GET(event({ url: "https://blog.example/sitemap.xml", routes }).event)).text();
}

const base = { "GET /api/seo": { indexingEnabled: true }, "GET /api/instance": { domain: "blog.example" } };
const contents = (over: Record<string, unknown> = {}) => ({
  profiles: [],
  tags: [],
  lists: [],
  postCount: 0,
  postsPerPage: 40000,
  ...over,
});

test("an index of post pages plus the pages file dated by its newest entry", async () => {
  const xml = await sitemap({
    ...base,
    "GET /api/seo/sitemap-entries": contents({
      postCount: 80001,
      profiles: [{ username: "ada", lastPostAt: "2026-01-01T00:00:00Z" }],
      tags: [{ slug: "deno", lastPostAt: "2026-03-01 10:00:00+00" }],
      lists: [{ id: "l", title: "L", lastItemAt: "2026-02-01T00:00:00Z" }],
    }),
  });
  expect(xml).toContain("<sitemapindex");
  for (const n of [1, 2, 3]) expect(xml).toContain(`<loc>https://blog.example/sitemap/posts-${n}.xml</loc>`);
  expect(xml).not.toContain("posts-4.xml");
  expect(xml).toContain("<loc>https://blog.example/sitemap/pages.xml</loc>\n    <lastmod>2026-03-01</lastmod>");
});

test("only posts: no pages file", async () => {
  const xml = await sitemap({ ...base, "GET /api/seo/sitemap-entries": contents({ postCount: 1 }) });
  expect(xml).toContain("posts-1.xml");
  expect(xml).not.toContain("pages.xml");
});

test("an instance with nothing published still answers a valid urlset of its home page", async () => {
  const xml = await sitemap({ ...base, "GET /api/seo/sitemap-entries": contents() });
  expect(xml).toContain("<urlset");
  expect(xml).toContain("<loc>https://blog.example</loc>");
});

test("a degenerate page size never divides by zero", async () => {
  const xml = await sitemap({ ...base, "GET /api/seo/sitemap-entries": contents({ postCount: 3, postsPerPage: 0 }) });
  expect(xml).toContain("posts-3.xml");
  expect(xml).not.toContain("posts-4.xml");
});

test("indexing off, or the backend down, is an empty urlset", async () => {
  expect(await sitemap({ ...base, "GET /api/seo": { indexingEnabled: false } })).not.toContain("<url>");
  expect(await sitemap({ ...base, "GET /api/seo/sitemap-entries": apiError(500) })).not.toContain("<url>");
});
