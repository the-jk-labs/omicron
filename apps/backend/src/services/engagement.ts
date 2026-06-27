// SPDX-License-Identifier: AGPL-3.0-or-later
import * as likesRepo from "@/db/repositories/likes.ts";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import { postWithAuthor } from "@/routes/serializers.ts";
import type { PostWithAuthor } from "@/db/repositories/posts.ts";

// Attaches like + comment engagement and tags to serialized posts. Counts (the
// viewer's own like state) and tags are fetched in batched queries regardless
// of how many posts are in the list, so feeds stay cheap.

export async function enrichPosts(rows: PostWithAuthor[], viewerId: string | null) {
  const ids = rows.map((r) => r.post.id);
  const [likeStats, commentCounts, tagsByPost] = await Promise.all([
    likesRepo.statsFor(ids, viewerId),
    commentsRepo.countsFor(ids),
    tagsRepo.tagsForPosts(ids),
  ]);
  return rows.map((row) =>
    postWithAuthor(row, {
      likeCount: likeStats.get(row.post.id)?.count ?? 0,
      liked: likeStats.get(row.post.id)?.liked ?? false,
      commentCount: commentCounts.get(row.post.id) ?? 0,
    }, tagsByPost.get(row.post.id) ?? [])
  );
}

export async function enrichPost(row: PostWithAuthor, viewerId: string | null) {
  const [enriched] = await enrichPosts([row], viewerId);
  return enriched;
}
