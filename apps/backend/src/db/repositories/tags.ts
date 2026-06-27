// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { postTags, posts, tagFollows, tags } from "@/db/schema.ts";

// Tag DB access. Callers pass already-normalized slugs (see lib/tags.ts); the
// stored `name` mirrors the slug so display and matching stay consistent.

export type TagSummary = { slug: string; name: string };
export type TagWithCount = TagSummary & { postCount: number };

// Replaces a post's tags with the given slugs in one transaction: upsert the
// tags, drop the post's existing edges, then insert the new ones.
export async function setPostTags(postId: string, slugs: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(postTags).where(eq(postTags.postId, postId));
    if (slugs.length === 0) return;
    await tx
      .insert(tags)
      .values(slugs.map((slug) => ({ slug, name: slug })))
      .onConflictDoNothing({ target: tags.slug });
    const rows = await tx.select({ id: tags.id, slug: tags.slug }).from(tags).where(
      inArray(tags.slug, slugs),
    );
    await tx
      .insert(postTags)
      .values(rows.map((r: { id: string }) => ({ postId, tagId: r.id })))
      .onConflictDoNothing();
  });
}

// Tags for many posts in one query, grouped by post id (preserves alpha order).
export async function tagsForPosts(postIds: string[]): Promise<Map<string, TagSummary[]>> {
  const map = new Map<string, TagSummary[]>();
  if (postIds.length === 0) return map;
  const rows = await db
    .select({ postId: postTags.postId, slug: tags.slug, name: tags.name })
    .from(postTags)
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(inArray(postTags.postId, postIds))
    .orderBy(tags.slug);
  for (const r of rows as { postId: string; slug: string; name: string }[]) {
    const list = map.get(r.postId) ?? [];
    list.push({ slug: r.slug, name: r.name });
    map.set(r.postId, list);
  }
  return map;
}

export async function tagsForPost(postId: string): Promise<TagSummary[]> {
  return (await tagsForPosts([postId])).get(postId) ?? [];
}

export function findBySlug(slug: string) {
  return db.query.tags.findFirst({ where: eq(tags.slug, slug) });
}

// Count of published Article posts carrying a tag.
export async function postCount(tagId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postTags)
    .innerJoin(posts, eq(posts.id, postTags.postId))
    .where(and(eq(postTags.tagId, tagId), eq(posts.status, "published"), eq(posts.apType, "Article")));
  return row?.count ?? 0;
}

export async function followerCount(tagId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tagFollows)
    .where(eq(tagFollows.tagId, tagId));
  return row?.count ?? 0;
}

// Tag search: prefix/substring match on the slug (trigram-indexed), ordered by
// how many posts carry the tag so the most-used surface first.
export function search(query: string, limit: number): Promise<TagWithCount[]> {
  const term = `%${query}%`;
  return db
    .select({
      slug: tags.slug,
      name: tags.name,
      postCount: sql<number>`count(${postTags.postId})::int`,
    })
    .from(tags)
    .leftJoin(postTags, eq(postTags.tagId, tags.id))
    .where(sql`${tags.slug} ilike ${term}`)
    .groupBy(tags.id)
    .orderBy(desc(sql`count(${postTags.postId})`))
    .limit(limit) as Promise<TagWithCount[]>;
}

// Trending tags: most-used across posts published in the recent window.
export function trending(limit: number, sinceDays = 14): Promise<TagWithCount[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  return db
    .select({
      slug: tags.slug,
      name: tags.name,
      postCount: sql<number>`count(${postTags.postId})::int`,
    })
    .from(tags)
    .innerJoin(postTags, eq(postTags.tagId, tags.id))
    .innerJoin(posts, eq(posts.id, postTags.postId))
    .where(and(eq(posts.status, "published"), eq(posts.apType, "Article"), gt(posts.createdAt, since)))
    .groupBy(tags.id)
    .orderBy(desc(sql`count(${postTags.postId})`))
    .limit(limit) as Promise<TagWithCount[]>;
}

// ── tag follows ──────────────────────────────────────────────────────────

export async function follow(userId: string, tagId: string): Promise<void> {
  await db.insert(tagFollows).values({ userId, tagId }).onConflictDoNothing();
}

export async function unfollow(userId: string, tagId: string): Promise<void> {
  await db.delete(tagFollows).where(and(eq(tagFollows.userId, userId), eq(tagFollows.tagId, tagId)));
}

export async function isFollowing(userId: string, tagId: string): Promise<boolean> {
  const row = await db.query.tagFollows.findFirst({
    where: and(eq(tagFollows.userId, userId), eq(tagFollows.tagId, tagId)),
  });
  return !!row;
}

// Tags a user follows, with each tag's post count, newest follow first.
export function listFollowedByUser(userId: string): Promise<TagWithCount[]> {
  return db
    .select({
      slug: tags.slug,
      name: tags.name,
      postCount: sql<number>`count(${postTags.postId})::int`,
    })
    .from(tagFollows)
    .innerJoin(tags, eq(tags.id, tagFollows.tagId))
    .leftJoin(postTags, eq(postTags.tagId, tags.id))
    .where(eq(tagFollows.userId, userId))
    .groupBy(tags.id, tagFollows.createdAt)
    .orderBy(desc(tagFollows.createdAt)) as Promise<TagWithCount[]>;
}
