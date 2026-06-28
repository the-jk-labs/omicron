// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, desc, eq, getTableColumns, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import {
  type NewReadingList,
  posts,
  type ReadingList,
  readingListItems,
  readingLists,
  remoteActors,
  users,
} from "@/db/schema.ts";
import type { PostWithAuthor } from "@/db/repositories/posts.ts";
import { type Cursor, DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";

// Reading-list DB access. Adding a post is idempotent via the unique
// (list, post) index; the read-later list is unique per user via a partial
// index, so its creation is a conflict-safe upsert.

export async function create(data: NewReadingList): Promise<ReadingList> {
  const [row] = await db.insert(readingLists).values(data).returning();
  return row;
}

// Finds the user's read-later list, creating it (private) on first use. The
// partial unique index makes the insert race-safe across concurrent requests.
export async function ensureReadLater(userId: string): Promise<ReadingList> {
  const existing = await db
    .select()
    .from(readingLists)
    .where(and(eq(readingLists.userId, userId), eq(readingLists.isReadLater, true)))
    .limit(1);
  if (existing[0]) return existing[0];

  const [row] = await db
    .insert(readingLists)
    .values({ userId, title: "Read later", visibility: "private", isReadLater: true })
    .onConflictDoNothing()
    .returning();
  // Lost the race — another request created it; read it back.
  if (row) return row;
  const [winner] = await db
    .select()
    .from(readingLists)
    .where(and(eq(readingLists.userId, userId), eq(readingLists.isReadLater, true)))
    .limit(1);
  return winner;
}

// Accepts a full UUID or a hex id-prefix (the short suffix used in canonical
// list URLs, e.g. `66635376`). 8 hex chars is 32 bits, so collisions are
// negligible for a single instance; we deterministically return the oldest match.
export function findById(id: string): Promise<ReadingList | undefined> {
  const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const match = isFullUuid
    ? eq(readingLists.id, id)
    : sql`${readingLists.id}::text like ${`${id.toLowerCase()}%`}`;
  return db.query.readingLists.findFirst({ where: match, orderBy: readingLists.createdAt });
}

// A user's lists, read-later pinned first, then newest first. `onlyPublic`
// restricts to public lists (viewing someone else's profile).
export async function listForUser(
  userId: string,
  onlyPublic: boolean,
): Promise<ReadingList[]> {
  return await db
    .select()
    .from(readingLists)
    .where(
      and(
        eq(readingLists.userId, userId),
        onlyPublic ? eq(readingLists.visibility, "public") : undefined,
      ),
    )
    .orderBy(desc(readingLists.isReadLater), desc(readingLists.createdAt));
}

export async function update(
  id: string,
  data: Partial<Pick<ReadingList, "title" | "description" | "visibility">>,
): Promise<ReadingList> {
  const [row] = await db.update(readingLists).set(data).where(eq(readingLists.id, id)).returning();
  return row;
}

export async function remove(id: string): Promise<void> {
  await db.delete(readingLists).where(eq(readingLists.id, id));
}

// ── items ──────────────────────────────────────────────────────────────

export async function addItem(listId: string, postId: string): Promise<void> {
  await db.insert(readingListItems).values({ listId, postId }).onConflictDoNothing();
}

export async function removeItem(listId: string, postId: string): Promise<void> {
  await db
    .delete(readingListItems)
    .where(and(eq(readingListItems.listId, listId), eq(readingListItems.postId, postId)));
}

// Item count per list, for the list cards. Batched over many lists in one query.
export async function itemCountsFor(listIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (listIds.length === 0) return map;
  const rows = await db
    .select({ listId: readingListItems.listId, count: sql<number>`count(*)::int` })
    .from(readingListItems)
    .where(inArray(readingListItems.listId, listIds))
    .groupBy(readingListItems.listId);
  for (const r of rows as { listId: string; count: number }[]) map.set(r.listId, r.count);
  return map;
}

// Which of `listIds` already contain `postId` — powers the save menu's checks.
export async function listIdsContaining(
  listIds: string[],
  postId: string,
): Promise<Set<string>> {
  const set = new Set<string>();
  if (listIds.length === 0) return set;
  const rows = await db
    .select({ listId: readingListItems.listId })
    .from(readingListItems)
    .where(and(inArray(readingListItems.listId, listIds), eq(readingListItems.postId, postId)));
  for (const r of rows as { listId: string }[]) set.add(r.listId);
  return set;
}

// Minimal references for federating a list as an OrderedCollection: each saved
// post's id + (for remote posts) its canonical ActivityPub URI. Ordered
// newest-added first to match the on-site list order.
export type ItemRef = { id: string; apId: string | null; remote: boolean };

export async function itemRefs(listId: string): Promise<ItemRef[]> {
  const rows = await db
    .select({ id: posts.id, apId: posts.apId, remote: posts.remote })
    .from(readingListItems)
    .innerJoin(posts, eq(readingListItems.postId, posts.id))
    .where(eq(readingListItems.listId, listId))
    .orderBy(desc(readingListItems.createdAt), desc(readingListItems.id));
  return rows as ItemRef[];
}

// A row carries its post (with author) plus the join row's id/createdAt, which
// drive keyset pagination over "date added" order (independent of the post's
// own timestamps).
export type ListItemRow = PostWithAuthor & { itemId: string; itemCreatedAt: Date };

// Every post column except the large full-text `search_vector` (mirrors
// posts.ts) — timelines must never pull the vector back per row.
const { searchVector: _searchVector, ...postColumns } = getTableColumns(posts);

// Keyset condition over the join row's (created_at, id) — newest-added first.
function beforeItemCursor(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const ts = new Date(cursor.createdAt);
  return or(
    lt(readingListItems.createdAt, ts),
    and(eq(readingListItems.createdAt, ts), lt(readingListItems.id, cursor.id)),
  );
}

// A list's posts, most recently added first, keyset-paginated. Fetches
// `limit + 1` so the service can derive the next cursor.
export async function listItems(
  listId: string,
  cursor: Cursor | null,
  limit = DEFAULT_PAGE_SIZE,
): Promise<ListItemRow[]> {
  const rows = await db
    .select({
      post: postColumns,
      localAuthor: {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
      remoteActor: {
        id: remoteActors.id,
        handle: remoteActors.handle,
        displayName: remoteActors.displayName,
        avatarUrl: remoteActors.avatarUrl,
      },
      itemId: readingListItems.id,
      itemCreatedAt: readingListItems.createdAt,
    })
    .from(readingListItems)
    .innerJoin(posts, eq(readingListItems.postId, posts.id))
    .leftJoin(users, eq(posts.authorId, users.id))
    .leftJoin(remoteActors, eq(posts.remoteActorId, remoteActors.id))
    .where(and(eq(readingListItems.listId, listId), beforeItemCursor(cursor)))
    .orderBy(desc(readingListItems.createdAt), desc(readingListItems.id))
    .limit(limit + 1);
  return rows as unknown as ListItemRow[];
}
