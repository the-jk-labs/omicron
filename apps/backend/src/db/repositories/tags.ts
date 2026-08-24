// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { isPublished, notSuspended, visibleToViewer } from "@/db/repositories/posts.ts";
import { posts, postTags, remoteActorTags, tagAliases, tagFollows, tags, users, userTags } from "@/db/schema.ts";

// Tag DB access. Callers pass already-normalized slugs (see lib/tags.ts); the
// stored `name` mirrors the slug so display and matching stay consistent.

export type TagSummary = { slug: string; name: string };
export type TagWithCount = TagSummary & { postCount: number };

// Resolve a slug through the alias table — if an alias exists, return the
// canonical slug, otherwise return the input unchanged.
export async function resolveAlias(slug: string): Promise<string> {
  const row = await db.query.tagAliases.findFirst({ where: eq(tagAliases.aliasSlug, slug) });
  if (!row) return slug;
  const target = await db.query.tags.findFirst({ where: eq(tags.id, row.tagId) });
  return target?.slug ?? slug;
}

async function resolveSlugs(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return slugs;
  const aliases = await db.select().from(tagAliases).where(inArray(tagAliases.aliasSlug, slugs));
  if (aliases.length === 0) return slugs;
  const map = new Map(aliases.map((a) => [a.aliasSlug, a.tagId] as const));
  const targets = await db
    .select({ id: tags.id, slug: tags.slug })
    .from(tags)
    .where(inArray(tags.id, [...map.values()]));
  const idToSlug = new Map(targets.map((t) => [t.id, t.slug] as const));
  return slugs.map((s) => {
    const tagId = map.get(s);
    return tagId ? (idToSlug.get(tagId) ?? s) : s;
  });
}

