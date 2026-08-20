// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { notFound } from "@/lib/http.ts";
import * as ogCardService from "@/services/ogCard.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import type { AppEnv } from "@/routes/types.ts";

// Generated share images — what a link-preview scraper fetches as `og:image`
// for a post that carries no picture of its own. See lib/ogCard.ts for what is
// drawn and services/ogCard.ts for the caching.
//
// Its own prefix rather than a path under `/api/posts/`, and that is the point
// of it: robots.txt disallows `/api/` wholesale, and a crawler path is a
// prefix, so a card living under the posts API would be declared off-limits to
// the very fetchers it exists for — the same bug that `Allow: /api/uploads/`
// already exists to undo. `/api/og/` is narrow enough to allow by name, and
// contains nothing but share images. Keep it that way.
//
// Public and unauthenticated by necessity: the caller has no session and
// follows no login.
export const ogRoutes = new Hono<AppEnv>();

ogRoutes.get("/posts/:file", async (c) => {
  const id = /^([0-9a-fA-F-]{8,})\.jpg$/.exec(c.req.param("file"))?.[1];
  if (!id) throw notFound("Not found.");

  // Built from the same visibility-checked read a signed-out reader gets, so a
  // draft's card 404s exactly like the draft.
  const card = await ogCardService.postCard(id);
  // No card could be drawn — a federated copy, an untitled post, or a title in
  // a script the bundled face has no glyphs for. Hand the scraper the brand
  // image rather than a 404: a redirect still puts a picture on the card, and
  // an `og:image` that 404s puts nothing there at all.
  if (!card) return c.redirect(`${await getOrigin()}/og-image.png`, 302);

  // A Uint8Array is a valid runtime BodyInit; the DOM typing (this project
  // compiles with `lib: dom`) omits it — same cast as the inbox in app.ts.
  return new Response(card as BodyInit, {
    headers: {
      "content-type": "image/jpeg",
      // A day, not `immutable`: unlike an upload, what this draws changes when
      // the post is retitled. Scrapers cache far longer than any header asks
      // anyway, which is why the URL the frontend emits carries the post's
      // `updatedAt` — a retitled post is a new URL for them to fetch.
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
});
