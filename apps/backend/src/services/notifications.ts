// SPDX-License-Identifier: AGPL-3.0-or-later
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import { notificationView } from "@/routes/serializers.ts";
import { type Cursor, DEFAULT_PAGE_SIZE, encodeCursor } from "@/lib/pagination.ts";

// Business logic for in-app notifications. `notify`/`unnotify` are the single
// entry points other services (follows, likes, comments, comment-likes) and the
// federation inbox call. Both are best-effort: a notification failure must never
// break the underlying like/follow/comment write, so they swallow errors.

export type NotificationType =
  | "follow"
  | "follow_request"
  | "follow_accepted"
  | "like"
  | "comment"
  | "reply"
  | "comment_like";

type NotifyParams = {
  recipientId: string;
  type: NotificationType;
  actorId?: string | null;
  remoteActorId?: string | null;
  postId?: string | null;
  commentId?: string | null;
};

export async function notify(params: NotifyParams): Promise<void> {
  // Never notify someone about their own action (self-like, self-comment).
  if (params.actorId && params.actorId === params.recipientId) return;
  try {
    await notificationsRepo.create({
      recipientId: params.recipientId,
      type: params.type,
      actorId: params.actorId ?? null,
      remoteActorId: params.remoteActorId ?? null,
      postId: params.postId ?? null,
      commentId: params.commentId ?? null,
    });
  } catch (err) {
    console.error("notifications: failed to create", err);
  }
}

// Undo path: remove the notification for an action that was reversed (unlike,
// unfollow) so the bell doesn't show a stale "X liked your post".
export async function unnotify(params: NotifyParams): Promise<void> {
  if (params.actorId && params.actorId === params.recipientId) return;
  try {
    await notificationsRepo.removeMatching({
      recipientId: params.recipientId,
      type: params.type,
      actorId: params.actorId ?? null,
      remoteActorId: params.remoteActorId ?? null,
      postId: params.postId ?? null,
      commentId: params.commentId ?? null,
    });
  } catch (err) {
    console.error("notifications: failed to remove", err);
  }
}

export async function list(recipientId: string, cursor: Cursor | null) {
  const rows = await notificationsRepo.listFor(recipientId, cursor, DEFAULT_PAGE_SIZE);
  const hasMore = rows.length > DEFAULT_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, DEFAULT_PAGE_SIZE) : rows;
  const last = page.at(-1);
  const nextCursor = hasMore && last
    ? encodeCursor({
      createdAt: last.notification.createdAt.toISOString(),
      id: last.notification.id,
    })
    : null;
  return { items: page.map(notificationView), nextCursor };
}

export function unreadCount(recipientId: string): Promise<number> {
  return notificationsRepo.unreadCount(recipientId);
}

export function markAllRead(recipientId: string): Promise<void> {
  return notificationsRepo.markAllRead(recipientId);
}

export function markRead(recipientId: string, id: string): Promise<void> {
  return notificationsRepo.markRead(recipientId, id);
}
