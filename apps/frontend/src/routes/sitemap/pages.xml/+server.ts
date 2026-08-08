// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "$lib/api";
import { canonicalOrigin, instanceDomain } from "$lib/canonical";
import { listPath } from "$lib/links";
import { lastmod, urlsetResponse } from "$lib/sitemap";
import type { RequestHandler } from "./$types";

// The instance's index pages: author profiles, tag pages, and public reading
// lists. All three are real pages a reader would want to find, and all three
// were previously reachable only by a crawler following a link to one — on feed
// pages that load their older entries with JavaScript, so past the first screen
// there was nothing to follow.
//
// Each `lastmod` is the newest thing the page lists, which is when the page
// genuinely last changed. A profile's own row barely ever changes; what a
// reader (and a crawler) comes back for is the new post on it.
//
// One file: each of these lists is bounded well below the spec's 50,000-URL
// limit, unlike posts, which are paged separately.

export const GET: RequestHandler = async ({ fetch, url }) => {
  const api = endpoints(fetch);
  const { indexingEnabled } = await api.seo().catch(() => ({ indexingEnabled: true }));
  if (!indexingEnabled) return urlsetResponse([]);

  const contents = await api.sitemapEntries().catch(() => null);
  if (!contents) return urlsetResponse([]);

  const origin = canonicalOrigin(await instanceDomain(fetch)) ?? url.origin;

  return urlsetResponse([
    ...contents.profiles.map((p) => ({
      loc: `${origin}/@${p.username}`,
      lastmod: lastmod(p.lastPostAt),
    })),
    ...contents.tags.map((t) => ({
      loc: `${origin}/tags/${t.slug}`,
      lastmod: lastmod(t.lastPostAt),
    })),
    ...contents.lists.map((l) => ({
      loc: `${origin}${listPath(l)}`,
      lastmod: lastmod(l.lastItemAt),
    })),
  ]);
};