// Replaces a post's tags with the given slugs in one transaction: upsert the
// tags, drop the post's existing edges, then insert the new ones.
// Aliased slugs are resolved to their canonical target before insertion so that
// fragmented / misspelled tags (unix, sysprogramming..., perceid) collapse to
// one canonical tag.
export async function setPostTags(postId: string, slugs: string[]): Promise<void> {
  const canonical = await resolveSlugs(slugs);
  const deduped = [...new Set(canonical)];
  await db.transaction(async (tx) => {
    await tx.delete(postTags).where(eq(postTags.postId, postId));
    if (deduped.length === 0) return;
    await tx
      .insert(tags)
      .values(deduped.map((slug) => ({ slug, name: slug })))
      .onConflictDoNothing({ target: tags.slug });
    const rows = await tx.select({ id: tags.id, slug: tags.slug }).from(tags).where(inArray(tags.slug, deduped));
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

export async function findBySlug(slug: string) {
  const direct = await db.query.tags.findFirst({ where: eq(tags.slug, slug) });
  if (direct) return direct;
  const alias = await db.query.tagAliases.findFirst({ where: eq(tagAliases.aliasSlug, slug) });
  if (!alias) return null;
  return db.query.tags.findFirst({ where: eq(tags.id, alias.tagId) });
}

export function findAlias(aliasSlug: string) {
  return db.query.tagAliases.findFirst({ where: eq(tagAliases.aliasSlug, aliasSlug) });
}

export function listAliases() {
  return db
    .select({
      aliasSlug: tagAliases.aliasSlug,
      tagId: tagAliases.tagId,
      slug: tags.slug,
      name: tags.name,
    })
    .from(tagAliases)
    .innerJoin(tags, eq(tags.id, tagAliases.tagId))
    .orderBy(tagAliases.aliasSlug);
}

// Count of published Article posts carrying a tag, as the viewer may see them.
// Carries the same predicates as the listing (posts.listByTag) — a count taken
// over a wider set than the list it labels is itself a disclosure: it tells the
// reader how many posts they are not being shown.
export async function postCount(tagId: string, viewerId: string | null): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postTags)
    .innerJoin(posts, eq(posts.id, postTags.postId))
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(
      and(eq(postTags.tagId, tagId), eq(posts.apType, "Article"), isPublished, notSuspended, visibleToViewer(viewerId)),
    );
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
    .limit(limit);
}

// Autocomplete / similar-tag suggestion for the composer.
// Uses pg_trgm similarity so that typos (perceid -> perseid) and near-duplicates
// are surfaced, falling back to substring match. Ordered by similarity then
// popularity so the most useful canonical tag appears first.
export function suggest(query: string, limit: number): Promise<TagWithCount[]> {
  const term = `%${query}%`;
  return db
    .select({
      slug: tags.slug,
      name: tags.name,
      postCount: sql<number>`count(${postTags.postId})::int`,
    })
    .from(tags)
    .leftJoin(postTags, eq(postTags.tagId, tags.id))
    .where(sql`${tags.slug} % ${query} or ${tags.slug} ilike ${term}`)
    .groupBy(tags.id)
    .orderBy(desc(sql`similarity(${tags.slug}, ${query})`), desc(sql`count(${postTags.postId})`))
    .limit(limit);
}

// Create an alias slug -> target tag. The alias slug must not already be a
// real tag; the target must exist. Used by admins to map fragmented tags
// (sysprogramming, lowlevel, perceid) to a canonical one.
export async function createAlias(aliasSlug: string, targetSlug: string): Promise<void> {
  const target = await db.query.tags.findFirst({ where: eq(tags.slug, targetSlug) });
  if (!target) throw new Error(`Target tag "${targetSlug}" not found`);
  const exists = await db.query.tags.findFirst({ where: eq(tags.slug, aliasSlug) });
  if (exists) throw new Error(`Alias "${aliasSlug}" is already a real tag — merge it instead`);
  await db.insert(tagAliases).values({ aliasSlug, tagId: target.id }).onConflictDoNothing();
}

// Merge source tag into target tag: move all post/tag-follow edges, create an
// alias for the source slug, then remove the source tag row.
export async function mergeTags(fromSlug: string, toSlug: string): Promise<void> {
  if (fromSlug === toSlug) throw new Error("Source and target are the same");
  const from = await db.query.tags.findFirst({ where: eq(tags.slug, fromSlug) });
  const to = await db.query.tags.findFirst({ where: eq(tags.slug, toSlug) });
  if (!from) throw new Error(`Source tag "${fromSlug}" not found`);
  if (!to) throw new Error(`Target tag "${toSlug}" not found`);
  await db.transaction(async (tx) => {
    // Move post tags
    const fromPostTags = await tx.select({ postId: postTags.postId }).from(postTags).where(eq(postTags.tagId, from.id));
    for (const { postId } of fromPostTags) {
      await tx.insert(postTags).values({ postId, tagId: to.id }).onConflictDoNothing();
    }
    await tx.delete(postTags).where(eq(postTags.tagId, from.id));
    // Move tag follows
    const fromFollows = await tx.select().from(tagFollows).where(eq(tagFollows.tagId, from.id));
    for (const f of fromFollows) {
      await tx.insert(tagFollows).values({ userId: f.userId, tagId: to.id }).onConflictDoNothing();
    }
    await tx.delete(tagFollows).where(eq(tagFollows.tagId, from.id));
    // Move profile tags
    const fromUserTags = await tx.select().from(userTags).where(eq(userTags.tagId, from.id));
    for (const ut of fromUserTags) {
      await tx.insert(userTags).values({ userId: ut.userId, tagId: to.id }).onConflictDoNothing();
    }
    await tx.delete(userTags).where(eq(userTags.tagId, from.id));
    const fromRemoteTags = await tx.select().from(remoteActorTags).where(eq(remoteActorTags.tagId, from.id));
    for (const rt of fromRemoteTags) {
      await tx.insert(remoteActorTags).values({ remoteActorId: rt.remoteActorId, tagId: to.id }).onConflictDoNothing();
    }
    await tx.delete(remoteActorTags).where(eq(remoteActorTags.tagId, from.id));
    // Alias for future writes and tag-page redirects
    await tx.insert(tagAliases).values({ aliasSlug: fromSlug, tagId: to.id }).onConflictDoNothing();
    // Remove source tag row
    await tx.delete(tags).where(eq(tags.id, from.id));
  });
}

// Trending tags: the most-used tags across published posts, no time window
// and no quality gates — raw usage is the ranking. Visibility still applies
// (only published articles by non-suspended authors, as an anonymous reader
// sees them), so a private or suspended post never pushes a tag up a board
// that everyone sees.
export function trending(limit: number): Promise<TagWithCount[]> {
  return db
    .select({
      slug: tags.slug,
      name: tags.name,
      postCount: sql<number>`count(${postTags.postId})::int`,
    })
    .from(tags)
    .innerJoin(postTags, eq(postTags.tagId, tags.id))
    .innerJoin(posts, eq(posts.id, postTags.postId))
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(and(eq(posts.apType, "Article"), isPublished, notSuspended, visibleToViewer(null)))
    .groupBy(tags.id)
    .orderBy(desc(sql`count(${postTags.postId})`))
    .limit(limit);
}

// Tag pages for the XML sitemap: the slug, plus the newest post carrying it as
// a `<lastmod>` (a tag page changes when something is tagged, not when the tag
// row was written).
//
// Only tags on published posts, and only tags carrying more than one — a tag
// used exactly once is a page that lists a single link, adding nothing an
// engine cannot get from the post itself, and a sitemap full of those is how
// thin pages accumulate. The threshold is a judgement, not a standard; two is
// the smallest number at which the page is genuinely an index of something.
export function listSitemapTags(): Promise<{ slug: string; lastPostAt: Date }[]> {
  return (
    db
      .select({
        slug: tags.slug,
        lastPostAt: sql<Date>`max(${posts.createdAt})`,
      })
      .from(tags)
      .innerJoin(postTags, eq(postTags.tagId, tags.id))
      .innerJoin(posts, eq(posts.id, postTags.postId))
      .leftJoin(users, eq(posts.authorId, users.id))
      // A crawler is anonymous, so the ">1 post" threshold below has to be
      // counted over posts a crawler can actually reach — otherwise a tag whose
      // only visible post is one becomes exactly the thin page the threshold
      // exists to keep out of the sitemap.
      .where(and(eq(posts.remote, false), isPublished, notSuspended, visibleToViewer(null)))
      .groupBy(tags.id)
      .having(sql`count(${postTags.postId}) > 1`)
      .limit(10000)
  );
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

// ── profile tags (local users + cached remote actors) ─────────────────────

// Replaces a local user's profile tags with the given slugs, in one transaction
// (mirrors setPostTags).
export async function setUserTags(userId: string, slugs: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userTags).where(eq(userTags.userId, userId));
    if (slugs.length === 0) return;
    await tx
      .insert(tags)
      .values(slugs.map((slug) => ({ slug, name: slug })))
      .onConflictDoNothing({ target: tags.slug });
    const rows = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.slug, slugs));
    await tx
      .insert(userTags)
      .values(rows.map((r: { id: string }) => ({ userId, tagId: r.id })))
      .onConflictDoNothing();
  });
}

