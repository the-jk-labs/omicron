// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { notFound } from "@/lib/http.ts";
import type { AppEnv } from "@/routes/types.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import * as ogCardService from "@/services/ogCard.ts";
import * as profileCardService from "@/services/profileCard.ts";

// Generated share images — what a link-preview scraper fetches as `og:image`
// for a post that carries no picture of its own, or for a profile page. See
// lib/ogCard.ts and lib/profileCard.ts for what is drawn and
// services/ogCard.ts / services/profileCard.ts for the caching.
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

ogRoutes.get("/profiles/:file", async (c) => {
  // Usernames are `[a-z0-9_]{3,30}` (see auth/auth.ts); anything else is not a
  // profile card. The `.jpg` keeps scrapers sniffing an image extension.
  const username = /^([a-z0-9_]{3,30})\.jpg$/.exec(c.req.param("file"))?.[1];
  if (!username) throw notFound("Not found.");

  // Built from the same public header a signed-out reader sees, so a card is
  // no more reachable than the profile. Private accounts still get one: the
  // card draws only the public header, never posts.
  const card = await profileCardService.profileCard(username);
  // No card could be drawn — a display name in a script the bundled face has
  // no glyphs for. Hand the scraper the brand image rather than a 404, same
  // as the post card above.
  if (!card) return c.redirect(`${await getOrigin()}/og-image.png`, 302);

  return new Response(card as BodyInit, {
    headers: {
      "content-type": "image/jpeg",
      // A day, not `immutable`: what this draws changes when the profile is
      // edited. The frontend's URL carries the profile's `updatedAt`, so an
      // edited profile is a new URL for scrapers to fetch.
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
});
