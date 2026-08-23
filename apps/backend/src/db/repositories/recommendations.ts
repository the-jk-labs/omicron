// SPDX-License-Identifier: AGPL-3.0-or-later
import { aliasedTable, and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import {
  isPublished,
  localAuthorColumns,
  notHidden,
  notSuspended,
  postColumns,
  remoteActorColumns,
  visibleToViewer,
} from "@/db/repositories/posts.ts";
import { posts, recommendations, remoteActors, users } from "@/db/schema.ts";
import { type Cursor, DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";

// Recommend-edge DB access ("repost", federates as ActivityPub Announce). One
// row per (post, recommender); the recommender is either a local user or a
// cached remote actor, mirroring the local-or-remote shape `follows` and
// `notifications` already use. Recommending is idempotent via the two partial
// unique indexes on the table.

export async function add(postId: string, userId: string) {
  await db.insert(recommendations).values({ postId, userId }).onConflictDoNothing();
}

export async function addRemote(postId: string, remoteActorId: string) {
  await db.insert(recommendations).values({ postId, remoteActorId }).onConflictDoNothing();
}

export async function remove(postId: string, userId: string) {
  await db.delete(recommendations).where(and(eq(recommendations.postId, postId), eq(recommendations.userId, userId)));
}

export async function removeRemote(postId: string, remoteActorId: string) {
  await db
    .delete(recommendations)
    .where(and(eq(recommendations.postId, postId), eq(recommendations.remoteActorId, remoteActorId)));
}

export type RecommendStats = { count: number; recommended: boolean };

// Recommend count + whether `viewerId` recommended it, for many posts in one
// query — mirrors likesRepo.statsFor.
export async function statsFor(postIds: string[], viewerId: string | null): Promise<Map<string, RecommendStats>> {
  const map = new Map<string, RecommendStats>();
  if (postIds.length === 0) return map;

  const rows = await db
    .select({
      postId: recommendations.postId,
      count: sql<number>`count(*)::int`,
      recommended: viewerId ? sql<boolean>`bool_or(${recommendations.userId} = ${viewerId})` : sql<boolean>`false`,
    })
    .from(recommendations)
    .where(inArray(recommendations.postId, postIds))
    .groupBy(recommendations.postId);

  for (const r of rows as { postId: string; count: number; recommended: boolean }[]) {
    map.set(r.postId, { count: r.count, recommended: r.recommended });
  }
  return map;
}

// Keyset condition over the *recommendation's* own clock — distinct from
// posts.ts's beforeCursor, which cursors on the post's publish time.
function beforeCursor(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const ts = new Date(cursor.createdAt);
  return or(
    lt(recommendations.createdAt, ts),
    and(eq(recommendations.createdAt, ts), lt(recommendations.id, cursor.id)),
  );
}

function selectRecommended() {
  return db
    .select({
      post: postColumns,
      localAuthor: localAuthorColumns,
      remoteActor: remoteActorColumns,
      // The recommendation edge's own id — the cursor tiebreak `beforeCursor`
      // above filters on, distinct from the post's id.
      recommendationId: recommendations.id,
      recommendedAt: recommendations.createdAt,
    })
    .from(recommendations)
    .innerJoin(posts, eq(posts.id, recommendations.postId))
    .leftJoin(users, eq(posts.authorId, users.id))
    .leftJoin(remoteActors, eq(posts.remoteActorId, remoteActors.id));
}

export type RecommendedPostRow = Awaited<ReturnType<typeof listByUser>>[number];

// Posts a local user has recommended, newest-recommended first — the profile's
// "Recommendations" tab. Same visibility rules as any other public post
// listing (published, not suspended, not blocked/muted, private-author gated).
export function listByUser(userId: string, viewerId: string | null, cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
  return selectRecommended()
    .where(
      and(
        eq(recommendations.userId, userId),
        isPublished,
        notSuspended,
        notHidden(viewerId),
        visibleToViewer(viewerId),
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(recommendations.createdAt), desc(recommendations.id))
    .limit(limit + 1);
}

// Posts a cached remote actor has recommended — the remote-profile analogue of
// listByUser. Filtered to "Article" like listByRemoteActor, so a boosted
// microblog Note (cached before this instance went long-form-only) never
// surfaces here either.
export function listByRemoteActor(
  remoteActorId: string,
  viewerId: string | null,
  cursor: Cursor | null,
  limit = DEFAULT_PAGE_SIZE,
) {
  return selectRecommended()
    .where(
      and(
        eq(recommendations.remoteActorId, remoteActorId),
        eq(posts.apType, "Article"),
        notHidden(viewerId),
        visibleToViewer(viewerId),
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(recommendations.createdAt), desc(recommendations.id))
    .limit(limit + 1);
}

const recommenderUser = aliasedTable(users, "feed_recommender_user");
const recommenderActor = aliasedTable(remoteActors, "feed_recommender_actor");

export type FeedRecommendationRow = Awaited<ReturnType<typeof listFeedFor>>[number];

// Posts recommended by `userId`'s followed local/remote authors — the
// recommendation half of the "For you" feed's merged stream (see
// services/feed.ts). Ordered on the recommendation's own clock, not the post's
// publish time, so a boost of an old post surfaces when it was boosted, the
// way a repost does on any federated timeline.
export function listFeedFor(userId: string, cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
  const followedLocal = sql`(
    select followee_id from follows
    where follower_id = ${userId} and followee_id is not null and approved = true
  )`;
  const followedRemote = sql`(
    select remote_followee_id from follows
    where follower_id = ${userId} and remote_followee_id is not null and approved = true
  )`;
  return db
    .select({
      post: postColumns,
      localAuthor: localAuthorColumns,
      remoteActor: remoteActorColumns,
      recommenderId: sql<string>`coalesce(${recommenderUser.id}, ${recommenderActor.id})`,
      recommenderUsername: sql<string>`coalesce(${recommenderUser.username}, ${recommenderActor.handle})`,
      recommenderDisplayName: sql<string>`coalesce(${recommenderUser.displayName}, ${recommenderActor.displayName})`,
      recommenderAvatarUrl: sql<string | null>`coalesce(${recommenderUser.avatarUrl}, ${recommenderActor.avatarUrl})`,
      recommenderRemote: sql<boolean>`(${recommendations.remoteActorId} is not null)`,
      recommendationId: recommendations.id,
      recommendedAt: recommendations.createdAt,
    })
    .from(recommendations)
    .innerJoin(posts, eq(posts.id, recommendations.postId))
    .leftJoin(users, eq(posts.authorId, users.id))
    .leftJoin(remoteActors, eq(posts.remoteActorId, remoteActors.id))
    .leftJoin(recommenderUser, eq(recommendations.userId, recommenderUser.id))
    .leftJoin(recommenderActor, eq(recommendations.remoteActorId, recommenderActor.id))
    .where(
      and(
        eq(posts.apType, "Article"),
        isPublished,
        or(
          sql`${recommendations.userId} in ${followedLocal}`,
          sql`${recommendations.remoteActorId} in ${followedRemote}`,
        ),
        notSuspended,
        notHidden(userId),
        // Gates on the *post's* author, not the recommender. The `or` above
        // only establishes that the viewer follows whoever boosted it — a
        // followed account can recommend a private author's post, and without
        // this that post's body would be served to a non-follower.
        visibleToViewer(userId),
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(recommendations.createdAt), desc(recommendations.id))
    .limit(limit + 1);
}
