// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared API types (mirror the backend serializers).

export type User = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  // Optional contact email the user shows on their profile; "" when unset.
  publicEmail: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: string;
  tags: Tag[];
  links: ProfileLink[];
  // Private account fields — present only on the signed-in user's own record
  // (from /auth/me, login, register), never on other users' public profiles.
  email?: string;
  emailVerified?: boolean;
};

// An external link a user features on their profile. `platform` is a key from
// the shared registry (see lib/profileLinks.ts) driving the brand icon + label.
export type ProfileLink = { platform: string; url: string; label: string };

export type PostAuthor = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  // True when the author is a cached remote actor (username is a user@host handle).
  remote?: boolean;
};

// A tag attached to a post. `slug` is the normalized key used in URLs; `name`
// is the display form. `postCount` is present in discovery/search payloads.
export type Tag = { slug: string; name: string };
export type TagWithCount = Tag & { postCount: number };

export type Post = {
  id: string;
  title: string | null;
  contentHtml: string;
  contentJson?: unknown;
  remote: boolean;
  status?: "draft" | "published";
  createdAt: string;
  author: PostAuthor;
  tags: Tag[];
  likeCount: number;
  liked: boolean;
  commentCount: number;
};

// A tag's detail payload, powering the tag page header.
export type TagDetail = {
  tag: Tag;
  postCount: number;
  followerCount: number;
  isFollowing: boolean;
};

export type Comment = {
  id: string;
  content: string;
  createdAt: string;
  author: PostAuthor;
  parentId: string | null;
  likeCount: number;
  liked: boolean;
  replies: Comment[];
};

// A reading list (YouTube-playlist-style collection of posts). `isReadLater`
// marks the special per-user "Read later" list. `contains` is present only in
// the save-menu payload (whether a given post is already in this list).
export type ReadingList = {
  id: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  isReadLater: boolean;
  itemCount: number;
  createdAt: string;
  contains?: boolean;
};

// A single list's detail payload (header + ownership).
export type ReadingListDetail = {
  list: ReadingList;
  isOwner: boolean;
  owner: { username: string; displayName: string };
};

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};

export type Profile = {
  user: User;
  counts: { followers: number; following: number };
  isFollowing: boolean;
  isMuted: boolean;
  isBlocked: boolean;
};

// A remote actor's profile, shaped like the local profile response so the
// profile page can render either with one layout.
export type RemoteProfile = {
  user: {
    id: string;
    username: string; // user@host handle
    displayName: string;
    bio: string;
    avatarUrl: string | null;
    host: string;
    apId: string;
    remote: true;
    tags: Tag[];
  };
  counts: { followers: number; following: number };
  isFollowing: boolean;
  isMuted: boolean;
  isBlocked: boolean;
};

// A followed / muted / blocked account in the connections lists. `username` is
// a plain username for local accounts and a `user@host` handle for remote ones,
// so `/@${username}` links resolve to the right profile either way.
export type RelationActor = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  remote: boolean;
};

// A "who to follow" suggestion — a local account plus a follower count for
// social proof. Reuses the `RelationActor` shape so `/@${username}` links and
// the Follow button work unchanged.
export type SuggestedUser = RelationActor & { followerCount: number };

// Site-search payload: matching stories, people and tags. People reuse the
// `RelationActor` shape so `/@${username}` links resolve local or remote.
export type SearchResults = {
  posts: Post[];
  people: RelationActor[];
  tags: TagWithCount[];
};

// ── writer dashboard (analytics) ──
// Per-post aggregate stats. `views` counts one distinct reader per day (a
// refresh never inflates it) and is 0 when on-instance view counting is disabled
// for the instance (see `DashboardSummary.onInstanceViews`).
export type PostStat = {
  postId: string;
  title: string | null;
  createdAt: string;
  views: number;
  likes: number;
  comments: number;
};

// One day's summed view total, for the views-over-time chart.
export type DayTotals = { day: string; views: number };

// The signed-in author's own analytics. `onInstanceViews` is false when a
// moderator has disabled view counting for the instance, in which case the UI
// hides the views panels and shows only fediverse engagement. See ANALYTICS.md.
export type DashboardSummary = {
  onInstanceViews: boolean;
  totals: {
    views: number;
    likes: number;
    comments: number;
    followers: number;
  };
  series: DayTotals[];
  posts: PostStat[];
};

// Moderator-tunable instance settings (admin only).
export type InstanceSettings = { onInstanceViews: boolean };

// ── moderation (admin only) ──
// A row in the admin user table. Exposes the moderation-relevant private fields
// (login email, verification + suspension state) — admin surfaces only.
export type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  email: string;
  emailVerified: boolean;
  suspended: boolean;
  createdAt: string;
};

// A defederated domain (admin only). Blocking a domain also blocks its subdomains.
export type BlockedDomain = { domain: string; reason: string; createdAt: string };

// A report in the moderation queue, enriched with light subject/reporter info.
export type Report = {
  id: string;
  subjectType: "post" | "user";
  reason: string;
  status: "open" | "resolved";
  resolution: string;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { username: string; displayName: string } | null;
  postId: string | null;
  postTitle: string | null;
  postAuthor: string | null;
  userId: string | null;
  userUsername: string | null;
  userDisplayName: string | null;
};