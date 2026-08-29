// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";
import { db } from "@/db/client.ts";
import { type NewPost, posts, postSlugHistory, postTags, remoteActors, tags, users } from "@/db/schema.ts";
import type { LanguageFilter } from "@/lib/languages.ts";
import { type Cursor, DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";

// Post DB access. Queries fetch `limit + 1` rows so the service can derive a
// next-cursor without a second round-trip.

// A post's author is either a local user or a cached remote actor; every read
// left-joins both and the serializer coalesces whichever side is present.
export const localAuthorColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
};

export const remoteActorColumns = {
  id: remoteActors.id,
  handle: remoteActors.handle,
  displayName: remoteActors.displayName,
  avatarUrl: remoteActors.avatarUrl,
};

// Every post column except the full-text `search_vector` — that column is large
// and only ever used inside the search query's `@@` / `ts_rank`, so timelines
// must not pull it back for every row.
const { searchVector: _searchVector, ...postColumns } = getTableColumns(posts);
export { postColumns };

export function selectPosts() {
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
  const match = isFullUuid ? eq(posts.id, id) : sql`${posts.id}::text like ${`${id.toLowerCase()}%`}`;
  return selectPosts()
    .where(match)
    .orderBy(posts.createdAt)
    .limit(1)
    .then((r: unknown[]) => (r[0] ?? null) as PostWithAuthor | null);
}

// One author's post by its live slug — the lookup behind every canonical
// `/@author/<slug>` read, served by `posts_author_slug_idx`. Local posts only:
// `slug` is null on everything remote.
export function findByAuthorSlug(username: string, slug: string) {
  return selectPosts()
    .where(and(eq(users.username, username), eq(posts.slug, slug)))
    .limit(1)
    .then((r: unknown[]) => (r[0] ?? null) as PostWithAuthor | null);
}

// The post a retired slug used to address, so a link shared before a retitle
// still resolves (the caller redirects it to the current URL).
export function findIdByHistorySlug(username: string, slug: string) {
  return db
    .select({ postId: postSlugHistory.postId })
    .from(postSlugHistory)
    .innerJoin(users, eq(postSlugHistory.authorId, users.id))
    .where(and(eq(users.username, username), eq(postSlugHistory.slug, slug)))
    .limit(1)
    .then((r) => r[0]?.postId ?? null);
}

// Every slug this author has that is `base` or `base-<n>`, live or retired —
// what slug allocation picks the first free suffix from (services/postSlugs.ts).
// A post's own slugs are excluded so re-saving a post can keep the slug it
// already holds instead of stepping to `-2`.
export async function slugsLike(authorId: string, base: string, excludePostId?: string) {
  const pattern = `${base}-%`;
  const live = db
    .select({ slug: sql<string>`${posts.slug}`.as("slug") })
    .from(posts)
    .where(
      and(
        eq(posts.authorId, authorId),
        or(eq(posts.slug, base), sql`${posts.slug} like ${pattern}`),
        excludePostId ? sql`${posts.id} <> ${excludePostId}` : undefined,
      ),
    );
  const retired = db
    .select({ slug: sql<string>`${postSlugHistory.slug}`.as("slug") })
    .from(postSlugHistory)
    .where(
      and(
        eq(postSlugHistory.authorId, authorId),
        or(eq(postSlugHistory.slug, base), sql`${postSlugHistory.slug} like ${pattern}`),
        excludePostId ? sql`${postSlugHistory.postId} <> ${excludePostId}` : undefined,
      ),
    );
  const rows = await union(live, retired);
  return new Set(rows.map((r) => r.slug));
}

// Moves a post onto `slug`, as one transaction so a reader can never find the
// post at neither address: the slug it is leaving is filed in the history table
// (which is what keeps already-shared links alive) and any history row that
// held the incoming slug for this same post is dropped — a post retitled back
// to an earlier name reclaims its old URL rather than colliding with itself.
export async function setSlug(postId: string, authorId: string, slug: string) {
  await db.transaction(async (tx) => {
    const [current] = await tx.select({ slug: posts.slug }).from(posts).where(eq(posts.id, postId));
    if (current?.slug === slug) return;
    await tx.delete(postSlugHistory).where(and(eq(postSlugHistory.authorId, authorId), eq(postSlugHistory.slug, slug)));
    await tx.update(posts).set({ slug }).where(eq(posts.id, postId));
    if (current?.slug) {
      await tx.insert(postSlugHistory).values({ postId, authorId, slug: current.slug }).onConflictDoNothing();
    }
  });
}

