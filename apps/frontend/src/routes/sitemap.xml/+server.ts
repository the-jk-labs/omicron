// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "$lib/api";
import { canonicalOrigin, instanceDomain } from "$lib/canonical";
import { listPath, postPath } from "$lib/links";
import { escapeXml } from "$lib/xml";
import type { RequestHandler } from "./$types";

// XML sitemap of everything this instance publishes. Built here (not in the
// backend) because the canonical permalink logic lives in $lib/links. Skipped
// entirely when indexing is off, so a private instance advertises no content.
//
// Four kinds of page, because four are worth an engine finding: the posts, the
// profiles of the people who wrote them, the tag indexes, and public reading
// lists. Only the posts were listed before, which left every other page
// discoverable solely by a crawler following a link to it — and the feed pages
// those links live on load their older entries with JavaScript, so beyond the
// first screen there was nothing to follow.
//
// Entries are always listed on the instance's canonical origin, never on the
// hostname this request arrived on: a sitemap fetched via a `www.` alias must
// still submit the same URLs as the canonical one, or the two copies compete.

// `<lastmod>` wants a date, and the value reaching us is whatever the API
// serialized. A malformed one must not become "Invalid Date" in the output —
// an engine rejects the whole document over one bad entry — so it is dropped
// and the URL is listed without a lastmod, which is valid.
function lastmod(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function urlEntry(loc: string, modified: string | null): string {
  const mod = modified ? `\n    <lastmod>${modified}</lastmod>` : "";
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>${mod}\n  </url>`;
}

export const GET: RequestHandler = async ({ fetch, url }) => {
  const api = endpoints(fetch);
  const { indexingEnabled } = await api.seo().catch(() => ({ indexingEnabled: true }));
  const empty = { posts: [], profiles: [], tags: [], lists: [] };
  const contents = indexingEnabled ? await api.sitemapEntries().catch(() => empty) : empty;
  const origin = canonicalOrigin(await instanceDomain(fetch)) ?? url.origin;

  const urls: string[] = [];

  // The home feed. Listed explicitly because nothing links to it from outside
  // and it is the one page every other one hangs off.
  if (contents.posts.length > 0) {
    urls.push(urlEntry(origin, lastmod(contents.posts[0]?.updatedAt)));
  }

  for (const e of contents.posts) {
    const path = postPath({
      id: e.id,
      title: e.title,
      author: { username: e.authorUsername },
    });
    // The post's own edit time, so a rewritten article asks to be re-read
    // instead of reporting the day it was first published forever.
    urls.push(urlEntry(`${origin}${path}`, lastmod(e.updatedAt) ?? lastmod(e.createdAt)));
  }

  for (const p of contents.profiles) {
    urls.push(urlEntry(`${origin}/@${p.username}`, lastmod(p.lastPostAt)));
  }

  for (const t of contents.tags) {
    urls.push(urlEntry(`${origin}/tags/${t.slug}`, lastmod(t.lastPostAt)));
  }

  for (const l of contents.lists) {
    urls.push(urlEntry(`${origin}${listPath(l)}`, lastmod(l.lastItemAt)));
  }

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
