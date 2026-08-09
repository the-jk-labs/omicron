// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "$lib/api";
import { canonicalOrigin, instanceDomain } from "$lib/canonical";
import type { RequestHandler } from "./$types";

// Served from the app origin so it governs the same host as the pages. When the
// admin has indexing enabled, allow crawling but keep the authed/private areas
// out and point at the sitemap; when disabled, disallow everything. The Anubis
// scraper shield never challenges this path (see botPolicy.yaml).

// Authed or write-side surfaces that should never be indexed even when the site
// is public. These mirror the private routes the layout marks `noindex`.
//
// `/search` is here for a different reason than the rest. It is public and
// harmless to a reader, but every distinct `?q=` is a distinct URL, so a
// crawler that finds one search link can generate them without end — each
// returning a near-empty page of results. That burns the crawl budget the
// instance's actual articles need and fills the index with thin pages, which
// is a site-wide quality signal. The auth screens below are already `noindex`
// via the layout's `standalone` check; naming them here stops crawlers
// spending fetches to discover that.
//
// `/lists` is deliberately absent: a robots.txt path is a prefix, so it would
// also cover `/lists/<public-list>`, which is shareable curated content with
// its own feed and belongs in the index. The bare index page behind it needs a
// session anyway.
// Carved out of the `/api/` disallow below, and load-bearing for link previews.
//
// A robots.txt path is a prefix, so `Disallow: /api/` covered `/api/uploads/`
// too — the one place under `/api/` that is not an endpoint but a file: every
// image an author uploads, avatars included. A post's share image is one of
// them, and the crawlers that build link cards (Facebook's, and WhatsApp's with
// it) check robots.txt before fetching an `og:image`. So a banner uploaded here
// was declared off-limits to the very fetchers it exists for, and the card came
// out blank however correct the tag was.
//
// Listed before the disallows because that is the order the spec resolves ties
// in for crawlers that don't implement longest-match.
const ALLOW = ["/api/uploads/"];

const DISALLOW = [
  "/compose",
  "/drafts",
  "/dashboard",
  "/settings",
  "/admin",
  "/api/",
  "/search",
  "/notifications",
  "/follow-requests",
  "/login",
  "/register",
  "/verify-email",
  "/reset-password",
  "/forgot-password",
  "/setup",
];

export const GET: RequestHandler = async ({ fetch, url }) => {
  const { indexingEnabled } = await endpoints(fetch).seo().catch(() => ({ indexingEnabled: true }));
  // Point at the canonical host's sitemap even when robots.txt was fetched via
  // an alias, so both copies submit the same one URL set.
  const origin = canonicalOrigin(await instanceDomain(fetch)) ?? url.origin;

  const body = indexingEnabled
    ? [
      "User-agent: *",
      "Allow: /",
      ...ALLOW.map((p) => `Allow: ${p}`),
      ...DISALLOW.map((p) => `Disallow: ${p}`),
      "",
      `Sitemap: ${origin}/sitemap.xml`,
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