// Local, titled posts still without a slug, oldest first — what the boot
// backfill works through (services/postSlugs.ts). Oldest first so that when two
// posts share a title the one published first takes the bare slug, which is the
// order a reader would expect and is stable across re-runs.
export function listWithoutSlug(limit: number) {
  return db
    .select({ id: posts.id, authorId: posts.authorId, title: posts.title })
    .from(posts)
    .where(
      and(
        eq(posts.remote, false),
        isNull(posts.slug),
        sql`${posts.authorId} is not null`,
        sql`${posts.title} is not null`,
      ),
    )
    .orderBy(posts.createdAt, posts.id)
    .limit(limit);
}

export function findByApId(apId: string) {
  return db.query.posts.findFirst({ where: eq(posts.apId, apId) });
}

// Looks up one author's machine-ingested post by the external system's stable
// key (see services/webhooks.ts). Scoped to the author because the key is only
// unique within an account — two writers may both ingest a "hello-world" slug.
// Only ever matches locally-authored ingested rows: `external_id` is null
// everywhere else.
export function findByExternalId(authorId: string, externalId: string) {
  return db.query.posts.findFirst({
    where: and(eq(posts.authorId, authorId), eq(posts.externalId, externalId)),
  });
}

// Writes a machine-ingested post, keyed by (author, external key). An upsert
// rather than an insert-or-update pair because webhook delivery is
// at-least-once: two concurrent re-deliveries of the same document would
// otherwise both miss the lookup and race into a unique violation. `authorId`
// and `externalId` identify the row and are left alone on conflict; everything
// else the caller passes is refreshed.
export async function upsertByExternalId(data: NewPost & { externalId: string; authorId: string }) {
  const { externalId: _externalId, authorId: _authorId, ...mutable } = data;
  const [row] = await db
    .insert(posts)
    .values(data)
    .onConflictDoUpdate({ target: [posts.authorId, posts.externalId], set: mutable })
    .returning();
  return row;
}

// Every content write stamps `updated_at` here rather than at each call site,
// so a new caller cannot forget and silently leave the sitemap advertising a
// stale `<lastmod>`. All three callers (editor, webhook ingest, federated
// Update) change the post's own content, which is exactly what the column
// means — engagement never routes through here.
export async function update(id: string, data: Partial<NewPost>) {
  const [row] = await db
    .update(posts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(posts.id, id))
    .returning();
  return row;
}

// Bump `updated_at` without changing a column. Needed because replacing a
// post's tags touches only the join table, so an edit that changes nothing but
// the tags never reaches `update()` above — and its subject really did change.
export async function touch(id: string) {
  await db.update(posts).set({ updatedAt: new Date() }).where(eq(posts.id, id));
}

// All locally-authored posts (id + raw HTML). Used by maintenance scripts such
// as the Markdown backfill; remote posts are owned by their origin instance and
// are never rewritten here.
export function listAllLocal() {
  return db.select({ id: posts.id, contentHtml: posts.contentHtml }).from(posts).where(eq(posts.remote, false));
}

// Every post (id + raw HTML), local AND remote. Used by the sanitizer backfill:
// unlike listAllLocal, cached remote bodies are included because they are the
// untrusted content that most needs re-sanitizing.
export function listAllContent() {
  return db.select({ id: posts.id, contentHtml: posts.contentHtml }).from(posts);
}

// Published, local blog posts for the XML sitemap: just what's needed to build a
// canonical permalink (author handle + title → slug) and a `<lastmod>`. Drafts
// (`status != 'published'`) and remote posts are excluded — a sitemap only lists
// this instance's own public content. Capped at the sitemap spec's 50k-URL limit.
//
// `updatedAt`, not `createdAt`, is the lastmod: an edited post has to look
// changed or an engine keeps serving the copy it already has.
// The sitemap spec caps one file at 50,000 URLs, so the app splits posts across
// numbered files and this serves one of them. Ordered by created_at DESC and
// then id, because an unstable order would shuffle posts between files on every
// fetch and each file would look wholly rewritten to a crawler.
export const SITEMAP_PAGE_SIZE = 40000;

