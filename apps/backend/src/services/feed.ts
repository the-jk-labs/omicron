// SPDX-License-Identifier: AGPL-3.0-or-later
import * as postsRepo from "@/db/repositories/posts.ts";
import * as recommendationsRepo from "@/db/repositories/recommendations.ts";
import { type Cursor, DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";
import type { EnrichableRow } from "@/services/engagement.ts";

// Personalized home timeline ("For you"): own + followed-author posts, merged
// with posts *recommended* ("boosted") by followed authors — the two halves of
// the feed's promise (recommendations never appear on Local or Global, only
// here and on the recommender's profile "Recommendations" tab).
//
// The two sources sort on different clocks — a post's own publish time versus
// the moment someone recommended it — so a single SQL query can't keyset-page
// them together. Instead each is fetched as its own independently
// keyset-paginated stream and merged here. The opaque cursor threads both
// streams' positions (plus whether either is fully drained) so "load more"
// resumes both correctly without ever re-showing or skipping a row.

type StreamCursor = { cursor: Cursor | null; done: boolean };
type FeedCursor = { authored: StreamCursor; recommended: StreamCursor };

const START: StreamCursor = { cursor: null, done: false };
const DONE: StreamCursor = { cursor: null, done: true };

function decodeFeedCursor(raw: string | null): FeedCursor {
  if (!raw) return { authored: START, recommended: START };
  try {
    const parsed = JSON.parse(atob(raw));
    return { authored: parsed.authored ?? START, recommended: parsed.recommended ?? START };
  } catch {
    return { authored: START, recommended: START };
  }
}

function encodeFeedCursor(c: FeedCursor): string {
  return btoa(JSON.stringify(c));
}

type MergedRow =
  | { source: "authored"; feedAt: Date; raw: postsRepo.PostWithAuthor }
  | { source: "recommended"; feedAt: Date; raw: recommendationsRepo.FeedRecommendationRow };

// A stream's next cursor points right after the last row *of that stream*
// consumed this page; a stream that contributed nothing this page keeps its
// incoming cursor unchanged, so its untouched rows are re-offered (and
// re-merged) once the other stream's fresher rows are exhausted — never
// skipped, never duplicated. "Drained" only once the DB confirmed no more
// rows exist beyond what was fetched AND every fetched row was consumed.
function countSource(rows: MergedRow[], source: MergedRow["source"]): number {
  return rows.reduce((n, r) => n + (r.source === source ? 1 : 0), 0);
}

export async function homeFeed(userId: string, cursorRaw: string | null) {
  const cursor = decodeFeedCursor(cursorRaw);
  const limit = DEFAULT_PAGE_SIZE;

  const [authoredRows, recommendedRows] = await Promise.all([
    cursor.authored.done ? [] : postsRepo.listFeed(userId, cursor.authored.cursor, limit),
    cursor.recommended.done ? [] : recommendationsRepo.listFeedFor(userId, cursor.recommended.cursor, limit),
  ]);

  const authoredHasMore = authoredRows.length > limit;
  const authoredPage = authoredHasMore ? authoredRows.slice(0, limit) : authoredRows;
  const recommendedHasMore = recommendedRows.length > limit;
  const recommendedPage = recommendedHasMore ? recommendedRows.slice(0, limit) : recommendedRows;

  // Both pages are already sorted newest-first on their own clock; merge on
  // that clock and take the newest `limit`. Array.sort is stable, so equal
  // timestamps keep their original (authored-before-recommended) order.
  const merged: MergedRow[] = [
    ...authoredPage.map((raw): MergedRow => ({
      source: "authored",
      feedAt: raw.post.createdAt,
      raw,
    })),
    ...recommendedPage.map((raw): MergedRow => ({
      source: "recommended",
      feedAt: raw.recommendedAt,
      raw,
    })),
  ].toSorted((a, b) => b.feedAt.getTime() - a.feedAt.getTime());

  const page = merged.slice(0, limit);

  // The index of the last (lowest-ranked) row from each source that made it
  // into this page — a forward scan keeping the latest match lands on it,
  // since `page` is ordered newest-first.
  let lastAuthoredIdx = -1;
  let lastRecommendedIdx = -1;
  page.forEach((row, i) => {
    if (row.source === "authored") lastAuthoredIdx = i;
    else lastRecommendedIdx = i;
  });

  function advance(
    lastIdx: number,
    source: MergedRow["source"],
    fetchedCount: number,
    hasMore: boolean,
    incoming: StreamCursor,
    cursorOf: (row: MergedRow) => Cursor,
  ): StreamCursor {
    if (lastIdx === -1) {
      // Nothing from this source made this page. Empty + no more rows behind
      // it: done. Otherwise its rows are still unconsumed — keep the incoming
      // cursor so they're re-offered (and re-merged) next time.
      return !hasMore && fetchedCount === 0 ? DONE : incoming;
    }
    // Drained only once the DB confirmed no more rows exist beyond what was
    // fetched AND every one of those fetched rows was consumed this page —
    // some may have been deferred to the next page by the merge/limit trim.
    const drained = !hasMore && countSource(page, source) === fetchedCount;
    return drained ? DONE : { cursor: cursorOf(page[lastIdx]), done: false };
  }

  const authored = advance(
    lastAuthoredIdx,
    "authored",
    authoredPage.length,
    authoredHasMore,
    cursor.authored,
    (row) => ({
      createdAt: row.raw.post.createdAt.toISOString(),
      id: row.raw.post.id,
    }),
  );
  const recommended = advance(
    lastRecommendedIdx,
    "recommended",
    recommendedPage.length,
    recommendedHasMore,
    cursor.recommended,
    (row) => ({
      createdAt: (row.raw as recommendationsRepo.FeedRecommendationRow).recommendedAt.toISOString(),
      id: (row.raw as recommendationsRepo.FeedRecommendationRow).recommendationId,
    }),
  );

  const nextCursor = authored.done && recommended.done ? null : encodeFeedCursor({ authored, recommended });

  const items: EnrichableRow[] = page.map((row) =>
    row.source === "authored"
      ? row.raw
      : {
          post: row.raw.post,
          localAuthor: row.raw.localAuthor,
          remoteActor: row.raw.remoteActor,
          recommendedBy: {
            id: row.raw.recommenderId,
            username: row.raw.recommenderUsername,
            displayName: row.raw.recommenderDisplayName,
            avatarUrl: row.raw.recommenderAvatarUrl,
            remote: row.raw.recommenderRemote,
            recommendedAt: row.raw.recommendedAt,
          },
        },
  );

  return { items, nextCursor };
}
