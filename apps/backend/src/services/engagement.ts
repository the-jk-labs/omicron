// SPDX-License-Identifier: AGPL-3.0-or-later
import * as likesRepo from "@/db/repositories/likes.ts";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as recommendationsRepo from "@/db/repositories/recommendations.ts";
import { postWithAuthor, type RecommendedBy } from "@/routes/serializers.ts";
import type { PostWithAuthor } from "@/db/repositories/posts.ts";

// Attaches like + comment + recommend engagement and tags to serialized posts.
// Counts (and the viewer's own like/recommend state) and tags are fetched in
// batched queries regardless of how many posts are in the list, so feeds stay
// cheap.

// A row carries `recommendedBy` only when it reached the list via a
// recommendation rather than authorship/follow (see services/feed.ts's merged
// "For you" stream); every other listing leaves it unset.
export type EnrichableRow = PostWithAuthor & { recommendedBy?: RecommendedBy | null };

export async function enrichPosts(rows: EnrichableRow[], viewerId: string | null) {
  const ids = rows.map((r) => r.post.id);
  const [likeStats, commentCounts, tagsByPost, recommendStats] = await Promise.all([
    likesRepo.statsFor(ids, viewerId),
    commentsRepo.countsFor(ids),
    tagsRepo.tagsForPosts(ids),
    recommendationsRepo.statsFor(ids, viewerId),
  ]);
  return rows.map((row) =>
    postWithAuthor(
      row,
      {
        likeCount: likeStats.get(row.post.id)?.count ?? 0,
        liked: likeStats.get(row.post.id)?.liked ?? false,
        commentCount: commentCounts.get(row.post.id) ?? 0,
        recommendCount: recommendStats.get(row.post.id)?.count ?? 0,
        recommended: recommendStats.get(row.post.id)?.recommended ?? false,
      },
      tagsByPost.get(row.post.id) ?? [],
      row.recommendedBy ?? null,
    )
  );
}

export async function enrichPost(row: EnrichableRow, viewerId: string | null) {
  const [enriched] = await enrichPosts([row], viewerId);
  return enriched;
}