export async function tagsForUser(userId: string): Promise<TagSummary[]> {
  return await db
    .select({ slug: tags.slug, name: tags.name })
    .from(userTags)
    .innerJoin(tags, eq(tags.id, userTags.tagId))
    .where(eq(userTags.userId, userId))
    .orderBy(userTags.createdAt);
}

// Replaces a cached remote actor's profile tags with the given slugs.
export async function setRemoteActorTags(remoteActorId: string, slugs: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(remoteActorTags).where(eq(remoteActorTags.remoteActorId, remoteActorId));
    if (slugs.length === 0) return;
    await tx
      .insert(tags)
      .values(slugs.map((slug) => ({ slug, name: slug })))
      .onConflictDoNothing({ target: tags.slug });
    const rows = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.slug, slugs));
    await tx
      .insert(remoteActorTags)
      .values(rows.map((r: { id: string }) => ({ remoteActorId, tagId: r.id })))
      .onConflictDoNothing();
  });
}

export async function tagsForRemoteActor(remoteActorId: string): Promise<TagSummary[]> {
  return await db
    .select({ slug: tags.slug, name: tags.name })
    .from(remoteActorTags)
    .innerJoin(tags, eq(tags.id, remoteActorTags.tagId))
    .where(eq(remoteActorTags.remoteActorId, remoteActorId))
    .orderBy(remoteActorTags.createdAt);
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
    .orderBy(desc(tagFollows.createdAt));
}
