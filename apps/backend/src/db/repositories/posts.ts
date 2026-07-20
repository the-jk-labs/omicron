// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  and,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type NewPost, posts, postTags, remoteActors, tags, users } from "@/db/schema.ts";
import { type Cursor, DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";
import type { LanguageFilter } from "@/lib/languages.ts";

// Post DB access. Queries fetch `limit + 1` rows so the service can derive a
// next-cursor without a second round-trip.

// A post's author is either a local user or a cached remote actor; every read
// left-joins both and the serializer coalesces whichever side is present.
const localAuthorColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
};

const remoteActorColumns = {
  id: remoteActors.id,
  handle: remoteActors.handle,
  displayName: remoteActors.displayName,
  avatarUrl: remoteActors.avatarUrl,
};

// Every post column except the full-text `search_vector` — that column is large
// and only ever used inside the search query's `@@` / `ts_rank`, so timelines
// must not pull it back for every row.
const { searchVector: _searchVector, ...postColumns } = getTableColumns(posts);

function selectPosts() {
  return db
    .select({ post: postColumns, localAuthor: localAuthorColumns, remoteActor: remoteActorColumns })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .leftJoin(remoteActors, eq(posts.remoteActorId, remoteActors.id));
}

export type PostWithAuthor = Awaited<ReturnType<typeof listGlobal>>[number];

export async function create(data: NewPost) {
  const [row] = await db.insert(posts).values(data).returning();
  return row;
}

// Upserts a post fetched from a remote actor's outbox (or inbox Create),
// keyed by its ActivityPub id so re-fetching is idempotent.
export async function upsertRemotePost(data: {
  remoteActorId: string;
  apId: string;
  title: string | null;
  contentHtml: string;
  apType: string;
  language?: string | null;
  createdAt?: Date;
}) {
  const [row] = await db
    .insert(posts)
    .values({
      remoteActorId: data.remoteActorId,
      apId: data.apId,
      title: data.title,
      contentHtml: data.contentHtml,
      apType: data.apType,
      language: data.language ?? null,
      remote: true,
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    })
    .onConflictDoUpdate({
      target: posts.apId,
      set: { title: data.title, contentHtml: data.contentHtml, language: data.language ?? null },
    })
    .returning();
  return row;
}

// Accepts either a full UUID or a hex id-prefix (the short suffix used in
// canonical post URLs, e.g. `9e962281`). The prefix path matches on the text
// form of the id; 8 hex chars is 32 bits, so collisions are negligible for a
// single instance and we deterministically return the oldest match.
export function findById(id: string) {
  const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const match = isFullUuid
    ? eq(posts.id, id)
    : sql`${posts.id}::text like ${`${id.toLowerCase()}%`}`;
  return selectPosts()
    .where(match)
    .orderBy(posts.createdAt)
    .limit(1)
    .then((r: unknown[]) => (r[0] ?? null) as PostWithAuthor | null);
}

export function findByApId(apId: string) {
  return db.query.posts.findFirst({ where: eq(posts.apId, apId) });
}

export async function update(id: string, data: Partial<NewPost>) {
  const [row] = await db.update(posts).set(data).where(eq(posts.id, id)).returning();
  return row;
}

// All locally-authored posts (id + raw HTML). Used by maintenance scripts such
// as the Markdown backfill; remote posts are owned by their origin instance and
// are never rewritten here.
export function listAllLocal() {
  return db
    .select({ id: posts.id, contentHtml: posts.contentHtml })
    .from(posts)
    .where(eq(posts.remote, false));
}

// Every post (id + raw HTML), local AND remote. Used by the sanitizer backfill:
// unlike listAllLocal, cached remote bodies are included because they are the
// untrusted content that most needs re-sanitizing.
export function listAllContent() {
  return db
    .select({ id: posts.id, contentHtml: posts.contentHtml })
    .from(posts);
}

// Published, local blog posts for the XML sitemap: just what's needed to build a
// canonical permalink (author handle + title → slug) and a `<lastmod>`. Drafts
// (`status != 'published'`) and remote posts are excluded — a sitemap only lists
// this instance's own public content. Capped at the sitemap spec's 50k-URL limit.
export function listSitemapEntries() {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      authorUsername: users.username,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(
      and(
        eq(posts.remote, false),
        eq(posts.status, "published"),
        sql`${users.suspendedAt} is null`,
      ),
    )
    .orderBy(desc(posts.createdAt))
    .limit(50000);
}

export async function remove(id: string) {
  await db.delete(posts).where(eq(posts.id, id));
}

// Removes a cached remote post by its ActivityPub id. Used by the inbound
// Delete handler when a remote author deletes (tombstones) one of their posts.
export async function removeByApId(apId: string) {
  await db.delete(posts).where(eq(posts.apId, apId));
}

// Keyset condition: rows strictly "before" the cursor in (created_at, id) order.
function beforeCursor(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const ts = new Date(cursor.createdAt);
  return or(
    lt(posts.createdAt, ts),
    and(eq(posts.createdAt, ts), lt(posts.id, cursor.id)),
  );
}

