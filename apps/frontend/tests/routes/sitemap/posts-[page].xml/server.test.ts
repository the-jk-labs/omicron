// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import { apiError, type Routes } from "../../../fakeFetch";
import { event } from "../../event";

async function posts(page: string, routes: Routes) {
  vi.resetModules();
  const { GET } = await import("../../../../src/routes/sitemap/posts-[page].xml/+server");
  return await GET(event({ url: `https://blog.example/sitemap/posts-${page}.xml`, params: { page }, routes }).event);
}

const base = { "GET /api/seo": { indexingEnabled: true }, "GET /api/instance": { domain: "blog.example" } };
const entries = [
  {
    id: "9e962281-aaaa",
    slug: "hello",
    authorUsername: "ada",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
  },
  { id: "1234abcd-aaaa", slug: null, authorUsername: "bob", createdAt: "2026-01-05T00:00:00Z", updatedAt: "junk" },
];

test("page 1 opens with the home page dated by the newest post", async () => {
  const xml = await (await posts("1", { ...base, "GET /api/seo/sitemap-posts?page=1": entries })).text();
  expect(xml).toContain("<loc>https://blog.example</loc>\n    <lastmod>2026-02-01</lastmod>");
  expect(xml).toContain("<loc>https://blog.example/@ada/hello</loc>\n    <lastmod>2026-02-01</lastmod>");
  // A bad updatedAt falls back to the creation date; no slug falls back to the short id.
  expect(xml).toContain("<loc>https://blog.example/@bob/1234abcd</loc>\n    <lastmod>2026-01-05</lastmod>");
});

test("later pages carry posts only", async () => {
  const xml = await (await posts("2", { ...base, "GET /api/seo/sitemap-posts?page=2": entries })).text();
  expect(xml).not.toContain("<loc>https://blog.example</loc>");
});

test.for(["0", "-1", "abc"])("page %s does not exist", async (page) => {
  await expect(posts(page, base)).rejects.toMatchObject({ status: 404 });
});

test("an empty later page is a 404; an empty first page is just the home page", async () => {
  await expect(posts("3", { ...base, "GET /api/seo/sitemap-posts?page=3": [] })).rejects.toMatchObject({ status: 404 });
  const xml = await (await posts("1", { ...base, "GET /api/seo/sitemap-posts?page=1": apiError(500) })).text();
  expect(xml.match(/<url>/g)).toHaveLength(1);
});

test("indexing off is an empty urlset", async () => {
  expect(await (await posts("1", { ...base, "GET /api/seo": { indexingEnabled: false } })).text()).not.toContain(
    "<url>",
  );
});
