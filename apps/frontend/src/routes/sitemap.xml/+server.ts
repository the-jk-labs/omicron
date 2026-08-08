// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "$lib/api";
import { canonicalOrigin, instanceDomain } from "$lib/canonical";
import { newest, sitemapIndexResponse, urlsetResponse } from "$lib/sitemap";
import type { RequestHandler } from "./$types";

// The sitemap index: a list of the instance's other sitemap files, which is
// what gets submitted to a search console.
//
// An index rather than one flat document because the spec caps a file at 50,000
// URLs — an instance past that would silently stop advertising the overflow —
// and because a crawler can then re-fetch only the file whose `lastmod` moved
// instead of the whole archive after a single edit.
//
// Skipped entirely when indexing is off, so a private instance advertises
// nothing. Built here rather than in the backend because the canonical
// permalink logic lives in $lib/links.
//
// Entries are always listed on the instance's canonical origin, never on the
// hostname this request arrived on: a sitemap fetched via a `www.` alias must
// still submit the same URLs as the canonical one, or the two copies compete.

export const GET: RequestHandler = async ({ fetch, url }) => {
  const api = endpoints(fetch);
  const { indexingEnabled } = await api.seo().catch(() => ({ indexingEnabled: true }));
  const origin = canonicalOrigin(await instanceDomain(fetch)) ?? url.origin;

  if (!indexingEnabled) return urlsetResponse([]);

  const contents = await api.sitemapEntries().catch(() => null);
  if (!contents) return urlsetResponse([]);

  const sitemaps = [];

  // Posts, split into numbered files. `postsPerPage` is the backend's page size
  // rather than a constant repeated here, so the two cannot drift into a split
  // that drops or duplicates a page.
  const pages = Math.max(1, Math.ceil(contents.postCount / Math.max(1, contents.postsPerPage)));
  if (contents.postCount > 0) {
    for (let p = 1; p <= pages; p++) {
      sitemaps.push({ loc: `${origin}/sitemap/posts-${p}.xml` });
    }
  }

  // Profiles, tags and lists are each bounded well under the file limit, so one
  // file holds all of them. Its lastmod is the newest thing any of them lists.
  if (contents.profiles.length || contents.tags.length || contents.lists.length) {
    sitemaps.push({
      loc: `${origin}/sitemap/pages.xml`,
      lastmod: newest([
        ...contents.profiles.map((p) => p.lastPostAt),
        ...contents.tags.map((t) => t.lastPostAt),
        ...contents.lists.map((l) => l.lastItemAt),
      ]),
    });
  }

  // An instance with nothing published yet still needs to answer with a valid
  // document rather than an empty index, which some validators reject.
  if (sitemaps.length === 0) return urlsetResponse([{ loc: origin }]);

  return sitemapIndexResponse(sitemaps);
};
