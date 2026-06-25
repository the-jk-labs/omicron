// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type NewPost, posts, remoteActors, users } from "@/db/schema.ts";
import { type Cursor, DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";

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

function selectPosts() {
  return db
    .select({ post: posts, localAuthor: localAuthorColumns, remoteActor: remoteActorColumns })
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
      remote: true,
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    })
    .onConflictDoUpdate({
      target: posts.apId,
      set: { title: data.title, contentHtml: data.contentHtml },
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

export async function remove(id: string) {
  await db.delete(posts).where(eq(posts.id, id));
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

// Global (federated) feed: blog-type content across the whole fediverse,
// local + remote. Filtered to "Article" so microblog Notes (Mastodon,
// Pixelfed, …) are excluded. Remote posts here are ones already cached on this
// instance (fetched when browsed, or delivered to our inbox) — the feed just
// reads the cache, it never crawls, so listing stays cheap.
export function listGlobal(
  viewerId: string | null,
  cursor: Cursor | null,
  limit = DEFAULT_PAGE_SIZE,
) {
  return selectPosts()
    .where(
      and(eq(posts.apType, "Article"), isPublished, notHidden(viewerId), beforeCursor(cursor)),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}

// Local feed: posts authored on this instance only.
export function listLocal(
  viewerId: string | null,
  cursor: Cursor | null,
  limit = DEFAULT_PAGE_SIZE,
) {
  return selectPosts()
    .where(
      and(eq(posts.remote, false), isPublished, notHidden(viewerId), beforeCursor(cursor)),
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
      and(eq(posts.authorId, authorId), isPublished, notHidden(viewerId), beforeCursor(cursor)),
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
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}

// Personalized feed: own posts + posts by followed authors, local and remote.
// Remote follows contribute the cached posts of the remote actors this user
// follows (delivered to our inbox, or crawled when first followed).
export function listFeed(userId: string, cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
  const followedLocal = sql`(
    select followee_id from follows
    where follower_id = ${userId} and followee_id is not null
  )`;
  const followedRemote = sql`(
    select remote_followee_id from follows
    where follower_id = ${userId} and remote_followee_id is not null
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
        ),
        notHidden(userId),
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}
