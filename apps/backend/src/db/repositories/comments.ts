// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { comments, type NewComment, remoteActors, users } from "@/db/schema.ts";
import { type Cursor, DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";

// Comment DB access. Top-level comments are newest-first and cursor-paginated
// like posts; their replies are fetched in one batched query (oldest-first).
//
// A comment's author is either a local user or a cached remote actor (a Note
// reply that arrived over federation) — exactly one of the two joins hits per
// row, enforced by `comments_author_kind_ck`. Callers pick the author shape via
// `authorOf` (see routes/serializers.ts `commentView`).

const authorColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
};

const remoteAuthorColumns = {
  id: remoteActors.id,
  handle: remoteActors.handle,
  displayName: remoteActors.displayName,
  avatarUrl: remoteActors.avatarUrl,
  apId: remoteActors.apId,
};

export type CommentWithAuthor = Awaited<ReturnType<typeof listByPost>>[number];

export async function create(data: NewComment) {
  const [row] = await db.insert(comments).values(data).returning();
  return row;
}

// Idempotent ingest of a federated reply, keyed by its ActivityPub id —
// re-delivery (or a Create racing its own Update) resolves to the same row.
export async function createRemote(data: Omit<NewComment, "authorId"> & { remoteActorId: string; apId: string }) {
  const [row] = await db.insert(comments).values(data).onConflictDoNothing({ target: comments.apId }).returning();
  if (row) return row;
  return findByApId(data.apId);
}

export function findById(id: string) {
  return db
    .select()
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1)
    .then((r) => r[0] ?? null);
}

// A comment by its ActivityPub URI — the canonical Note id for a remote reply,
// or the lazily-minted one for a federated local comment. Backs inbound
// Update/Delete routing and reply-to-comment threading.
export function findByApId(apId: string) {
  return db
    .select()
    .from(comments)
    .where(eq(comments.apId, apId))
    .limit(1)
    .then((r) => r[0] ?? null);
}

// Mints (or re-mints) the ActivityPub URI of a local comment on its first
// outbound federation, so the Note id is stable across edits and deletes.
export async function setApId(id: string, apId: string) {
  const [row] = await db.update(comments).set({ apId }).where(eq(comments.id, id)).returning();
  return row;
}

export async function update(id: string, content: string) {
  const [row] = await db.update(comments).set({ content }).where(eq(comments.id, id)).returning();
  return row;
}

// Deletes a comment; replies cascade via the parent_id foreign key.
export async function remove(id: string) {
  await db.delete(comments).where(eq(comments.id, id));
}

function beforeCursor(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const ts = new Date(cursor.createdAt);
  return or(lt(comments.createdAt, ts), and(eq(comments.createdAt, ts), lt(comments.id, cursor.id)));
}

// Hides comments the viewer blocked, or (for local authors) who blocked the
// viewer — blocks are bidirectional locally. Remote authors can only be
// filtered on the viewer's outgoing remote blocks: an inbound Block severs the
// follow edge without persisting, so an unknown inbound block is invisible
// here. Undefined for guests, so `and()` drops the filters when logged out.
//
// `authorId` is nullable now, so each half is guarded by its own null check —
// a bare `null NOT IN (…)` would evaluate to null and drop the row.
function notBlocked(viewerId: string | null) {
  if (!viewerId) return undefined;
  return and(
    or(
      isNull(comments.authorId),
      sql`${comments.authorId} not in (
        select target_user_id from blocks
          where user_id = ${viewerId} and target_user_id is not null
        union
        select user_id from blocks where target_user_id = ${viewerId}
      )`,
    ),
    or(
      isNull(comments.remoteActorId),
      sql`${comments.remoteActorId} not in (
        select target_remote_actor_id from blocks
          where user_id = ${viewerId} and target_remote_actor_id is not null
      )`,
    ),
  );
}

function withAuthors() {
  return db
    .select({ comment: comments, author: authorColumns, remoteActor: remoteAuthorColumns })
    .from(comments)
    .leftJoin(users, eq(comments.authorId, users.id))
    .leftJoin(remoteActors, eq(comments.remoteActorId, remoteActors.id));
}

// Top-level comments only (parentId is null), newest first.
export function listByPost(postId: string, cursor: Cursor | null, viewerId: string | null, limit = DEFAULT_PAGE_SIZE) {
  return withAuthors()
    .where(and(eq(comments.postId, postId), isNull(comments.parentId), notBlocked(viewerId), beforeCursor(cursor)))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(limit + 1);
}

// All replies for the given parent comments, oldest first.
export function listReplies(parentIds: string[], viewerId: string | null) {
  if (parentIds.length === 0) return Promise.resolve([] as CommentWithAuthor[]);
  return withAuthors()
    .where(and(inArray(comments.parentId, parentIds), notBlocked(viewerId)))
    .orderBy(asc(comments.createdAt), asc(comments.id));
}

// Oldest-first top-level comments for the post's federated Replies collection.
// Local and remote alike: both are Responses, and both federate back out.
export function listForReplies(postId: string, limit = 20) {
  return withAuthors()
    .where(and(eq(comments.postId, postId), isNull(comments.parentId)))
    .orderBy(asc(comments.createdAt), asc(comments.id))
    .limit(limit);
}

// Honest `totalItems` for the Replies collection above (the item list is
// capped, the count is not).
export async function countTopLevel(postId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(comments)
    .where(and(eq(comments.postId, postId), isNull(comments.parentId)));
  return row?.n ?? 0;
}

// Every response on the instance, for NodeInfo's usage figures. Local and
// federated replies alike — both are responses left on this instance's posts.
export async function countAll(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(comments);
  return row?.n ?? 0;
}

// Comment count for many posts in one query.
export async function countsFor(postIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (postIds.length === 0) return map;

  const rows = await db
    .select({ postId: comments.postId, count: sql<number>`count(*)::int` })
    .from(comments)
    .where(inArray(comments.postId, postIds))
    .groupBy(comments.postId);

  for (const r of rows as { postId: string; count: number }[]) map.set(r.postId, r.count);
  return map;
}
