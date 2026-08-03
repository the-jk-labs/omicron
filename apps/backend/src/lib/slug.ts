// SPDX-License-Identifier: AGPL-3.0-or-later

// Kebab-case slugs. Kept byte-for-byte in step with the frontend's `slugify`
// (apps/frontend/src/lib/links.ts), which builds the canonical
// `/@user/some-title-9e962281` post URLs — an ingesting CMS that derives its
// key from a title must land on the same string the reader sees in the
// address bar.

/** Kebab-case an arbitrary title; ASCII-only, matching Medium-style slugs. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/['\u2019`]/g, "") // drop apostrophes so "it's" -> "its"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
