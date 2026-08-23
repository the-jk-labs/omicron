// SPDX-License-Identifier: AGPL-3.0-or-later
import { badRequest } from "@/lib/http.ts";

// A post's banner image: what it is, what an author is allowed to store as one,
// and how it becomes an absolute URL for the places that need one.
//
// Two values are in play and they are not the same thing:
//
//   `coverUrl`  — the author's explicit choice, null when they made none.
//   the banner  — what any reader surface actually shows: the chosen cover, or
//                 failing that the first image in the body.
//
// Keeping them apart is what makes the fallback work. Resolving it at write
// time would mean storing a derived value as if it had been chosen, and an
// author who then swapped out the opening photo would be left with a banner
// pointing at an image no longer in their post. Deriving it on read costs one
// regex over HTML we are already serializing and is always current — the same
// reasoning as lib/legacyMarkdown and the frontend's body-image deferral.

// The first `<img src="…">` in a post body.
//
// Matching attributes with `[^>]*` is only safe because a stored body has been
// through the sanitizer (lib/sanitize.ts), which re-serializes every attribute
// double-quoted and entity-encodes any `>` inside a value. `src` is in its img
// allowlist and is always present on an image the editor produced.
const IMG_SRC = /<img\b[^>]*?\ssrc="([^"]*)"/i;

export function firstBodyImage(html: string): string | null {
  const src = html.match(IMG_SRC)?.[1]?.trim();
  return src ? src : null;
}

/**
 * The banner to show for a post: the author's cover, else the first image in
 * the body, else nothing.
 */
export function bannerOf(post: { coverUrl: string | null; contentHtml: string }): string | null {
  return post.coverUrl ?? firstBodyImage(post.contentHtml);
}

// Where this instance's own uploads live (see routes/media.ts). A banner
// uploaded in the editor is stored as this root-relative path rather than an
// absolute URL, so an instance that later changes domain keeps working.
const UPLOAD_PATH = /^\/api\/uploads\/[A-Za-z0-9-]+\.(?:png|jpe?g|webp|gif)$/;
const ABSOLUTE_HTTP = /^https?:\/\/\S+$/i;
const MAX_URL_LENGTH = 2000;

/**
 * Make a banner URL absolute against this instance's origin.
 *
 * A local upload is stored root-relative, but Open Graph scrapers and remote
 * instances resolve a relative URL against *themselves*, so every context that
 * publishes the banner outside this document has to absolutize it first.
 * Returns null for anything unparseable rather than emitting a broken link.
 */
export function absoluteBanner(url: string | null, origin: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, origin).href;
  } catch {
    return null;
  }
}

/**
 * Validate an author-supplied banner URL.
 *
 * Two shapes are accepted and nothing else: an absolute http(s) URL (an
 * Unsplash photo, or a banner on an ingesting CMS's own host) and a path into
 * this instance's uploads. The narrow allowlist is the point — this value is
 * rendered as an image `src` and published as an OG tag, so `javascript:` and
 * `data:` must never reach it, and a path that isn't an upload has no business
 * being fetched as one.
 *
 * `null` is a deliberate clear, distinct from the field being absent.
 */
export function normalizeCoverUrl(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const url = raw.trim();
  if (!url) return null;
  if (url.length > MAX_URL_LENGTH) throw badRequest("That banner URL is too long.");
  if (UPLOAD_PATH.test(url) || ABSOLUTE_HTTP.test(url)) return url;
  throw badRequest("A banner must be an uploaded image or an absolute http(s) URL.");
}

/**
 * Attribution for a banner taken from a stock provider.
 *
 * One shape covers every provider, because every provider's terms ask for the
 * same three things in some combination: who made the photo, where it came
 * from, and what licence it carries.
 *
 *   name / nameUrl      the photographer, and a link to them
 *   source / sourceUrl  where the photo lives ("Unsplash", "Flickr", …)
 *   license/licenseUrl  the Creative Commons licence, when there is one —
 *                       absent for Unsplash, which serves photos under its own
 *                       licence rather than a named public one
 *
 * Rendered as a single line under the banner (see the post page).
 */
export type CoverCredit = {
  name: string;
  nameUrl: string;
  source: string;
  sourceUrl: string;
  license?: string;
  licenseUrl?: string;
};

const MAX_CREDIT_TEXT = 120;

function creditText(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > MAX_CREDIT_TEXT) throw badRequest(`The banner credit's ${field} is too long.`);
  return text;
}

function creditUrl(value: unknown, field: string): string {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url) return "";
  if (url.length > MAX_URL_LENGTH || !ABSOLUTE_HTTP.test(url)) {
    throw badRequest(`The banner credit's ${field} must be an absolute http(s) URL.`);
  }
  return url;
}

/**
 * Validate the attribution that rides along with a banner.
 *
 * The four required parts arrive together or not at all: a name with nowhere to
 * link is not a credit anyone can follow, and a link with nothing labelling it
 * credits no one. Every URL is absolute http(s) for the same reason the cover's
 * is — each becomes an `href` on the post page.
 *
 * The licence is optional but paired: a licence name with no link tells a
 * reader which terms apply without letting them read them, which is exactly
 * what a Creative Commons attribution is required to provide.
 */
export function normalizeCoverCredit(
  raw: Partial<Record<keyof CoverCredit, unknown>> | null | undefined,
): CoverCredit | null {
  if (raw === null || raw === undefined) return null;

  const name = creditText(raw.name, "name");
  const source = creditText(raw.source, "source");
  const nameUrl = creditUrl(raw.nameUrl, "creator link");
  const sourceUrl = creditUrl(raw.sourceUrl, "source link");
  const license = creditText(raw.license, "licence");
  const licenseUrl = creditUrl(raw.licenseUrl, "licence link");

  // Nothing supplied at all is "no credit", not a malformed one — an uploaded
  // banner takes this path.
  if (!name && !nameUrl && !source && !sourceUrl && !license && !licenseUrl) return null;

  if (!name || !nameUrl || !source || !sourceUrl) {
    throw badRequest("A banner credit needs a creator and a source, each with a link.");
  }
  if (Boolean(license) !== Boolean(licenseUrl)) {
    throw badRequest("A banner credit's licence needs both a name and a link.");
  }

  return {
    name,
    nameUrl,
    source,
    sourceUrl,
    ...(license ? { license, licenseUrl } : {}),
  };
}
