// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as seo from "@/services/seo.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import type { AppEnv } from "@/routes/types.ts";

// Public, read-only discoverability surface. The SvelteKit app reads these to
// render its <head> verification tags, robots.txt and sitemap.xml — all of which
// must be served from the app origin, so the frontend owns the URL-building and
// this only supplies the data (indexing flag, tokens, and the raw post list).
export const seoRoutes = new Hono<AppEnv>();

// Indexing flag + verification tokens. Public by design: the tokens are meant to
// appear in the page's HTML anyway.
//
// The IndexNow key is withheld. It is what authorises submissions for this
// host, and while IndexNow treats it as semi-public — the engines fetch it from
// a file on the domain — handing it to every caller would let anyone submit
// this instance's URLs at will. The app never needs it; only the key-file route
// does, and that confirms a guess rather than being told (see below).
seoRoutes.get("/", async (c) => {
  const { indexNowKey: _withheld, ...settings } = await seo.getSeoSettings();
  return c.json(settings);
});

// Confirms whether `key` is this instance's IndexNow key, so the app can serve
// the key file the engines fetch to verify domain ownership. Answers only yes
// or no, so a caller learns nothing it did not already have to supply.
seoRoutes.get("/indexnow-key/:key", async (c) => {
  const { indexNowEnabled, indexNowKey } = await seo.getSeoSettings();
  const ok = indexNowEnabled && !!indexNowKey && c.req.param("key") === indexNowKey;
  return c.json({ ok });
});

// The instance's index pages — author profiles, tag indexes, public reading
// lists — plus how many posts there are. Each list is bounded well under the
// sitemap spec's 50k-per-file limit, so they ship together in one response;
// posts are the only kind that can outgrow a file, and they are paged
// separately below.
//
// Fetched in parallel: this backs a single document, so three sequential
// round-trips would only make it slower to build.
seoRoutes.get("/sitemap-entries", async (c) => {
  const [profiles, tags, lists, postCount] = await Promise.all([
    postsRepo.listSitemapProfiles(),
    tagsRepo.listSitemapTags(),
    listsRepo.listSitemapLists(),
    postsRepo.countSitemapEntries(),
  ]);
  return c.json({
    profiles,
    tags,
    lists,
    postCount,
    postsPerPage: postsRepo.SITEMAP_PAGE_SIZE,
  });
});

// One page of published local posts. `page` is 1-based; anything unparseable
// is page 1 rather than an error, since this is a public crawler-facing surface
// and a bad page number should not produce a broken sitemap.
seoRoutes.get("/sitemap-posts", async (c) => {
  const page = Number.parseInt(c.req.query("page") ?? "1", 10);
  const entries = await postsRepo.listSitemapEntries(Number.isFinite(page) ? page : 1);
  return c.json(entries);
});
