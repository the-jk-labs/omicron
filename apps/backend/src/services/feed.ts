import * as postsRepo from "@/db/repositories/posts.ts";
import { type Cursor, DEFAULT_PAGE_SIZE, encodeCursor } from "@/lib/pagination.ts";

// Personalized home timeline: own posts + followed authors, cursor-paginated.
export async function homeFeed(userId: string, cursor: Cursor | null) {
  const rows = await postsRepo.listFeed(userId, cursor, DEFAULT_PAGE_SIZE);
  const hasMore = rows.length > DEFAULT_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, DEFAULT_PAGE_SIZE) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last
      ? encodeCursor({ createdAt: last.post.createdAt.toISOString(), id: last.post.id })
      : null,
  };
}
