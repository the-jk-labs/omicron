import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { commentLikes } from "@/db/schema.ts";

// Comment like-edge DB access. Mirrors `likes` for posts; liking is idempotent
// via the unique (comment, user) index.

export type LikeStats = { count: number; liked: boolean };

export async function add(commentId: string, userId: string) {
  await db.insert(commentLikes).values({ commentId, userId }).onConflictDoNothing();
}

export async function remove(commentId: string, userId: string) {
  await db.delete(commentLikes).where(
    and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId)),
  );
}

// Like count + whether `viewerId` liked it, for many comments in one query.
export async function statsFor(
  commentIds: string[],
  viewerId: string | null,
): Promise<Map<string, LikeStats>> {
  const map = new Map<string, LikeStats>();
  if (commentIds.length === 0) return map;

  const rows = await db
    .select({
      commentId: commentLikes.commentId,
      count: sql<number>`count(*)::int`,
      liked: viewerId
        ? sql<boolean>`bool_or(${commentLikes.userId} = ${viewerId})`
        : sql<boolean>`false`,
    })
    .from(commentLikes)
    .where(inArray(commentLikes.commentId, commentIds))
    .groupBy(commentLikes.commentId);

  for (const r of rows as { commentId: string; count: number; liked: boolean }[]) {
    map.set(r.commentId, { count: r.count, liked: !!r.liked });
  }
  return map;
}