// Private accounts are excluded for the same reason listSitemapProfiles
// excludes them: their posts are visible only to approved followers, so a
// crawler that follows the URL gets nothing — and the entry itself would
// publish the post's existence, author and slug to anyone who fetches
// /sitemap.xml.
const publishedLocally = () =>
  and(
    eq(posts.remote, false),
    eq(posts.status, "published"),
    sql`${users.suspendedAt} is null`,
    eq(users.isPrivate, false),
  );

export function listSitemapEntries(page = 1) {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      authorUsername: users.username,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(publishedLocally())
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(SITEMAP_PAGE_SIZE)
    .offset((Math.max(1, page) - 1) * SITEMAP_PAGE_SIZE);
}

// Posts related to `postId`, most-related first.
//
// A post page used to be a dead end: nothing linked onward from an article
// except its author's profile. That costs three separate things — a crawler
// reaches fewer pages, ranking weight collects on individual articles instead
// of circulating, and a reader who finishes a piece has nowhere to go but away.
//
// Relatedness is the number of tags in common, then recency. That is a crude
// measure and deliberately so: it uses the index that already exists, it is
// explainable to the author who chose those tags, and it degrades to "recent
// posts by anyone" rather than to nothing when a post shares no tags — an empty
// section would leave the dead end exactly as it was.
export function listRelated(postId: string, limit = 3) {
  const shared = db
    .select({
      id: posts.id,
      overlap: sql<number>`count(*)::int`.as("overlap"),
    })
    .from(postTags)
    .innerJoin(posts, eq(posts.id, postTags.postId))
    .where(
      and(
        // The tags of the post being read.
        inArray(postTags.tagId, db.select({ id: postTags.tagId }).from(postTags).where(eq(postTags.postId, postId))),
        sql`${posts.id} <> ${postId}`,
        eq(posts.status, "published"),
        // Local posts only. A federated copy is served here as `noindex` (it
        // reproduces an article published elsewhere), so linking to one adds
        // nothing to crawl depth and sends a reader to a page we have asked
        // search engines to ignore. The rail exists to lead further into this
        // instance's own archive.
        eq(posts.remote, false),
      ),
    )
    .groupBy(posts.id)
    .as("shared");

  return (
    selectPosts()
      .innerJoin(shared, eq(shared.id, posts.id))
      // A private author's posts are visible only to approved followers; a
      // suggestion rail has no viewer context to check that against, so they are
      // left out entirely rather than teased and then 404'd.
      .where(and(sql`${users.isPrivate} = false`, sql`${users.suspendedAt} is null`))
      .orderBy(desc(shared.overlap), desc(posts.createdAt))
      .limit(limit)
  );
}

// Fallback for a post whose tags nobody else uses (or which has none): the
// newest published posts, minus the one being read. Keeps the section from
// disappearing exactly on the posts that most need a way onward.
export function listRecentExcluding(postId: string, limit = 4) {
  return selectPosts()
    .where(
      and(
        sql`${posts.id} <> ${postId}`,
        eq(posts.status, "published"),
        eq(posts.remote, false),
        sql`${users.isPrivate} = false`,
        sql`${users.suspendedAt} is null`,
      ),
    )
    .orderBy(desc(posts.createdAt))
    .limit(limit);
}

// Everything this instance has itself published, for NodeInfo's usage figures.
//
// Deliberately wider than `publishedLocally()` above, which is the *sitemap's*
// question ("what should a crawler index?") and so drops private authors. This
// one asks what the node holds, and a private author's article is as much this
// node's output as anyone's — only the count leaves, never a title or a body.
// Drafts and scheduled posts are not published and never counted; a suspended
// author's work is withdrawn, so it is not counted either.
export async function countLocalPublished(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(and(eq(posts.remote, false), isPublished, isNull(users.suspendedAt)));
  return row?.n ?? 0;
}

export async function countSitemapEntries(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(publishedLocally());
  return row?.n ?? 0;
}

// Local authors with at least one published post, for the sitemap. A profile is
// a real page — bio, links, the author's archive — and was reachable only by a
// crawler following a byline. `lastmod` is their newest post, since that is what
// actually changes the page.
//
// Excluded: suspended accounts, private accounts (their posts are only visible
// to approved followers, so the page is empty to a crawler), and anyone with
// nothing published, whose profile would be a thin page.
export function listSitemapProfiles() {
  return db
    .select({
      username: users.username,
      lastPostAt: sql<Date>`max(${posts.createdAt})`.as("last_post_at"),
    })
    .from(users)
    .innerJoin(posts, and(eq(posts.authorId, users.id), eq(posts.status, "published"), eq(posts.remote, false)))
    .where(and(sql`${users.suspendedAt} is null`, eq(users.isPrivate, false)))
    .groupBy(users.username)
    .limit(10000);
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
  return or(lt(posts.createdAt, ts), and(eq(posts.createdAt, ts), lt(posts.id, cursor.id)));
}

