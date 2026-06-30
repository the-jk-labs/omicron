// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { posts, postViews, postViewSeen } from "@/db/schema.ts";

// Aggregate, privacy-preserving on-instance view counts. Stores only per-(post,
// day) integers — never a per-visit row, never an identifier. See ANALYTICS.md.

export type DayTotals = { day: string; views: number };

// Records one view for (post, day). Called only after markSeen confirms this is
// the reader's first sighting today, so the counter is distinct-readers-per-day
// and a refresh never inflates it.
export async function recordView(postId: string, day: string) {
  await db
    .insert(postViews)
    .values({ postId, day, views: 1 })
    .onConflictDoUpdate({
      target: [postViews.postId, postViews.day],
      set: { views: sql`${postViews.views} + 1` },
    });
}

// Atomically claims a (day, post, visitorHash). Returns true if this is the
// first sighting today (→ a unique view), false if already counted. The hash is
// one-way and the day's salt is discarded at midnight, so it cannot be reversed.
export async function markSeen(
  day: string,
  postId: string,
  visitorHash: string,
): Promise<boolean> {
  const inserted = await db
    .insert(postViewSeen)
    .values({ day, postId, visitorHash })
    .onConflictDoNothing()
    .returning({ day: postViewSeen.day });
  return inserted.length > 0;
}

// Drops de-duplication rows for days before `day`. They exist only to dedupe
// within a single day; keeping them would serve no purpose. Called daily.
export async function pruneSeenBefore(day: string) {
  await db.delete(postViewSeen).where(lt(postViewSeen.day, day));
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
