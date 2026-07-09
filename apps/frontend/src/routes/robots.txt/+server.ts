// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "$lib/api";
import type { RequestHandler } from "./$types";

// Served from the app origin so it governs the same host as the pages. When the
// admin has indexing enabled, allow crawling but keep the authed/private areas
// out and point at the sitemap; when disabled, disallow everything. The Anubis
// scraper shield never challenges this path (see botPolicy.yaml).

// Authed or write-side surfaces that should never be indexed even when the site
// is public. These mirror the private routes the layout marks `noindex`.
const DISALLOW = ["/compose", "/drafts", "/dashboard", "/settings", "/admin", "/api/"];

export const GET: RequestHandler = async ({ fetch, url }) => {
  const { indexingEnabled } = await endpoints(fetch).seo().catch(() => ({ indexingEnabled: true }));

  const body = indexingEnabled
    ? [
      "User-agent: *",
      "Allow: /",
      ...DISALLOW.map((p) => `Disallow: ${p}`),
      "",
      `Sitemap: ${url.origin}/sitemap.xml`,
      "",
    ].join("\n")
    : ["User-agent: *", "Disallow: /", ""].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
