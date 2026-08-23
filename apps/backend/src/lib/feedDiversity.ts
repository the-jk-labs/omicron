// SPDX-License-Identifier: AGPL-3.0-or-later
// Feed author diversity for the discovery timelines (Global / Local).
//
// A single prolific author can otherwise fill a whole page — 8 of 20 posts
// from one "series" makes the instance look monotonous to a new reader. Two
// caps are applied while a page is assembled, in rank order:
//
//   consecutive — never more than MAX_CONSECUTIVE_SAME_AUTHOR posts by one
//                 author in a row, as long as another eligible post exists
//                 later in the fetched window to take its slot;
//   share       — at most maxPerAuthorPerPage(pageSize) posts by one author
//                 on a single page (~20%, minimum 2).
//
// Held-back posts are not deleted: they remain on the author's profile, tag
// pages, search and trending. On the timeline itself a held-back post is
// simply skipped; one that sits before the page's cursor is trimmed from this
// timeline, one after it is re-offered with the next page.

export const MAX_CONSECUTIVE_SAME_AUTHOR = 2;

// ~1/5 of a page per author (4 of 20), never fewer than 2 so a small
// instance's single active writer keeps some presence.
export function maxPerAuthorPerPage(pageSize: number): number {
  return Math.max(2, Math.ceil(pageSize / 5));
}

// Running caps across the windows of one page assembly. `lastAuthor` /
// `streak` track the consecutive cap; `counts` the per-author share.
export type DiversityState = {
  counts: Record<string, number>;
  lastAuthor: string | null;
  streak: number;
};

export function freshDiversityState(): DiversityState {
  return { counts: {}, lastAuthor: null, streak: 0 };
}

// Walks `rows` in rank order, keeping at most `pageSize` posts under both
// caps. The state carries over between calls so several fetched windows can
// fill one page under shared counters. Returns the kept rows plus `scanned` —
// how many input rows were consumed (kept or deliberately skipped), which is
// what the timeline's keyset cursor advances past. When nothing later in the
// window fits either cap, the caps relax rather than hand back a short page:
// starving the feed would be worse than a third post in a row.
export function diversify<T>(
  rows: readonly T[],
  pageSize: number,
  authorOf: (row: T) => string,
  state: DiversityState = freshDiversityState(),
): { kept: T[]; scanned: number; state: DiversityState } {
  const shareCap = maxPerAuthorPerPage(pageSize);
  const kept: T[] = [];

  // Would placing rows[j] break a cap right now?
  const blockedAt = (j: number): boolean => {
    const key = authorOf(rows[j]);
    const streak = key === state.lastAuthor ? state.streak + 1 : 1;
    return streak > MAX_CONSECUTIVE_SAME_AUTHOR || (state.counts[key] ?? 0) >= shareCap;
  };

  const accept = (row: T) => {
    const key = authorOf(row);
    state.streak = key === state.lastAuthor ? state.streak + 1 : 1;
    state.lastAuthor = key;
    state.counts[key] = (state.counts[key] ?? 0) + 1;
    kept.push(row);
  };

  let i = 0;
  while (kept.length < pageSize && i < rows.length) {
    if (!blockedAt(i)) {
      accept(rows[i]);
      i++;
      continue;
    }
    // Look ahead for an eligible post to take this slot instead; skipping is
    // only allowed while such a post exists, so every call accepts at least
    // one row and page assembly always advances.
    let relief = -1;
    for (let j = i + 1; j < rows.length && relief === -1; j++) {
      if (!blockedAt(j)) relief = j;
    }
    if (relief === -1) accept(rows[i]); // caps relax — nothing else fits
    i++; // accepted just now, or deliberately held back
  }

  return { kept, scanned: i, state };
}
