// SPDX-License-Identifier: AGPL-3.0-or-later
import { error } from "@sveltejs/kit";
import { endpoints } from "$lib/api";
import { canonicalOrigin, instanceDomain } from "$lib/canonical";
import { postPath } from "$lib/links";
import { lastmod, urlsetResponse } from "$lib/sitemap";
import type { RequestHandler } from "./$types";

// One page of the post sitemap, listed by /sitemap.xml. The home feed rides
// along on page 1 — it is the page everything else hangs off and nothing links
// to it from outside.

export const GET: RequestHandler = async ({ fetch, params, url }) => {
  const page = Number.parseInt(params.page, 10);
  // A crawler only ever reaches this from the index, so a page number that is
  // not a positive integer was guessed or is stale. 404 rather than silently
  // serving page 1, which would put the same URLs under two addresses.
  if (!Number.isInteger(page) || page < 1) error(404, "No such sitemap page");

  const api = endpoints(fetch);
  const { indexingEnabled } = await api.seo().catch(() => ({ indexingEnabled: true }));
  if (!indexingEnabled) return urlsetResponse([]);

  const entries = await api.sitemapPosts(page).catch(() => []);
  if (entries.length === 0 && page > 1) error(404, "No such sitemap page");

  const origin = canonicalOrigin(await instanceDomain(fetch)) ?? url.origin;
  const urls = [];

  if (page === 1) {
    urls.push({ loc: origin, lastmod: lastmod(entries[0]?.updatedAt) });
  }

  for (const e of entries) {
    const path = postPath({
      id: e.id,
      title: e.title,
      author: { username: e.authorUsername },
    });
    // The post's own edit time, so a rewritten article asks to be re-read
    // instead of reporting the day it was first published forever. Falls back
    // to the publish date for a row written before the column existed.
    urls.push({
      loc: `${origin}${path}`,
      lastmod: lastmod(e.updatedAt) ?? lastmod(e.createdAt),
    });
  }

  return urlsetResponse(urls);
};
