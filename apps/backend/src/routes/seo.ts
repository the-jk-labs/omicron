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
seoRoutes.get("/", async (c) => {
  return c.json(await seo.getSeoSettings());
});

// Everything this instance publishes that belongs in the sitemap, in the raw
// form the frontend needs to build URLs (it owns the permalink logic; see
// $lib/links). Four kinds, because four kinds of page here are worth finding:
// the posts, their authors' profiles, the tag indexes, and public reading
// lists. Each carries its own lastmod.
//
// Fetched together and in parallel: the sitemap is one document, so four
// sequential round-trips would only make it slower to build.
seoRoutes.get("/sitemap-entries", async (c) => {
  const [posts, profiles, tags, lists] = await Promise.all([
    postsRepo.listSitemapEntries(),
    postsRepo.listSitemapProfiles(),
    tagsRepo.listSitemapTags(),
    listsRepo.listSitemapLists(),
  ]);
  return c.json({ posts, profiles, tags, lists });
});
