// SPDX-License-Identifier: AGPL-3.0-or-later
// Canonical, title-based URLs for posts — e.g.
//   /@burk/europe-is-ditching-visa-and-mastercard-and-its-a-huge-step
// The slug is the post's address: the backend stores it (unique per author) and
// resolves it directly. Retitling a post mints a new slug and keeps the old one
// redirecting, so links already shared stay good, and permalinks issued before
// slugs existed — `<slug>-9e962281`, the first block of the post's UUID — still
// resolve by that trailing id and 308 to the current URL.
//
// A post with no slug (remote, or untitled) is addressed by that short id alone.

import type { Post, ReadingList } from "$lib/types";

// A trailing short id (8+ hex) or a full UUID anywhere (for legacy links).
// The short id may follow a slug (`some-title-9e962281`) or stand alone when a
// post has no title (`9e962281`), so the leading dash is optional.
const FULL_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const SHORT_ID = /(?:^|-)([0-9a-f]{8,})$/i;

/** Short, URL-facing id for a post: the first block of its UUID. */
function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Letters that carry no ASCII decomposition, so NFKD leaves them intact and the
 * `[^a-z0-9]` sweep below would otherwise turn each one into a dash — a title
 * written in Azerbaijani came out as `s-rz-nisl-r` instead of `sozunuslar`.
 *
 * Mirrors apps/backend/src/lib/slug.ts, which is what actually stores the slug;
 * keep the two identical. See that file for why non-Latin scripts are absent.
 */
const TRANSLITERATIONS: Record<string, string> = {
  "ə": "e",
  "ı": "i",
  "ø": "o",
  "đ": "d",
  "ð": "d",
  "ħ": "h",
  "ŋ": "n",
  "ł": "l",
  "ß": "ss",
  "æ": "ae",
  "œ": "oe",
  "þ": "th",
};

const TRANSLITERATE_RE = new RegExp(`[${Object.keys(TRANSLITERATIONS).join("")}]`, "g");

/** Kebab-case an arbitrary title; ASCII-only, matching Medium-style slugs. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(TRANSLITERATE_RE, (ch) => TRANSLITERATIONS[ch])
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/['\u2019`]/g, "") // drop apostrophes so "it's" → "its"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Canonical path for a post, e.g. `/@user/some-title`. */
export function postPath(
  post: Pick<Post, "id" | "slug"> & { author: { username: string } },
): string {
  // The slug is the server's, not a local re-derivation: it is what disambiguates
  // two posts with the same title, and what an already-shared link redirects to.
  return `/@${post.author.username}/${post.slug || shortId(post.id)}`;
}

/**
 * Resolve the post id from a `[slug]` route param. Prefers a full UUID (legacy
 * permalinks), then falls back to the trailing short id. Returns null if neither
 * is present — a slug-addressed post, which only the backend can resolve.
 */
export function postIdFromSlug(slug: string): string | null {
  const full = slug.match(FULL_UUID)?.[0];
  if (full) return full.toLowerCase();
  return slug.match(SHORT_ID)?.[1].toLowerCase() ?? null;
}

/** Canonical path for a reading list, e.g. `/lists/weekend-reads-66635376`. */
export function listPath(list: Pick<ReadingList, "id" | "title">): string {
  const slug = slugify(list.title);
  const id = shortId(list.id);
  return `/lists/${slug ? `${slug}-${id}` : id}`;
}

/** Resolve a list id from a `[slug]` route param (full UUID or trailing short id). */
export function listIdFromSlug(slug: string): string | null {
  const full = slug.match(FULL_UUID)?.[0];
  if (full) return full.toLowerCase();
  return slug.match(SHORT_ID)?.[1].toLowerCase() ?? null;
}
