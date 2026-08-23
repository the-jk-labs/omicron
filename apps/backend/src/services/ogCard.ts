// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";
import { renderOgCard } from "@/lib/ogCard.ts";
import { hashToken } from "@/lib/tokens.ts";
import { getAppDomain } from "@/services/instanceSetup.ts";
import * as postsService from "@/services/posts.ts";

// On-disk caching for generated post share cards. The drawing itself is in
// lib/ogCard.ts, which explains why a card exists at all.
//
// Same shape as services/shareImage.ts, and for the same reason: a card is only
// ever fetched by a link-preview scraper, once per post per platform, so one
// render amortised over the life of the post is the whole cost.

/**
 * Where a card is cached.
 *
 * The hash is of everything drawn, so a retitle (or a renamed author, or a
 * renamed instance) writes a new file rather than serving a stale one. The
 * superseded file is left behind — a few tens of kilobytes per retitle, against
 * the alternative of tracking which cards belong to which post.
 */
function cachePath(postId: string, digest: string): string {
  return `${config.UPLOADS_DIR}/og-cards/${postId}-${digest.slice(0, 16)}.jpg`;
}

/**
 * The share card for a public post, generated on first request and cached.
 *
 * Throws 404 (from the posts service) for a post the caller may not see, so a
 * draft's card is no more reachable than the draft. Returns null when no card
 * can be drawn — a remote post, an untitled one, or a title in a script the
 * bundled face has no glyphs for — and the caller falls back to the instance's
 * brand image.
 */
export async function postCard(postId: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const { post, localAuthor } = await postsService.getPost(postId, null);
  // A federated copy is not this instance's to put its own name on: the card's
  // footer would credit us for someone else's article. Their instance draws
  // their card.
  if (post.remote || !post.title?.trim()) return null;

  const text = {
    title: post.title,
    byline: localAuthor?.displayName ?? "",
    site: await getAppDomain(),
  };
  const digest = await hashToken(`${text.title}\n${text.byline}\n${text.site}`);
  const cached = cachePath(postId, digest);
  try {
    return await Deno.readFile(cached);
  } catch {
    // Not built yet.
  }

  const jpeg = await renderOgCard(text);
  if (!jpeg) return null;

  await Deno.mkdir(`${config.UPLOADS_DIR}/og-cards`, { recursive: true });
  // Written to a temporary file and renamed into place, so two scrapers
  // arriving together can never serve each other a half-written image.
  const tmp = `${cached}.${crypto.randomUUID()}.tmp`;
  try {
    await Deno.writeFile(tmp, jpeg);
    await Deno.rename(tmp, cached);
  } catch {
    // A failed cache write costs a re-render next time; it must not cost the
    // caller their card.
    await Deno.remove(tmp).catch(() => {});
  }
  return jpeg;
}