// Only published posts surface in public feeds and profiles; drafts are private
// to their author (see listDraftsByAuthor).
const isPublished = eq(posts.status, "published");

// A locally-suspended author vanishes from every public listing — feeds,
// trending, search, tags and their own profile — until an admin reinstates them
// (nothing is deleted). Remote posts have no local author (`authorId is null`)
// and are unaffected. Relies on every listing left-joining `users` on authorId.
const notSuspended = sql`(${posts.authorId} is null or ${users.suspendedAt} is null)`;

// Gates posts by a *private* local author to approved followers only (plus the
// author themselves). Public authors and remote posts (authorId null) are
// unaffected. Relies on every listing left-joining `users` on authorId. Unlike
// notHidden this can't be dropped for guests — a private author's posts must
// never show to a logged-out viewer — so it always returns a condition.
function visibleToViewer(viewerId: string | null) {
  if (!viewerId) {
    return sql`(${posts.authorId} is null or ${users.isPrivate} = false)`;
  }
  return sql`(
    ${posts.authorId} is null
    or ${users.isPrivate} = false
    or ${posts.authorId} = ${viewerId}
    or exists (
      select 1 from follows f
      where f.followee_id = ${posts.authorId}
        and f.follower_id = ${viewerId}
        and f.approved = true
    )
  )`;
}

// Excludes authors the viewer has muted or blocked, and authors who have blocked
// the viewer (blocks are bidirectional locally). Returns undefined for guests —
// `and()` drops undefined operands, so feeds are unfiltered when logged out.
function notHidden(viewerId: string | null) {
  if (!viewerId) return undefined;
  const hiddenLocal = sql`(
    select target_user_id from mutes
      where user_id = ${viewerId} and target_user_id is not null
    union
    select target_user_id from blocks
      where user_id = ${viewerId} and target_user_id is not null
    union
    select user_id from blocks where target_user_id = ${viewerId}
  )`;
  const hiddenRemote = sql`(
    select target_remote_actor_id from mutes
      where user_id = ${viewerId} and target_remote_actor_id is not null
    union
    select target_remote_actor_id from blocks
      where user_id = ${viewerId} and target_remote_actor_id is not null
  )`;
  return and(
    sql`(${posts.authorId} is null or ${posts.authorId} not in ${hiddenLocal})`,
    sql`(${posts.remoteActorId} is null or ${posts.remoteActorId} not in ${hiddenRemote})`,
  );
}

// The reader's per-language feed filter. Posts with no declared language are
// "unknown" and are never filtered out (so the existing corpus and any untagged
// federated posts always remain visible); only posts whose language is known and
// matches (show) / doesn't match (hide) the reader's chosen set are affected.
// Returns undefined (no-op) when the filter is off, so `and()` drops it.
function languageFilter(filter: LanguageFilter | null | undefined) {
  if (!filter || filter.langs.length === 0) return undefined;
  return filter.mode === "hide"
    ? or(isNull(posts.language), notInArray(posts.language, filter.langs))
    : or(isNull(posts.language), inArray(posts.language, filter.langs));
}

