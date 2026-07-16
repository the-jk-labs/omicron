// SPDX-License-Identifier: AGPL-3.0-or-later
import { aliasedTable, and, type Column, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import {
  comments,
  type NewNotification,
  notifications,
  posts,
  remoteActors,
  users,
} from "@/db/schema.ts";
import { type Cursor, DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";

// Notification DB access. Services/routes never touch `db`.
//
// The actor who triggered a notification is either a local user (`actorId`) or a
// cached remote actor (`remoteActorId`); every list read left-joins both and the
// serializer coalesces whichever side is present. `posts`/`comments` are joined
// for the target's title / content snippet.

const actorColumns = {
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

const post = aliasedTable(posts, "notif_post");

function selectNotifications() {
  return db
    .select({
      notification: notifications,
      actor: actorColumns,
      remoteActor: remoteActorColumns,
      postTitle: post.title,
      commentContent: comments.content,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.actorId, users.id))
    .leftJoin(remoteActors, eq(notifications.remoteActorId, remoteActors.id))
    .leftJoin(post, eq(notifications.postId, post.id))
    .leftJoin(comments, eq(notifications.commentId, comments.id));
}

export type NotificationRow = Awaited<ReturnType<typeof listFor>>[number];

function beforeCursor(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const ts = new Date(cursor.createdAt);
  return or(
    lt(notifications.createdAt, ts),
    and(eq(notifications.createdAt, ts), lt(notifications.id, cursor.id)),
  );
}

// A recipient's notifications, newest first, cursor-paginated (limit + 1 so the
// service can derive the next cursor without a second query).
export function listFor(
  recipientId: string,
  cursor: Cursor | null,
  limit = DEFAULT_PAGE_SIZE,
) {
  return selectNotifications()
    .where(and(eq(notifications.recipientId, recipientId), beforeCursor(cursor)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);
}

// Insert a notification. Idempotent: the dedupe UNIQUE (NULLS NOT DISTINCT) means
// re-doing an action (re-like after unlike) collides and is silently ignored.
export async function create(data: NewNotification) {
  const [row] = await db.insert(notifications).values(data).onConflictDoNothing().returning();
  return row ?? null;
}

// Undo path: delete the row matching an action that was reversed (unlike,
// unfollow) so the bell never shows a stale "X liked your post". Matches on the
// same tuple the dedupe UNIQUE is built from; null target columns match null.
export async function removeMatching(match: {
  recipientId: string;
  type: string;
  actorId?: string | null;
  remoteActorId?: string | null;
  postId?: string | null;
  commentId?: string | null;
}) {
  const eqOrNull = (col: Column, val: string | null | undefined) =>
    val == null ? isNull(col) : eq(col, val);
  await db.delete(notifications).where(
    and(
      eq(notifications.recipientId, match.recipientId),
      eq(notifications.type, match.type),
      eqOrNull(notifications.actorId, match.actorId),
      eqOrNull(notifications.remoteActorId, match.remoteActorId),
      eqOrNull(notifications.postId, match.postId),
      eqOrNull(notifications.commentId, match.commentId),
    ),
  );
}

export async function unreadCount(recipientId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.recipientId, recipientId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export async function markAllRead(recipientId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.recipientId, recipientId), isNull(notifications.readAt)));
}

export async function markRead(recipientId: string, id: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.recipientId, recipientId)));
}
