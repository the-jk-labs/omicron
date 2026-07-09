// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as seo from "@/services/seo.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
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

// Published local posts for the sitemap: id + title + author handle (to build
// the canonical permalink frontend-side) + createdAt (for <lastmod>).
seoRoutes.get("/sitemap-entries", async (c) => {
  const entries = await postsRepo.listSitemapEntries();
  return c.json(entries);
});
