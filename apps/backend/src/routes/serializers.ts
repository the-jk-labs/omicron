// SPDX-License-Identifier: AGPL-3.0-or-later
import type {
  Post,
  ProfileLink,
  ReadingList as ReadingListRow,
  RemoteActor,
  User,
  WebhookToken,
} from "@/db/schema.ts";
import type { PostWithAuthor } from "@/db/repositories/posts.ts";
import type { CommentWithAuthor } from "@/db/repositories/comments.ts";
import type { NotificationRow } from "@/db/repositories/notifications.ts";
import { htmlToText } from "@/lib/html.ts";
import { bannerOf } from "@/lib/cover.ts";

// Minimal API payloads — never leak password hashes, keys, or emails publicly.

export type Engagement = {
  likeCount: number;
  liked: boolean;
  commentCount: number;
  recommendCount: number;
  recommended: boolean;
};

// Who recommended a post, and when — attached only to a feed item that reached
// the viewer via a recommendation rather than authorship/follow (see
// services/feed.ts). Shaped like `postAuthor` (local-or-remote, `username` a
// `user@host` handle for a remote recommender) so `/@${username}` resolves
// either way.
export type RecommendedBy = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  remote: boolean;
  recommendedAt: Date;
};

export type LinkSummary = { platform: string; url: string; label: string };

export function profileLinkView(l: ProfileLink): LinkSummary {
  return { platform: l.platform, url: l.url, label: l.label };
}

// `locked` marks a private profile the viewer may not see into (see
// followsService.profile). The header — name, bio, counts, links — still renders
// so a stranger can decide whether to request a follow, but anything with the
// weight of a post is withheld. The custom section is one of those: it's a whole
// page the author controls, not a one-line bio, so it stays behind the lock
// alongside their posts and follower lists.
export function publicUser(
  u: User,
  tags: TagSummary[] = [],
  links: LinkSummary[] = [],
  { locked = false }: { locked?: boolean } = {},
) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    bio: u.bio,
    publicEmail: u.publicEmail,
    // Rendered + sanitized on write (see services/users.ts); the reader drops it
    // straight into the About tab. `customSection` is the Markdown source, sent
    // so the owner's editor can reload exactly what they typed.
    customSection: locked ? "" : u.customSection,
    customSectionHtml: locked ? "" : u.customSectionHtml,
    avatarUrl: u.avatarUrl,
    isAdmin: u.isAdmin,
    isPrivate: u.isPrivate,
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
  recommendedBy: RecommendedBy | null = null,
) {
  return {
    id: row.post.id,
    title: row.post.title,
    // The readable half of the permalink, `/@author/<slug>` (lib/slug.ts). Null
    // on remote and untitled posts, which the frontend addresses by short id.
    slug: row.post.slug,
    contentHtml: row.post.contentHtml,
    contentJson: row.post.contentJson,
    remote: row.post.remote,
    status: row.post.status,
    // When a scheduled post goes out, and null on every other post. Only ever
    // reaches its own author: a scheduled post is filtered out of every public
    // listing and refused by name (see assertVisible in services/posts.ts).
    publishAt: row.post.publishAt,
    language: row.post.language,
    // Present only on ingested posts (see services/webhooks.ts); null for
    // anything written in the editor, whose preview the reader derives itself.
    summary: row.post.summary,
    // The author's explicit banner choice (null when they made none) and what
    // to actually display — see lib/cover.ts. The editor reads the first, so
    // reopening a post never turns a fallback into a choice; every reader
    // surface reads the second.
    coverUrl: row.post.coverUrl,
    bannerUrl: bannerOf(row.post),
    coverCredit: row.post.coverCredit ?? null,
    createdAt: row.post.createdAt,
    // When the content itself last changed. The reader's `dateModified` in the
    // page's structured data, so an edited article is re-read rather than left
    // in search results as its first draft.
    updatedAt: row.post.updatedAt,
    author: postAuthor(row),
    tags,
    likeCount: engagement?.likeCount ?? 0,
    liked: engagement?.liked ?? false,
    commentCount: engagement?.commentCount ?? 0,
    recommendCount: engagement?.recommendCount ?? 0,
    recommended: engagement?.recommended ?? false,
    // Present only on a "For you" feed item that arrived via a recommendation
    // rather than authorship/follow; null everywhere else (profiles, Local,
    // Global, search, …), which the frontend reads as "not a recommend entry".
    recommendedBy,
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
    type: n.type as
      | "follow"
      | "follow_request"
      | "follow_accepted"
      | "like"
      | "comment"
      | "reply"
      | "comment_like"
      | "recommend",
    actor,
    postId: n.postId,
    postTitle: row.postTitle,
    commentSnippet: snippet,
    read: n.readAt !== null,
    createdAt: n.createdAt,
  };
}

// Webhook-token payload for the owner's Settings page. The stored value is a
// SHA-256 hash and must never leave the server — not even to its owner, who saw
// the plaintext once at mint time and cannot be shown it again.
export function webhookTokenView(t: WebhookToken) {
  return {
    id: t.id,
    label: t.label,
    lastUsedAt: t.lastUsedAt,
    createdAt: t.createdAt,
  };
}

export function barePost(p: Omit<Post, "searchVector">) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    contentHtml: p.contentHtml,
    status: p.status,
    // The composer reads this back after scheduling, so its header can show
    // the time that was actually stored rather than the one it sent.
    publishAt: p.publishAt,
    language: p.language,
    summary: p.summary,
    coverUrl: p.coverUrl,
    bannerUrl: bannerOf(p),
    coverCredit: p.coverCredit ?? null,
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
    visibility: ReadingListRow["visibility"];
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
