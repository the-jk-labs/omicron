// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Post, RemoteActor, User } from "@/db/schema.ts";
import type { PostWithAuthor } from "@/db/repositories/posts.ts";
import type { CommentWithAuthor } from "@/db/repositories/comments.ts";
import { htmlToText } from "@/lib/html.ts";

// Minimal API payloads — never leak password hashes, keys, or emails publicly.

export type Engagement = { likeCount: number; liked: boolean; commentCount: number };

export function publicUser(u: User, tags: TagSummary[] = []) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    isAdmin: u.isAdmin,
    createdAt: u.createdAt,
    tags,
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

export function barePost(p: Omit<Post, "searchVector">) {
  return {
    id: p.id,
    title: p.title,
    contentHtml: p.contentHtml,
    status: p.status,
    createdAt: p.createdAt,
  };
}
