// SPDX-License-Identifier: AGPL-3.0-or-later
// Canonical, title-based URLs for posts — e.g.
//   /@burk/europe-is-ditching-visa-and-mastercard-and-its-a-huge-step-9e962281
// The trailing token is the first block of the post UUID (8 hex chars); the
// backend resolves it by prefix. The slug is cosmetic and regenerated from the
// title, so renaming a post is safe and stale slugs still redirect to canonical.

import type { Post } from "$lib/types";

// A trailing short id (8+ hex) or a full UUID anywhere (for legacy links).
// The short id may follow a slug (`some-title-9e962281`) or stand alone when a
// post has no title (`9e962281`), so the leading dash is optional.
const FULL_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const SHORT_ID = /(?:^|-)([0-9a-f]{8,})$/i;

/** Short, URL-facing id for a post: the first block of its UUID. */
function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Kebab-case an arbitrary title; ASCII-only, matching Medium-style slugs. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/['\u2019`]/g, "") // drop apostrophes so "it's" \u2192 "its"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Canonical path for a post, e.g. `/@user/some-title-9e962281`. */
export function postPath(post: Pick<Post, "id" | "title" | "author">): string {
  const slug = post.title ? slugify(post.title) : "";
  const id = shortId(post.id);
  const tail = slug ? `${slug}-${id}` : id;
  return `/@${post.author.username}/${tail}`;
}

/**
 * Resolve the post id from a `[slug]` route param. Prefers a full UUID (legacy
 * permalinks), then falls back to the trailing short id. Returns null if neither
 * is present.
 */
export function postIdFromSlug(slug: string): string | null {
  const full = slug.match(FULL_UUID)?.[0];
  if (full) return full.toLowerCase();
  return slug.match(SHORT_ID)?.[1].toLowerCase() ?? null;
}
