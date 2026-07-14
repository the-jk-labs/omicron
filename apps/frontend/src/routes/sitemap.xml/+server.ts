// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "$lib/api";
import { postPath } from "$lib/links";
import { escapeXml } from "$lib/xml";
import type { RequestHandler } from "./$types";

// XML sitemap of this instance's published blog posts. Built here (not in the
// backend) because the canonical permalink logic lives in $lib/links and the
// absolute URL needs this request's origin. Skipped entirely when indexing is
// off, so a private instance advertises no content.

export const GET: RequestHandler = async ({ fetch, url }) => {
  const api = endpoints(fetch);
  const { indexingEnabled } = await api.seo().catch(() => ({ indexingEnabled: true }));
  const entries = indexingEnabled ? await api.sitemapEntries().catch(() => []) : [];

  const urls = entries.map((e) => {
    const loc = escapeXml(`${url.origin}${postPath({
      id: e.id,
      title: e.title,
      author: { username: e.authorUsername },
    })}`);
    const lastmod = new Date(e.createdAt).toISOString().slice(0, 10);
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urls.join("\n")}\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
