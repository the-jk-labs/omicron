// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { likes } from "@/db/schema.ts";

// Like-edge DB access. Liking is idempotent via the unique (post, user) index.

export type LikeStats = { count: number; liked: boolean };

export async function add(postId: string, userId: string) {
  await db.insert(likes).values({ postId, userId }).onConflictDoNothing();
}

export async function remove(postId: string, userId: string) {
  await db.delete(likes).where(and(eq(likes.postId, postId), eq(likes.userId, userId)));
}

// Like count + whether `viewerId` liked it, for many posts in one query.
export async function statsFor(
  postIds: string[],
  viewerId: string | null,
): Promise<Map<string, LikeStats>> {
  const map = new Map<string, LikeStats>();
  if (postIds.length === 0) return map;

  const rows = await db
    .select({
      postId: likes.postId,
      count: sql<number>`count(*)::int`,
      liked: viewerId
        ? sql<boolean>`bool_or(${likes.userId} = ${viewerId})`
        : sql<boolean>`false`,
    })
    .from(likes)
    .where(inArray(likes.postId, postIds))
    .groupBy(likes.postId);

  for (const r of rows as { postId: string; count: number; liked: boolean }[]) {
    map.set(r.postId, { count: r.count, liked: !!r.liked });
  }
  return map;
}