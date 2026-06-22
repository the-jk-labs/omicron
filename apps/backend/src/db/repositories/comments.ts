// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { comments, type NewComment, users } from "@/db/schema.ts";
import { type Cursor, DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";

// Comment DB access. Top-level comments are newest-first and cursor-paginated
// like posts; their replies are fetched in one batched query (oldest-first).

const authorColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
};

export type CommentWithAuthor = Awaited<ReturnType<typeof listByPost>>[number];

export async function create(data: NewComment) {
  const [row] = await db.insert(comments).values(data).returning();
  return row;
}

export function findById(id: string) {
  return db
    .select()
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1)
    .then((r) => r[0] ?? null);
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
  return or(
    lt(comments.createdAt, ts),
    and(eq(comments.createdAt, ts), lt(comments.id, cursor.id)),
  );
}

// Top-level comments only (parentId is null), newest first.
export function listByPost(postId: string, cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
  return db
    .select({ comment: comments, author: authorColumns })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(and(eq(comments.postId, postId), isNull(comments.parentId), beforeCursor(cursor)))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(limit + 1);
}

// All replies for the given parent comments, oldest first.
export function listReplies(parentIds: string[]) {
  if (parentIds.length === 0) return Promise.resolve([] as CommentWithAuthor[]);
  return db
    .select({ comment: comments, author: authorColumns })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(inArray(comments.parentId, parentIds))
    .orderBy(asc(comments.createdAt), asc(comments.id));
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