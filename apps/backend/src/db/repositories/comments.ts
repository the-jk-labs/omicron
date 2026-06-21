import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { comments, type NewComment, users } from "@/db/schema.ts";
import { type Cursor, DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";

// Comment DB access. Flat list, newest first, cursor-paginated like posts.

const authorColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
};

export type CommentWithAuthor = Awaited<ReturnType<typeof listByPost>>[number];

export async function create(data: NewComment) {
  const [row] = await db.insert(comments).values(data).returning();
  return row;
}

function beforeCursor(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const ts = new Date(cursor.createdAt);
  return or(
    lt(comments.createdAt, ts),
    and(eq(comments.createdAt, ts), lt(comments.id, cursor.id)),
  );
}

export function listByPost(postId: string, cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
  return db
    .select({ comment: comments, author: authorColumns })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(and(eq(comments.postId, postId), beforeCursor(cursor)))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(limit + 1);
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
