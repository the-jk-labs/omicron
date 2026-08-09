// SPDX-License-Identifier: AGPL-3.0-or-later
// The banner fallback, mirrored client-side for the editor.
//
// A post's banner is resolved on the server (backend lib/cover.ts) and arrives
// as `post.bannerUrl`, which is what every reader surface renders. The editor
// is the one place that cannot wait for a round trip: it has to show the author
// what their banner will be while they are still typing, before anything has
// been saved. So the same rule — the chosen cover, else the body's first image
// — is repeated here, over the HTML Tiptap is currently producing.
//
// Keep it in step with the backend's `firstBodyImage`. A divergence would show
// an author one banner in the editor and publish another, which is worse than
// having no preview at all.

const IMG_SRC = /<img\b[^>]*?\ssrc="([^"]*)"/i;

/**
 * The first image in a post body, or null when it has none.
 *
 * The body here is live editor output rather than sanitized storage, so the
 * `[^>]*` attribute match is doing less work than its backend twin: Tiptap
 * serializes double-quoted attributes, and anything it produces has been
 * through the same sanitizer by the time it is read back.
 */
export function firstBodyImage(html: string): string | null {
  const src = html.match(IMG_SRC)?.[1]?.trim();
  return src ? src : null;
}

// A path served by this instance's own uploads route — the only relative form
// that is ours to resolve. Mirrors the backend's UPLOAD_PATH (lib/cover.ts).
const UPLOAD_PATH = /^\/api\/uploads\/[A-Za-z0-9-]+\.(?:png|jpe?g|webp|gif)$/;

/**
 * A banner URL in the absolute form an Open Graph scraper needs.
 *
 * A banner uploaded here is stored root-relative (`/api/uploads/…`), which is
 * fine inside the page but useless to a scraper — it would resolve the path
 * against itself — so those are joined to our canonical origin. Anything
 * already absolute is on someone else's host and is left alone.
 *
 * Every other shape returns undefined so the caller falls back to the brand
 * image. That case is real rather than theoretical: a federated post's banner
 * can be the first image of a body written on another instance, and if that
 * instance used a relative `src`, resolving it here would point the tag at a
 * path on *our* domain that has nothing behind it. No image beats a broken one.
 */
export function absoluteBanner(
  url: string | null | undefined,
  origin: string,
): string | undefined {
  if (!url) return undefined;
  if (UPLOAD_PATH.test(url)) return `${origin}${url}`;
  if (!/^https?:\/\//i.test(url)) return undefined;
  try {
    return new URL(url).href;
  } catch {
    return undefined;
  }
}
