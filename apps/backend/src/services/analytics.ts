// SPDX-License-Identifier: AGPL-3.0-or-later
import * as postViewsRepo from "@/db/repositories/postViews.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as likesRepo from "@/db/repositories/likes.ts";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import { clientIp, isBot, readerOptedOut, today, visitorHash } from "@/lib/analytics.ts";
import { onInstanceViewsEnabled } from "@/services/settings.ts";

// The writer dashboard's read/write surface. Combines two clearly separated
// sources: consensual fediverse engagement and aggregate-only on-instance views.
// See ANALYTICS.md for the privacy model.

// Records a view of `postId` from an incoming request, but only when all of the
// privacy gates pass: the instance has on-instance views enabled, the reader has
// not signalled DNT/GPC, and the client is not an obvious bot. Stores only
// aggregate counts — never the IP, user-agent, or any per-visit row. Best-effort
// and fire-and-forget: a failure here must never affect serving the page.
export async function recordPostView(postId: string, headers: Headers): Promise<void> {
  if (readerOptedOut(headers)) return;
  const userAgent = headers.get("user-agent") ?? "";
  if (isBot(userAgent)) return;
  if (!(await onInstanceViewsEnabled())) return;

  const day = today();
  pruneStaleSeen(day);
  const hash = await visitorHash(clientIp(headers), userAgent);
  // One view per reader per day: a repeat sighting (refresh, re-open) is ignored,
  // so the count can't be inflated by reloading the page.
  const firstToday = await postViewsRepo.markSeen(day, postId, hash);
  if (firstToday) await postViewsRepo.recordView(postId, day);
}

// The de-duplication rows only matter within their own day. Without a scheduler,
// the first view of each new UTC day drops every earlier day's rows — keeping
// the table tiny and ensuring stale visitor hashes never linger. Fire-and-forget.
let lastPrunedDay = "";
function pruneStaleSeen(day: string): void {
  if (day === lastPrunedDay) return;
  lastPrunedDay = day;
  postViewsRepo.pruneSeenBefore(day).catch(() => {});
}

export type PostStat = {
  postId: string;
  title: string | null;
  createdAt: Date;
  views: number;
  likes: number;
  comments: number;
};

export type DashboardSummary = {
  // false when on-instance views are disabled for this instance — the UI then
  // omits the views columns entirely rather than showing a misleading zero.
  onInstanceViews: boolean;
  totals: {
    views: number;
    likes: number;
    comments: number;
    followers: number;
  };
  series: postViewsRepo.DayTotals[];
  posts: PostStat[];
};

// Builds the dashboard for one author over their own posts. Engagement (likes,
// comments, followers) is always included — those are public activities sent to
// the author. View counts are included only when the instance enables them.
export async function dashboardFor(
  authorId: string,
  sinceDays = 30,
): Promise<DashboardSummary> {
  const viewsEnabled = await onInstanceViewsEnabled();
  const posts = await postsRepo.publishedBriefByAuthor(authorId);
  const ids = posts.map((p) => p.id);

  const [likeStats, commentCounts, viewTotals, follows] = await Promise.all([
    likesRepo.statsFor(ids, null),
    commentsRepo.countsFor(ids),
    viewsEnabled ? postViewsRepo.totalsForPosts(ids) : Promise.resolve(new Map<string, number>()),
    followsRepo.counts(authorId),
  ]);

  const fromDay = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
  const series = viewsEnabled ? await postViewsRepo.dailyTotalsForAuthor(authorId, fromDay) : [];

  const stats: PostStat[] = posts.map((p) => ({
    postId: p.id,
    title: p.title,
    createdAt: p.createdAt,
    views: viewTotals.get(p.id) ?? 0,
    likes: likeStats.get(p.id)?.count ?? 0,
    comments: commentCounts.get(p.id) ?? 0,
  }));

  const totals = stats.reduce(
    (acc, s) => {
      acc.views += s.views;
      acc.likes += s.likes;
      acc.comments += s.comments;
      return acc;
    },
    { views: 0, likes: 0, comments: 0, followers: follows.followers },
  );

  return { onInstanceViews: viewsEnabled, totals, series, posts: stats };
}
