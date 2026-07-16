// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Post, ProfileLink, RemoteActor, User } from "@/db/schema.ts";
import type { PostWithAuthor } from "@/db/repositories/posts.ts";
import type { CommentWithAuthor } from "@/db/repositories/comments.ts";
import type { NotificationRow } from "@/db/repositories/notifications.ts";
import { htmlToText } from "@/lib/html.ts";

// Minimal API payloads — never leak password hashes, keys, or emails publicly.

export type Engagement = { likeCount: number; liked: boolean; commentCount: number };

export type LinkSummary = { platform: string; url: string; label: string };

export function profileLinkView(l: ProfileLink): LinkSummary {
  return { platform: l.platform, url: l.url, label: l.label };
}

export function publicUser(u: User, tags: TagSummary[] = [], links: LinkSummary[] = []) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    bio: u.bio,
    publicEmail: u.publicEmail,
    avatarUrl: u.avatarUrl,
    isAdmin: u.isAdmin,
    createdAt: u.createdAt,
    tags,
    links,
  };
}

// Self-view payload: everything in `publicUser` plus the private account fields
// (login email + verification state). Only ever returned to the authenticated
// account owner (their own /auth/me, login, register) — never for other users.
export function privateUser(u: User, tags: TagSummary[] = [], links: LinkSummary[] = []) {
  return {
    ...publicUser(u, tags, links),
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
  };
}

// Admin user-table row: identity plus the moderation-relevant private fields
// (login email, verification + suspension state). Only ever returned to admins
// via the admin routes — never on any public surface.
export function adminUserView(u: User) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    isAdmin: u.isAdmin,
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
    suspended: u.suspendedAt !== null,
    createdAt: u.createdAt,
  };
}

// Coalesces the two possible author sources into one uniform shape. For remote
// authors `username` is the full `user@host` handle, so the frontend's
// `/@${author.username}` links resolve straight back to the remote profile.
function postAuthor(row: PostWithAuthor) {
  if (row.localAuthor) {
    return {
      id: row.localAuthor.id,
      username: row.localAuthor.username,
      displayName: row.localAuthor.displayName,
      avatarUrl: row.localAuthor.avatarUrl,
      remote: false,
    };
  }
  const a = row.remoteActor!;
  return {
    id: a.id,
    username: a.handle,
    displayName: htmlToText(a.displayName) || a.handle,
    avatarUrl: a.avatarUrl,
    remote: true,
  };
}

export type TagSummary = { slug: string; name: string };

export function postWithAuthor(
  row: PostWithAuthor,
  engagement?: Engagement,
  tags: TagSummary[] = [],
) {
  return {
    id: row.post.id,
    title: row.post.title,
    contentHtml: row.post.contentHtml,
    contentJson: row.post.contentJson,
    remote: row.post.remote,
    status: row.post.status,
    createdAt: row.post.createdAt,
    author: postAuthor(row),
    tags,
    likeCount: engagement?.likeCount ?? 0,
    liked: engagement?.liked ?? false,
    commentCount: engagement?.commentCount ?? 0,
  };
}

// Profile payload for a cached remote actor, shaped like the local profile
// response (`{ user, counts, isFollowing }`) so the frontend reuses one layout.
export function remoteProfile(
  actor: RemoteActor,
  isFollowing = false,
  relation: { isMuted: boolean; isBlocked: boolean } = { isMuted: false, isBlocked: false },
  tags: TagSummary[] = [],
) {
  return {
    user: {
      id: actor.id,
      username: actor.handle,
      // Mastodon delivers name/summary as HTML; present them as plain text.
      displayName: htmlToText(actor.displayName) || actor.handle,
      bio: htmlToText(actor.bio),
      avatarUrl: actor.avatarUrl,
      host: actor.host,
      apId: actor.apId,
      remote: true as const,
      tags,
    },
    counts: {
      followers: actor.followersCount ?? 0,
      following: actor.followingCount ?? 0,
    },
    isFollowing,
    isMuted: relation.isMuted,
    isBlocked: relation.isBlocked,
  };
}

// Uniform actor summary for the relation-management lists (following / muted /
// blocked). Shaped so the frontend's `/@${username}` links resolve to either a
// local or remote profile, mirroring `postAuthor`.
export function relationActorLocal(
  row: { id: string; username: string; displayName: string; avatarUrl: string | null },
) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    remote: false as const,
  };
}

export function relationActorRemote(
  row: { id: string; handle: string; displayName: string; avatarUrl: string | null },
) {
  return {
    id: row.id,
    username: row.handle,
    displayName: htmlToText(row.displayName) || row.handle,
    avatarUrl: row.avatarUrl,
    remote: true as const,
  };
}

type LikeStats = { count: number; liked: boolean };

// Accepts a plain author row plus optional like stats and nested replies (only
// top-level comments carry replies). Replies are themselves rendered via
// commentView so the shape is uniform at every level.
export function commentView(
  row: CommentWithAuthor & {
    likeStats?: LikeStats;
    replies?: (CommentWithAuthor & { likeStats?: LikeStats })[];
  },
): {
  id: string;
  content: string;
  createdAt: Date;
  author: CommentWithAuthor["author"];
  parentId: string | null;
  likeCount: number;
  liked: boolean;
  replies: ReturnType<typeof commentView>[];
} {
  return {
    id: row.comment.id,
    content: row.comment.content,
    createdAt: row.comment.createdAt,
    author: row.author,
    parentId: row.comment.parentId,
    likeCount: row.likeStats?.count ?? 0,
    liked: row.likeStats?.liked ?? false,
    replies: (row.replies ?? []).map((r) => commentView(r)),
  };
}

// Notification payload for the bell dropdown / notifications page. The actor is
// coalesced from its local or remote source into the same `{ username, remote }`
// shape as `postAuthor` so `/@${actor.username}` links resolve either way. A
// short comment snippet is included for comment/reply/comment-like rows; the
// post link is the id (the frontend hits /posts/:id, which redirects canonical).
export function notificationView(row: NotificationRow) {
  const n = row.notification;
  const actor = row.actor
    ? relationActorLocal(row.actor)
    : row.remoteActor
    ? relationActorRemote(row.remoteActor)
    : null;
  const snippet = row.commentContent ? htmlToText(row.commentContent).slice(0, 140) : null;
  return {
    id: n.id,
    type: n.type as "follow" | "like" | "comment" | "reply" | "comment_like",
    actor,
    postId: n.postId,
    postTitle: row.postTitle,
    commentSnippet: snippet,
    read: n.readAt !== null,
    createdAt: n.createdAt,
  };
}

export function barePost(p: Omit<Post, "searchVector">) {
  return {
    id: p.id,
    title: p.title,
    contentHtml: p.contentHtml,
    status: p.status,
    createdAt: p.createdAt,
  };
}

// Reading-list payload. `itemCount` is the number of saved posts; `contains` is
// present only in the save-menu payload (whether the post in question is in it).
export function readingListView(
  list: {
    id: string;
    title: string;
    description: string;
    visibility: string;
    isReadLater: boolean;
    createdAt: Date;
    itemCount: number;
    contains?: boolean;
  },
) {
  return {
    id: list.id,
    title: list.title,
    description: list.description,
    visibility: list.visibility,
    isReadLater: list.isReadLater,
    itemCount: list.itemCount,
    createdAt: list.createdAt,
    ...(list.contains !== undefined ? { contains: list.contains } : {}),
  };
}
