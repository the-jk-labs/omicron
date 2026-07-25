// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "$lib/api";
import { canonicalOrigin, instanceDomain } from "$lib/canonical";
import { postPath } from "$lib/links";
import { escapeXml } from "$lib/xml";
import type { RequestHandler } from "./$types";

// XML sitemap of this instance's published blog posts. Built here (not in the
// backend) because the canonical permalink logic lives in $lib/links. Skipped
// entirely when indexing is off, so a private instance advertises no content.
//
// Entries are always listed on the instance's canonical origin, never on the
// hostname this request arrived on: a sitemap fetched via a `www.` alias must
// still submit the same URLs as the canonical one, or the two copies compete.

export const GET: RequestHandler = async ({ fetch, url }) => {
  const api = endpoints(fetch);
  const { indexingEnabled } = await api.seo().catch(() => ({ indexingEnabled: true }));
  const entries = indexingEnabled ? await api.sitemapEntries().catch(() => []) : [];
  const origin = canonicalOrigin(await instanceDomain(fetch)) ?? url.origin;

  const urls = entries.map((e) => {
    const loc = escapeXml(`${origin}${postPath({
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