// Only published posts surface in public feeds and profiles; drafts are private
// to their author (see listDraftsByAuthor).
export const isPublished = eq(posts.status, "published");

// A locally-suspended author vanishes from every public listing — feeds,
// trending, search, tags and their own profile — until an admin reinstates them
// (nothing is deleted). Remote posts have no local author (`authorId is null`)
// and are unaffected. Relies on every listing left-joining `users` on authorId.
export const notSuspended = sql`(${posts.authorId} is null or ${users.suspendedAt} is null)`;

// Gates posts by a *private* local author to approved followers only (plus the
// author themselves). Public authors and remote posts (authorId null) are
// unaffected. Relies on every listing left-joining `users` on authorId. Unlike
// notHidden this can't be dropped for guests — a private author's posts must
// never show to a logged-out viewer — so it always returns a condition.
export function visibleToViewer(viewerId: string | null) {
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
export function notHidden(viewerId: string | null) {
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
// Optional `tag` (normalized slug) and `author` (substring on handle/name) narrow
// the result set without changing the ranking — the filters cover "find this topic
// via tag" and "find this author's writing".
export function searchPosts(
  viewerId: string | null,
  query: string,
  limit = DEFAULT_PAGE_SIZE,
  opts?: { tag?: string; author?: string },
) {
  const tsquery = sql`websearch_to_tsquery('english', ${query})`;
  const filters = [
    eq(posts.apType, "Article"),
    isPublished,
    notSuspended,
    notHidden(viewerId),
    visibleToViewer(viewerId),
    sql`${posts.searchVector} @@ ${tsquery}`,
  ];
  if (opts?.tag) {
    // Exact slug match via an exists subquery — keeps the main select's joins
    // untouched and uses the `tags_slug_idx` + `post_tags_tag_idx` indexes.
    filters.push(
      sql`exists (select 1 from post_tags pt join tags t on t.id = pt.tag_id where pt.post_id = ${posts.id} and t.slug = ${opts.tag})`,
    );
  }
  if (opts?.author) {
    const term = `%${opts.author.replace(/[%_\\]/g, "\\$&")}%`;
    // Matches either a local author's handle/display name or a cached remote
    // actor's handle/display name — both are left-joined in selectPosts().
    filters.push(
      or(
        ilike(users.username, term),
        ilike(users.displayName, term),
        ilike(remoteActors.handle, term),
        ilike(remoteActors.displayName, term),
      ),
    );
  }
  return selectPosts()
    .where(and(...filters))
    .orderBy(sql`ts_rank(${posts.searchVector}, ${tsquery}) desc`, desc(posts.createdAt), desc(posts.id))
    .limit(limit);
}

// Trending: the most-engaged published Article posts from the last 30 days.
// A post older than that never appears, no matter how many likes it once had.
// Score is intentionally documented here so the ranking is not a black box:
//
//   weighted = likes*1 + comments*2   (comments signal deeper engagement, so
//                                     they outweigh a tap; both counted without
//                                     the author's own actions — see below)
//   ageHours = extract(epoch from now() - createdAt)/3600
//   score    = weighted / power(ageHours + 2, 1.5)
//
// The denominator is the Hacker-News-style gravity: a fresh post with a few
// interactions outranks a week-old one with many, without ever letting a
// brand-new empty post beat a recent engaged one. When weighted is 0 the score
// is 0 and the tie-break is simply recency (createdAt desc), so the list still
// degrades gracefully when nothing in the window has engagement.
//
// Bot/self-vote protection: likes/comments where the actor is the post's own
// author are excluded from the counts (self-like / self-reply would otherwise
// let an author push their own post). Remote posts have no local authorId and
// are counted as-is. No pagination — this is a short discovery list.
export function listTrending(viewerId: string | null, limit = 5, sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const score = sql<number>`(
    (
      (select count(*) from likes
        where likes.post_id = ${posts.id}
          and (${posts.authorId} is null or likes.user_id != ${posts.authorId}))
      * 1
      + (select count(*) from comments
        where comments.post_id = ${posts.id}
          and (${posts.authorId} is null or comments.author_id != ${posts.authorId}))
      * 2
    ) / power(extract(epoch from (now() - ${posts.createdAt})) / 3600 + 2, 1.5)
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
export function listDraftsByAuthor(authorId: string, cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
  return selectPosts()
    .where(and(eq(posts.authorId, authorId), eq(posts.status, "draft"), beforeCursor(cursor)))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}

// Keyset pagination forward through an *ascending* (publish_at, id) ordering.
// The `Cursor` tuple is an opaque (timestamp, id) pair — here its timestamp
// half carries `publish_at` rather than `created_at`, which is why this cannot
// reuse `beforeCursor`.
function afterDueCursor(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const ts = new Date(cursor.createdAt);
  return or(gt(posts.publishAt, ts), and(eq(posts.publishAt, ts), gt(posts.id, cursor.id)));
}

// An author's own scheduled posts, soonest first — the opposite order to
// drafts, because what the author is reading here is a running order, not an
// edit history. Private to them, exactly like a draft. Served by
// `posts_author_due_idx`.
export function listScheduledByAuthor(authorId: string, cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
  return selectPosts()
    .where(and(eq(posts.authorId, authorId), eq(posts.status, "scheduled"), afterDueCursor(cursor)))
    .orderBy(posts.publishAt, posts.id)
    .limit(limit + 1);
}

// An author's own published posts, newest first — the Published tab of the
// management page. Unlike `publishedBriefByAuthor` (which the dashboard uses
// for its stats spine) these are full rows, because the tab shows the same
// card as the other two.
export function listPublishedByAuthor(authorId: string, cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
  return selectPosts()
    .where(and(eq(posts.authorId, authorId), eq(posts.status, "published"), beforeCursor(cursor)))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}

// How many posts the author holds in each state, for the management page's tab
// badges. One grouped scan rather than three counts.
export async function countsByAuthor(authorId: string) {
  const rows = await db
    .select({ status: posts.status, n: count() })
    .from(posts)
    .where(and(eq(posts.authorId, authorId), eq(posts.remote, false)))
    .groupBy(posts.status);
  const totals = { draft: 0, scheduled: 0, published: 0 };
  for (const row of rows) totals[row.status] = row.n;
  return totals;
}

/**
 * Claim every post that has come due and publish it, returning the ones this
 * call actually took. The scheduling sweeper's only query.
 *
 * The claim has to be atomic against other backend processes: two of them
 * sweeping the same row would each enqueue a `federate_post`, and remote
 * instances would receive the article twice. `for update skip locked` inside
 * the subquery is what prevents that — a row being claimed elsewhere is
 * skipped rather than waited on, so each post is returned to exactly one
 * process and the work spreads across nodes instead of serialising behind a
 * lock. The `status = 'scheduled'` predicate then makes it idempotent even if a
 * process dies between the update committing and its side effects running: the
 * row is published, so no later tick can claim it again.
 *
 * `created_at` is stamped to now rather than left at the draft's creation date,
 * so the post lands at the top of the timeline instead of wherever it was
 * written — see `firstPublicationFields` in services/posts.ts, which applies
 * the same rule to the manual publish button.
 */
export function claimDue(limit = 50, now = new Date()) {
  const due = db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), lte(posts.publishAt, now)))
    .orderBy(posts.publishAt)
    .limit(limit)
    .for("update", { skipLocked: true });

  return db
    .update(posts)
    .set({ status: "published", publishAt: null, createdAt: now, updatedAt: now })
    .where(inArray(posts.id, due))
    .returning({ id: posts.id, authorId: posts.authorId });
}

// An author's published posts as lightweight (id, title, slug, createdAt) rows —
// the spine of the writer dashboard, which then attaches per-post engagement and
// view stats. The slug is included so the dashboard can link each post straight
// to its canonical /@author/<slug> URL instead of round-tripping through the
// legacy id permalink. No pagination: an author's own catalogue, newest first.
export function publishedBriefByAuthor(authorId: string) {
  return db
    .select({ id: posts.id, title: posts.title, slug: posts.slug, createdAt: posts.createdAt })
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
export function listByTag(slug: string, viewerId: string | null, cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
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
  //
  // The follow branches below are self-gating that way, but the followed-tag
  // branch is not — it matches on a tag anyone can apply, so without
  // `visibleToViewer` a private author's post reaches every reader who follows
  // one of its tags.
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
        visibleToViewer(userId),
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}
