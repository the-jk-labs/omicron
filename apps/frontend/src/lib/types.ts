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
  // Private account (Instagram-style): posts are visible only to approved
  // followers and following requires approval. Public by default.
  isPrivate: boolean;
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
  // BCP-47 primary language subtag (e.g. "en", "tr"), or null/undefined when the
  // author didn't specify one.
  language?: string | null;
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

// An in-app notification (mirrors the backend `notificationView`). `actor` is
// the local-or-remote user who triggered it, in the same `{ username, remote }`
// shape as PostAuthor so `/@${actor.username}` links resolve either way; it is
// null only if the actor was deleted. `postId` targets /posts/:id (canonical
// redirect); `postTitle`/`commentSnippet` give the row its context.
export type NotificationType =
  | "follow"
  | "follow_request"
  | "follow_accepted"
  | "like"
  | "comment"
  | "reply"
  | "comment_like";

export type Notification = {
  id: string;
  type: NotificationType;
  actor: PostAuthor | null;
  postId: string | null;
  postTitle: string | null;
  commentSnippet: string | null;
  read: boolean;
  createdAt: string;
};

// The viewer's follow relationship to a profile: not following, a pending
// request (private account awaiting approval), or an approved follow.
export type FollowState = "none" | "requested" | "following";

export type Profile = {
  user: User;
  counts: { followers: number; following: number };
  followState: FollowState;
  isFollowing: boolean;
  isMuted: boolean;
  isBlocked: boolean;
  // A private profile the viewer can't see into (not the owner, not an approved
  // follower): header + counts render, but posts and follower lists are hidden.
  locked: boolean;
};

// A pending follow request shown on the /follow-requests page.
export type FollowRequest = {
  requestId: string;
  actor: RelationActor;
  createdAt: string;
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

// Site-search payload: matching articles, people and tags. People reuse the
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

// Security controls. `anubisProtection` is the live state of the AI-scraper
// proof-of-work wall; `anubisManaged` says whether this deployment can toggle it
// (Caddy admin reachable) — false in a bare dev run, so the UI explains instead.
export type SecuritySettings = { anubisProtection: boolean; anubisManaged: boolean };

// Discoverability / SEO. `indexingEnabled` drives robots.txt + a site-wide
// `noindex`; `verification` holds per-engine site-verification tokens (the meta
// `content` value only), keyed by engine (google/bing/yandex).
export type SeoVerification = { google?: string; bing?: string; yandex?: string };
export type SeoSettings = { indexingEnabled: boolean; verification: SeoVerification };

// One published local post as the sitemap needs it (permalink parts + lastmod).
export type SitemapEntry = {
  id: string;
  title: string | null;
  authorUsername: string;
  createdAt: string;
};

// Public instance identity (unauthenticated). Drives the app-name chrome and
// the first-run setup gate.
export type InstanceInfo = {
  name: string;
  domain: string;
  federationEnabled: boolean;
  setupComplete: boolean;
};

// Web-managed email settings. `EmailInput` is what the wizard/admin form sends
// (all fields optional; a blank secret means "leave unchanged"); the backend
// never echoes secrets back, so `EmailSettings` reports `has…` booleans instead.
export type EmailMode = "console" | "smtp" | "relay" | "direct";
export type EmailInput = {
  mode?: EmailMode;
  from?: string;
  smtp?: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    tls?: boolean;
  };
  relay?: {
    provider?: "resend";
    apiKey?: string;
  };
};
export type EmailSettings = {
  mode: EmailMode;
  from: string;
  smtp: {
    host?: string;
    port: number;
    username?: string;
    tls: boolean;
    hasPassword: boolean;
  };
  relay: { provider: "resend"; hasApiKey: boolean };
  dkim: { domain?: string; selector: string; hasKey: boolean };
};

// Path B DNS setup: the records to publish, and a live verification report.
export type DnsRecord = { host: string; type: "TXT"; value: string };
export type EmailDnsRecords = { spf: DnsRecord; dkim: DnsRecord; dmarc: DnsRecord };
export type DnsCheck = { host: string; ok: boolean; expected: string; found: string[] };
export type EmailDnsReport = {
  domain: string;
  mx: DnsCheck;
  spf: DnsCheck;
  dkim: DnsCheck;
  dmarc: DnsCheck;
  healthy: boolean;
};
export type DkimGenerateResult = { domain: string; selector: string; records: EmailDnsRecords };
export type EmailDnsResult = { records: EmailDnsRecords; report: EmailDnsReport };

// Admin view of the instance identity. `federationEnabled` is the desired value
// (applies on restart); `federationRunning` is what the process is actually
// running now; `sessionSecretManaged` says whether the secret can be rotated from
// the UI (false when pinned via env / secret file).
export type AdminInstance = {
  appName: string;
  appDomain: string;
  federationEnabled: boolean;
  federationRunning: boolean;
  sessionSecretManaged: boolean;
};

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