// Global (federated) feed: blog-type content across the whole fediverse,
// local + remote. Filtered to "Article" so microblog Notes (Mastodon,
// Pixelfed, …) are excluded. Remote posts here are ones already cached on this
// instance (fetched when browsed, or delivered to our inbox) — the feed just
// reads the cache, it never crawls, so listing stays cheap.
export function listGlobal(
  viewerId: string | null,
  cursor: Cursor | null,
  limit = DEFAULT_PAGE_SIZE,
  langFilter: LanguageFilter | null = null,
) {
  return selectPosts()
    .where(
      and(
        eq(posts.apType, "Article"),
        isPublished,
        notSuspended,
        notHidden(viewerId),
        visibleToViewer(viewerId),
        languageFilter(langFilter),
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}

// Full-text search over published Article posts (local + cached remote). Matches
// against the precomputed `search_vector` (title weight A + tag-stripped body
// weight B), backed by a GIN index — an index lookup, not a per-row recompute.
// `websearch_to_tsquery` accepts plain user input (quoted phrases, `or`, `-term`)
// and never throws on stray syntax. Ranked by relevance, then recency.
export function searchPosts(viewerId: string | null, query: string, limit = DEFAULT_PAGE_SIZE) {
  const tsquery = sql`websearch_to_tsquery('english', ${query})`;
  return selectPosts()
    .where(
      and(
        eq(posts.apType, "Article"),
        isPublished,
        notSuspended,
        notHidden(viewerId),
        visibleToViewer(viewerId),
        sql`${posts.searchVector} @@ ${tsquery}`,
      ),
    )
    .orderBy(
      sql`ts_rank(${posts.searchVector}, ${tsquery}) desc`,
      desc(posts.createdAt),
      desc(posts.id),
    )
    .limit(limit);
}

// Trending: the most-engaged published Article posts from a recent window
// (local + cached remote). Score is likes + comments; correlated subqueries keep
// it a single round-trip and it degrades gracefully to recency when nothing in
// the window has engagement yet. No pagination — this is a short discovery list.
export function listTrending(viewerId: string | null, limit = 5, sinceDays = 14) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const score = sql<number>`(
    (select count(*) from likes where likes.post_id = ${posts.id})
    + (select count(*) from comments where comments.post_id = ${posts.id})
  )`;
  return selectPosts()
    .where(
      and(
        eq(posts.apType, "Article"),
        isPublished,
        notSuspended,
        notHidden(viewerId),
        visibleToViewer(viewerId),
        gt(posts.createdAt, since),
      ),
    )
    .orderBy(desc(score), desc(posts.createdAt), desc(posts.id))
    .limit(limit);
}

// Local feed: posts authored on this instance only.
export function listLocal(
  viewerId: string | null,
  cursor: Cursor | null,
  limit = DEFAULT_PAGE_SIZE,
  langFilter: LanguageFilter | null = null,
) {
  return selectPosts()
    .where(
      and(
        eq(posts.remote, false),
        isPublished,
        notSuspended,
        notHidden(viewerId),
        visibleToViewer(viewerId),
        languageFilter(langFilter),
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}

export function listByAuthor(
  authorId: string,
  viewerId: string | null,
  cursor: Cursor | null,
  limit = DEFAULT_PAGE_SIZE,
) {
  return selectPosts()
    .where(
      and(
        eq(posts.authorId, authorId),
        isPublished,
        notSuspended,
        notHidden(viewerId),
        visibleToViewer(viewerId),
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}

// An author's own drafts — never exposed publicly; the compose/Drafts UI reads
// these for the signed-in author only.
export function listDraftsByAuthor(
  authorId: string,
  cursor: Cursor | null,
  limit = DEFAULT_PAGE_SIZE,
) {
  return selectPosts()
    .where(and(eq(posts.authorId, authorId), eq(posts.status, "draft"), beforeCursor(cursor)))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}

// An author's published posts as lightweight (id, title, createdAt) rows — the
// spine of the writer dashboard, which then attaches per-post engagement and
// view stats. No pagination: an author's own catalogue, newest first.
export function publishedBriefByAuthor(authorId: string) {
  return db
    .select({ id: posts.id, title: posts.title, createdAt: posts.createdAt })
    .from(posts)
    .where(and(eq(posts.authorId, authorId), eq(posts.status, "published")))
    .orderBy(desc(posts.createdAt), desc(posts.id));
}

// All Article posts by a cached remote actor (their fetched outbox). Filtered
// to "Article" so any microblog Notes cached before this instance went
// long-form-only never surface on the actor's profile.
export function listByRemoteActor(
  remoteActorId: string,
  viewerId: string | null,
  cursor: Cursor | null,
  limit = DEFAULT_PAGE_SIZE,
) {
  return selectPosts()
    .where(
      and(
        eq(posts.remoteActorId, remoteActorId),
        eq(posts.apType, "Article"),
        notHidden(viewerId),
        visibleToViewer(viewerId),
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}

// Published Article posts carrying a given tag (by slug), local + cached remote.
// Joins through the post_tags / tags tables; otherwise mirrors listGlobal.
export function listByTag(
  slug: string,
  viewerId: string | null,
  cursor: Cursor | null,
  limit = DEFAULT_PAGE_SIZE,
) {
  return selectPosts()
    .innerJoin(postTags, eq(postTags.postId, posts.id))
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(
      and(
        eq(tags.slug, slug),
        eq(posts.apType, "Article"),
        isPublished,
        notSuspended,
        notHidden(viewerId),
        visibleToViewer(viewerId),
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}

// Personalized feed: own posts + posts by followed authors + posts carrying a
// followed tag, local and remote. Remote follows contribute the cached posts of
// the remote actors this user follows (delivered to our inbox, or crawled when
// first followed); followed tags pull in any matching published Article.
export function listFeed(userId: string, cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
  // Only *approved* follows contribute posts: a pending request to a private
  // account must not leak that account's posts into the requester's feed.
  const followedLocal = sql`(
    select followee_id from follows
    where follower_id = ${userId} and followee_id is not null and approved = true
  )`;
  const followedRemote = sql`(
    select remote_followee_id from follows
    where follower_id = ${userId} and remote_followee_id is not null and approved = true
  )`;
  const followedTagPosts = sql`(
    select pt.post_id from post_tags pt
    join tag_follows tf on tf.tag_id = pt.tag_id
    where tf.user_id = ${userId}
  )`;
  return selectPosts()
    .where(
      and(
        eq(posts.apType, "Article"),
        isPublished,
        or(
          eq(posts.authorId, userId),
          sql`${posts.authorId} in ${followedLocal}`,
          sql`${posts.remoteActorId} in ${followedRemote}`,
          sql`${posts.id} in ${followedTagPosts}`,
        ),
        notSuspended,
        notHidden(userId),
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}
