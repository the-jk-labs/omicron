// SPDX-License-Identifier: AGPL-3.0-or-later

// Tag normalization. A tag has two forms:
//   - `slug`: the normalized key used for uniqueness, URLs and matching.
//   - `name`: the display form (the slug, but kept separate so a future change
//     to slugging never loses the human-facing label).
// We keep unicode letters, digits and underscores (so non-Latin hashtags work,
// matching Mastodon), lowercase everything, strip a leading `#`, and drop any
// other punctuation/whitespace. Returns "" for anything that normalizes empty.

export const MAX_TAG_LENGTH = 50;
export const MAX_TAGS_PER_POST = 5;
export const MAX_PROFILE_TAGS = 10;

export function normalizeTag(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^#+/, "")
    // Keep unicode letters/marks/numbers and underscore; drop everything else
    // (spaces, punctuation, emoji). `u` flag enables the \p{...} classes.
    .replace(/[^\p{L}\p{M}\p{N}_]+/gu, "")
    .slice(0, MAX_TAG_LENGTH);
}

// Normalizes a list of raw tag inputs into unique, non-empty slugs, preserving
// first-seen order. Used by the post service when saving an article's tags.
export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const slug = normalizeTag(r);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}
