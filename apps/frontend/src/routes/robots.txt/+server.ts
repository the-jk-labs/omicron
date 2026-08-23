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
// `/api/og/` is the second, and carved out for the same reason: it holds
// nothing but the share cards generated for posts that have no image of their
// own (backend routes/og.ts), and those are fetched by exactly the crawlers
// that read this file first. A post's `og:image` pointing into a disallowed
// path is a blank card however correct the tag is.
//
// Exceptions to the blanket `Disallow: /api/` below. Kept next to that rule so
// the intent reads as a unit: crawlers may not crawl the JSON API, but they
// must be able to fetch the files that API serves (`/api/uploads/` — every
// uploaded image / avatar) and the on-the-fly share cards (`/api/og/`). Without
// these, a `Disallow: /api/` prefix would also ban the `og:image` that link
// previews (Facebook, WhatsApp, etc.) fetch after reading robots.txt, and cards
// would render blank.
//
// Shown as `Allow` (not a second `Disallow`) because robots.txt paths are
// prefixes. Emitted *after* the matching `Disallow: /api/` so modern crawlers
// (Google, Bing — longest-match wins) pick the most specific rule, and old
// prefix-first parsers that honour order still see the exception right next to
// its blanket. The previous file listed `Allow: /` at the top, which claimed
// every URL was allowed even though Anubis challenges the private/compose/auth
// half of the site — a direct mismatch with the real blocking policy. Default
// in robots.txt is Allow, so an explicit `Allow: /` is redundant and was
// removed; only the two API exceptions are now listed, grouped with their
// `Disallow`.
const ALLOW = ["/api/uploads/", "/api/og/"];

// This list is also the AI-scraper shield's challenge list: the `app-challenge`
// rule in botPolicy.yaml walls exactly these routes (bar `/api/`, which the
// frontend's own XHR needs). Adding a route here means adding it there too.
// Kept in step with that rule so robots.txt (crawl budget) and Anubis (live
// traffic) tell the same story about what is private. They differ only where
// they must: `/api/` is Disallow here (crawlers should not crawl JSON) but
// Allow in botPolicy.yaml (the browser needs XHR), and `/lists` is absent
// here because a prefix would swallow public lists while Anubis can match it
// exactly.
const DISALLOW = [
  "/compose",
  // Kept alongside its replacement: the old address still redirects, and a
  // crawler that has it should not follow the redirect to find out.
  "/drafts",
  "/posts/manage",
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
  const { indexingEnabled } = await endpoints(fetch)
    .seo()
    .catch(() => ({ indexingEnabled: true }));
  // Point at the canonical host's sitemap even when robots.txt was fetched via
  // an alias, so both copies submit the same one URL set.
  const origin = canonicalOrigin(await instanceDomain(fetch)) ?? url.origin;

  // Build the body so the Allow exceptions sit next to the Disallow they
  // carve out from, rather than floating at the top under a blanket `Allow: /`.
  // That blanket is intentionally omitted: robots.txt defaults to Allow, and
  // emitting `Allow: /` while Anubis challenges /compose, /search, /settings,
  // etc. advertises a policy the live site does not enforce.
  const disallowWithAllows = DISALLOW.flatMap((p) =>
    p === "/api/" ? [`Disallow: ${p}`, ...ALLOW.map((a) => `Allow: ${a}`)] : [`Disallow: ${p}`],
  );

  const body = indexingEnabled
    ? ["User-agent: *", ...disallowWithAllows, "", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n")
    : ["User-agent: *", "Disallow: /", ""].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
