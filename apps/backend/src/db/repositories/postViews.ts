// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { posts, postViews, postViewSeen } from "@/db/schema.ts";

// Aggregate, privacy-preserving on-instance view counts. Stores only per-(post,
// day) integers — never a per-visit row, never an identifier. See ANALYTICS.md.

export type DayTotals = { day: string; views: number };

// Records one view for (post, day). Called only after markSeen confirms this
// visitor has never been counted for this post before, so the lifetime total
// is distinct-readers-per-post and a repeat visit — same day or years later —
// never inflates it.
export async function recordView(postId: string, day: string) {
  await db
    .insert(postViews)
    .values({ postId, day, views: 1 })
    .onConflictDoUpdate({
      target: [postViews.postId, postViews.day],
      set: { views: sql`${postViews.views} + 1` },
    });
}

// Atomically claims a (post, visitorKey). Returns true if this is the
// reader's first-ever sighting on this post (→ a unique view), false if
// already counted. visitorKey is a one-way hash — never a raw id or cookie.
export async function markSeen(
  postId: string,
  visitorKey: string,
): Promise<boolean> {
  const inserted = await db
    .insert(postViewSeen)
    .values({ postId, visitorKey })
    .onConflictDoNothing()
    .returning({ postId: postViewSeen.postId });
  return inserted.length > 0;
}

// Lifetime view totals per post, for the requested posts only.
export async function totalsForPosts(postIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (postIds.length === 0) return map;
  const rows = await db
    .select({
      postId: postViews.postId,
      views: sql<number>`coalesce(sum(${postViews.views}), 0)::int`,
    })
    .from(postViews)
    .where(inArray(postViews.postId, postIds))
    .groupBy(postViews.postId);
  for (const r of rows) map.set(r.postId, r.views);
  return map;
}

// Daily view totals across all of an author's posts, from `fromDay` (inclusive).
// Powers the dashboard's views-over-time chart.
export function dailyTotalsForAuthor(authorId: string, fromDay: string): Promise<DayTotals[]> {
  return db
    .select({
      day: postViews.day,
      views: sql<number>`coalesce(sum(${postViews.views}), 0)::int`,
    })
    .from(postViews)
    .innerJoin(posts, eq(posts.id, postViews.postId))
    .where(and(eq(posts.authorId, authorId), gte(postViews.day, fromDay)))
    .groupBy(postViews.day)
    .orderBy(postViews.day);
}
