import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type NewPost, posts, users } from "@/db/schema.ts";
import { type Cursor, DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";

// Post DB access. Queries fetch `limit + 1` rows so the service can derive a
// next-cursor without a second round-trip.

const authorColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
};

export type PostWithAuthor = Awaited<ReturnType<typeof listGlobal>>[number];

export async function create(data: NewPost) {
  const [row] = await db.insert(posts).values(data).returning();
  return row;
}

export function findById(id: string) {
  return db
    .select({ post: posts, author: authorColumns })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.id, id))
    .limit(1)
    .then((r: unknown[]) => (r[0] ?? null) as PostWithAuthor | null);
}

export function findByApId(apId: string) {
  return db.query.posts.findFirst({ where: eq(posts.apId, apId) });
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

// Global feed: blog-type content across the whole fediverse (local + remote).
// Filtered to "Article" so microblog Notes (Mastodon, Pixelfed, …) are excluded.
export function listGlobal(cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
  return db
    .select({ post: posts, author: authorColumns })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(and(eq(posts.apType, "Article"), beforeCursor(cursor)))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}

// Local feed: posts authored on this instance only.
export function listLocal(cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
  return db
    .select({ post: posts, author: authorColumns })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(and(eq(posts.remote, false), beforeCursor(cursor)))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}

export function listByAuthor(authorId: string, cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
  return db
    .select({ post: posts, author: authorColumns })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(and(eq(posts.authorId, authorId), beforeCursor(cursor)))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}

// Personalized feed: own posts + posts by followed authors.
export function listFeed(userId: string, cursor: Cursor | null, limit = DEFAULT_PAGE_SIZE) {
  const followed = sql`(
    select followee_id from follows
    where follower_id = ${userId} and followee_id is not null
  )`;
  return db
    .select({ post: posts, author: authorColumns })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(
      and(
        or(eq(posts.authorId, userId), sql`${posts.authorId} in ${followed}`),
        beforeCursor(cursor),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);
}
