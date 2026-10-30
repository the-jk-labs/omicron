// SPDX-License-Identifier: AGPL-3.0-or-later
// The API contract: every payload the backend sends, as it arrives over the wire (dates are ISO strings).
// The backend proves its serializers fit these (apps/backend/tests/contract), the web app uses the types, and the
// mobile app parses responses with them. A schema change is a contract change: update all three apps together.
import * as z from "zod/mini";

/** Bumped on every breaking change, so an app older than its instance can ask to be updated. */
export const API_VERSION = 1;

// ── people ──

/** An external link featured on a profile. `platform` keys the web's profile-link registry (icon + label). */
export const ProfileLink = z.object({ platform: z.string(), url: z.string(), label: z.string() });
export type ProfileLink = z.infer<typeof ProfileLink>;

/** A tag. `slug` is the normalized URL key, `name` the display form. */
export const Tag = z.object({ slug: z.string(), name: z.string() });
export type Tag = z.infer<typeof Tag>;

export const TagWithCount = z.extend(Tag, { postCount: z.number() });
export type TagWithCount = z.infer<typeof TagWithCount>;

/** A local account's public profile. */
export const User = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  bio: z.string(),
  /** Contact email shown on the profile; "" when unset. */
  publicEmail: z.string(),
  /** The About tab's Markdown source and its sanitized HTML; both "" when unset or locked. */
  customSection: z.string(),
  customSectionHtml: z.string(),
  avatarUrl: z.nullable(z.string()),
  isAdmin: z.boolean(),
  /** Reports queue and user/post operations, without instance-level access. Admins hold every moderator power. */
  isModerator: z.boolean(),
  /** Posts only for approved followers; following needs approval. */
  isPrivate: z.boolean(),
  createdAt: z.string(),
  /** When the profile last changed; versions its share card. */
  updatedAt: z.string(),
  tags: z.array(Tag),
  links: z.array(ProfileLink),
});
export type User = z.infer<typeof User>;

/** The signed-in account's own record (/me): the public profile plus its private fields. */
export const Me = z.extend(User, {
  email: z.string(),
  emailVerified: z.boolean(),
  showAiAssistedPosts: z.boolean(),
});
export type Me = z.infer<typeof Me>;

/**
 * A local or remote account in lists (followers, muted, blocked, search people, notification actors). `username` is
 * a `user@host` handle for a remote one, so `/@${username}` resolves either way.
 */
export const RelationActor = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.nullable(z.string()),
  remote: z.boolean(),
});
export type RelationActor = z.infer<typeof RelationActor>;

/** A post's or comment's author, local or remote; shaped like `RelationActor`. */
export const PostAuthor = RelationActor;
export type PostAuthor = RelationActor;

/** A "who to follow" suggestion, with a follower count for social proof. */
export const SuggestedUser = z.extend(RelationActor, { followerCount: z.number() });
export type SuggestedUser = z.infer<typeof SuggestedUser>;

/** The viewer's follow relationship to a profile. */
export const FollowState = z.enum(["none", "requested", "following"]);
export type FollowState = z.infer<typeof FollowState>;

const Counts = z.object({ followers: z.number(), following: z.number() });

/** A local profile and the viewer's relationship to it. */
export const Profile = z.object({
  user: User,
  counts: Counts,
  followState: FollowState,
  isFollowing: z.boolean(),
  isMuted: z.boolean(),
  isBlocked: z.boolean(),
  /** A private profile the viewer can't see into: header and counts only, no posts or follower lists. */
  locked: z.boolean(),
});
export type Profile = z.infer<typeof Profile>;

/** A remote actor's profile, shaped like `Profile` so one layout renders either. */
export const RemoteProfile = z.object({
  user: z.object({
    id: z.string(),
    /** `user@host` */
    username: z.string(),
    displayName: z.string(),
    bio: z.string(),
    avatarUrl: z.nullable(z.string()),
    host: z.string(),
    apId: z.string(),
    remote: z.literal(true),
    tags: z.array(Tag),
  }),
  counts: Counts,
  isFollowing: z.boolean(),
  isMuted: z.boolean(),
  isBlocked: z.boolean(),
});
export type RemoteProfile = z.infer<typeof RemoteProfile>;

/** A pending follow request. */
export const FollowRequest = z.object({ requestId: z.string(), actor: RelationActor, createdAt: z.string() });
export type FollowRequest = z.infer<typeof FollowRequest>;

// ── posts ──

/** Who to credit for a banner photo. `license` is absent for Unsplash, which has its own terms. */
export const CoverCredit = z.object({
  name: z.string(),
  nameUrl: z.string(),
  source: z.string(),
  sourceUrl: z.string(),
  license: z.optional(z.string()),
  licenseUrl: z.optional(z.string()),
});
export type CoverCredit = z.infer<typeof CoverCredit>;

/** A post the author owns: a draft, scheduled (a draft with a publish time), or published. */
export const OwnPostStatus = z.enum(["draft", "scheduled", "published"]);
export type OwnPostStatus = z.infer<typeof OwnPostStatus>;

/** Who recommended a feed post, for its "X recommended this" banner. Shaped like `PostAuthor`. */
export const RecommendedBy = z.extend(RelationActor, { recommendedAt: z.string() });
export type RecommendedBy = z.infer<typeof RecommendedBy>;

export const Post = z.object({
  id: z.string(),
  title: z.nullable(z.string()),
  /** The readable half of `/@author/<slug>`; null on remote and untitled posts, addressed by short id instead. */
  slug: z.nullable(z.string()),
  contentHtml: z.string(),
  contentJson: z.unknown(),
  remote: z.boolean(),
  /** The author's disclosure that AI helped write it. */
  aiAssisted: z.boolean(),
  status: OwnPostStatus,
  /** When a scheduled post goes out; null on every other post. Only ever reaches its author. */
  publishAt: z.nullable(z.string()),
  /** BCP-47 primary subtag ("en", "tr"), or null when unspecified. */
  language: z.nullable(z.string()),
  /** A preview set by an ingesting CMS; null for posts written in the editor. */
  summary: z.nullable(z.string()),
  /** The banner the author chose, or null. The editor reads this; readers show `bannerUrl`. */
  coverUrl: z.nullable(z.string()),
  /** The banner to show: `coverUrl`, or the first image in the body. */
  bannerUrl: z.nullable(z.string()),
  coverCredit: z.nullable(CoverCredit),
  createdAt: z.string(),
  /** When the content last changed (not engagement); equals `createdAt` for an unedited post. */
  updatedAt: z.string(),
  author: PostAuthor,
  tags: z.array(Tag),
  likeCount: z.number(),
  liked: z.boolean(),
  commentCount: z.number(),
  /** "Repost", federated as an ActivityPub Announce; `recommended` is the viewer's own. */
  recommendCount: z.number(),
  recommended: z.boolean(),
  /** The viewer has it in one of their reading lists. */
  saved: z.boolean(),
  /** Set only on a "For you" item that arrived through a recommendation; null everywhere else. */
  recommendedBy: z.nullable(RecommendedBy),
});
export type Post = z.infer<typeof Post>;

/** A post as creating or editing it answers: its own fields, without author or engagement. */
export const BarePost = z.object({
  id: z.string(),
  title: z.nullable(z.string()),
  slug: z.nullable(z.string()),
  contentHtml: z.string(),
  status: OwnPostStatus,
  aiAssisted: z.boolean(),
  publishAt: z.nullable(z.string()),
  language: z.nullable(z.string()),
  summary: z.nullable(z.string()),
  coverUrl: z.nullable(z.string()),
  bannerUrl: z.nullable(z.string()),
  coverCredit: z.nullable(CoverCredit),
  createdAt: z.string(),
});
export type BarePost = z.infer<typeof BarePost>;

export const Comment = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.string(),
  author: PostAuthor,
  parentId: z.nullable(z.string()),
  likeCount: z.number(),
  liked: z.boolean(),
  get replies() {
    return z.array(Comment);
  },
});
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

/** A cursor page. `nextCursor` is null on the last page. */
export function page<T extends z.ZodMiniType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.nullable(z.string()) });
}
export type Page<T> = { items: T[]; nextCursor: string | null };

export const LikeState = z.object({ likeCount: z.number(), liked: z.boolean() });
export type LikeState = z.infer<typeof LikeState>;
export const RecommendState = z.object({ recommendCount: z.number(), recommended: z.boolean() });
export type RecommendState = z.infer<typeof RecommendState>;

/** A tag page's header. */
export const TagDetail = z.object({
  tag: Tag,
  postCount: z.number(),
  followerCount: z.number(),
  isFollowing: z.boolean(),
});
export type TagDetail = z.infer<typeof TagDetail>;

/** Site search: matching articles, people and tags. */
export const SearchResults = z.object({
  posts: z.array(Post),
  people: z.array(RelationActor),
  tags: z.array(TagWithCount),
});
export type SearchResults = z.infer<typeof SearchResults>;

// ── reading lists ──

export const ReadingList = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  visibility: z.enum(["public", "private"]),
  /** The per-user "Read later" list. */
  isReadLater: z.boolean(),
  itemCount: z.number(),
  createdAt: z.string(),
});
export type ReadingList = z.infer<typeof ReadingList>;

/** A list in the save menu, saying whether the post in question is in it. */
export const ReadingListForPost = z.extend(ReadingList, { contains: z.boolean() });
export type ReadingListForPost = z.infer<typeof ReadingListForPost>;

export const ReadingListDetail = z.object({
  list: ReadingList,
  isOwner: z.boolean(),
  owner: z.object({ username: z.string(), displayName: z.string() }),
});
export type ReadingListDetail = z.infer<typeof ReadingListDetail>;

// ── notifications ──

export const NotificationType = z.enum([
  "follow",
  "follow_request",
  "follow_accepted",
  "like",
  "comment",
  "reply",
  "comment_like",
  "recommend",
  /** The reader's own scheduled post went live: the only type with no actor. */
  "post_published",
]);
export type NotificationType = z.infer<typeof NotificationType>;

export const Notification = z.object({
  id: z.string(),
  type: NotificationType,
  /** Null only when the actor was deleted, or for `post_published`. */
  actor: z.nullable(RelationActor),
  postId: z.nullable(z.string()),
  postTitle: z.nullable(z.string()),
  commentSnippet: z.nullable(z.string()),
  read: z.boolean(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof Notification>;

// ── the writer's own ──

/** A content-webhook token as Settings lists it; the secret itself is shown once, at mint time. */
export const WebhookToken = z.object({
  id: z.string(),
  label: z.string(),
  lastUsedAt: z.nullable(z.string()),
  createdAt: z.string(),
});
export type WebhookToken = z.infer<typeof WebhookToken>;

/** An OAuth application the account has authorized. */
export const ConnectedApp = z.object({
  id: z.string(),
  name: z.string(),
  callbackOrigin: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  scope: z.string(),
  permissions: z.array(z.object({ scope: z.string(), description: z.string() })),
});
export type ConnectedApp = z.infer<typeof ConnectedApp>;

/** Per-post stats. `views` counts one reader a day, and is 0 when the instance doesn't count views. */
export const PostStat = z.object({
  postId: z.string(),
  title: z.nullable(z.string()),
  slug: z.nullable(z.string()),
  createdAt: z.string(),
  views: z.number(),
  likes: z.number(),
  comments: z.number(),
});
export type PostStat = z.infer<typeof PostStat>;

export const DayTotals = z.object({ day: z.string(), views: z.number() });
export type DayTotals = z.infer<typeof DayTotals>;

/** The writer's analytics. Without `onInstanceViews` the views panels hide (see ANALYTICS.md). */
export const DashboardSummary = z.object({
  onInstanceViews: z.boolean(),
  /** All-time. */
  totals: z.object({ views: z.number(), likes: z.number(), comments: z.number(), followers: z.number() }),
  /** Within the `?days=` window: views, and new likes, comments and followers. */
  period: z.object({
    days: z.number(),
    views: z.number(),
    likes: z.number(),
    comments: z.number(),
    followers: z.number(),
  }),
  series: z.array(DayTotals),
  posts: z.array(PostStat),
});
export type DashboardSummary = z.infer<typeof DashboardSummary>;

export const OwnPostCounts = z.object({ draft: z.number(), scheduled: z.number(), published: z.number() });
export type OwnPostCounts = z.infer<typeof OwnPostCounts>;

// ── photos ──

/** Openverse needs no credentials; Unsplash appears once an operator configures a key. */
export const PhotoProvider = z.enum(["openverse", "unsplash"]);
export type PhotoProvider = z.infer<typeof PhotoProvider>;

export const StockPhoto = z.object({
  id: z.string(),
  alt: z.string(),
  thumbUrl: z.string(),
  bannerUrl: z.string(),
  credit: CoverCredit,
  /** Passed back to /photos/use for providers that count downloads; null when the provider asks nothing. */
  useToken: z.nullable(z.string()),
});
export type StockPhoto = z.infer<typeof StockPhoto>;

// ── the instance ──

/** Public instance identity: app chrome, the first-run gate and the instance's own pages. */
export const InstanceInfo = z.object({
  name: z.string(),
  domain: z.string(),
  federationEnabled: z.boolean(),
  setupComplete: z.boolean(),
  /** False while mail only goes to the backend log; "check your inbox" pages must say so. */
  emailEnabled: z.boolean(),
  /** Sign-in waits for the confirmation link. */
  emailVerificationRequired: z.boolean(),
  /** The signed-out visitor card; null means the built-in default. */
  bannerText: z.nullable(z.string()),
  bannerImageUrl: z.nullable(z.string()),
  aboutHtml: z.nullable(z.string()),
  rulesHtml: z.nullable(z.string()),
  privacyPolicyHtml: z.nullable(z.string()),
  contactEmail: z.nullable(z.string()),
  contactUrl: z.nullable(z.string()),
  abuseEmail: z.nullable(z.string()),
  statusUrl: z.nullable(z.string()),
  /** The contract version this instance speaks (`API_VERSION`). */
  apiVersion: z.number(),
});
export type InstanceInfo = z.infer<typeof InstanceInfo>;

export const InstanceSettings = z.object({ onInstanceViews: z.boolean() });
export type InstanceSettings = z.infer<typeof InstanceSettings>;
export const UmamiSettings = z.object({ enabled: z.boolean(), websiteId: z.string() });
export type UmamiSettings = z.infer<typeof UmamiSettings>;

/** The AI-scraper wall (Anubis); `anubisManaged` is false when this deployment can't toggle it. */
export const SecuritySettings = z.object({ anubisProtection: z.boolean(), anubisManaged: z.boolean() });
export type SecuritySettings = z.infer<typeof SecuritySettings>;

const RuleAction = z.enum(["allow", "block"]);

export const AccessRule = z.object({
  id: z.string(),
  network: z.string(),
  action: RuleAction,
  reason: z.string(),
  enabled: z.boolean(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type AccessRule = z.infer<typeof AccessRule>;

export const AccessRuleInput = z.object({
  network: z.string(),
  action: RuleAction,
  reason: z.string(),
  expiresInHours: z.union([z.literal(1), z.literal(24), z.literal(168), z.literal(720)]),
});
export type AccessRuleInput = z.infer<typeof AccessRuleInput>;

export const AccessRuleTest = z.object({
  action: z.enum(["allow", "block", "default", "exempt"]),
  ruleId: z.nullable(z.string()),
  message: z.string(),
});
export type AccessRuleTest = z.infer<typeof AccessRuleTest>;

/** Per-engine site-verification tokens (the meta tag's `content` only). */
export const SeoVerification = z.object({
  google: z.optional(z.string()),
  bing: z.optional(z.string()),
  yandex: z.optional(z.string()),
});
export type SeoVerification = z.infer<typeof SeoVerification>;

export const SeoSettings = z.object({
  indexingEnabled: z.boolean(),
  verification: SeoVerification,
  /** Push new and edited post URLs to IndexNow engines; off unless an admin turns it on. */
  indexNowEnabled: z.boolean(),
});
export type SeoSettings = z.infer<typeof SeoSettings>;

/** The admin view, which also carries the IndexNow key (null until one is minted). */
export const AdminSeoSettings = z.extend(SeoSettings, { indexNowKey: z.nullable(z.string()) });
export type AdminSeoSettings = z.infer<typeof AdminSeoSettings>;

/** A sitemap's posts, in parts: permalinks are built on the web side. */
export const SitemapEntry = z.object({
  id: z.string(),
  title: z.nullable(z.string()),
  slug: z.nullable(z.string()),
  authorUsername: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SitemapEntry = z.infer<typeof SitemapEntry>;
export const SitemapProfile = z.object({ username: z.string(), lastPostAt: z.string() });
export type SitemapProfile = z.infer<typeof SitemapProfile>;
export const SitemapTag = z.object({ slug: z.string(), lastPostAt: z.string() });
export type SitemapTag = z.infer<typeof SitemapTag>;
export const SitemapList = z.object({ id: z.string(), title: z.string(), lastItemAt: z.string() });
export type SitemapList = z.infer<typeof SitemapList>;

/** The index pages; posts are paged separately, being the only kind that can pass the sitemap file limit. */
export const SitemapContents = z.object({
  profiles: z.array(SitemapProfile),
  tags: z.array(SitemapTag),
  lists: z.array(SitemapList),
  postCount: z.number(),
  postsPerPage: z.number(),
});
export type SitemapContents = z.infer<typeof SitemapContents>;

// ── email (admin) ──

export const EmailMode = z.enum(["console", "smtp", "relay", "direct"]);
export type EmailMode = z.infer<typeof EmailMode>;

/** What the setup wizard and admin form send: every field optional, and a blank secret leaves it unchanged. */
export const EmailInput = z.object({
  mode: z.optional(EmailMode),
  from: z.optional(z.string()),
  smtp: z.optional(
    z.object({
      host: z.optional(z.string()),
      port: z.optional(z.number()),
      username: z.optional(z.string()),
      password: z.optional(z.string()),
      tls: z.optional(z.boolean()),
    }),
  ),
  relay: z.optional(z.object({ provider: z.optional(z.literal("resend")), apiKey: z.optional(z.string()) })),
});
export type EmailInput = z.infer<typeof EmailInput>;

/** Delivery settings as read back: secrets never leave the server, only whether they're set. */
export const EmailSettings = z.object({
  mode: EmailMode,
  from: z.string(),
  smtp: z.object({
    host: z.optional(z.string()),
    port: z.number(),
    username: z.optional(z.string()),
    tls: z.boolean(),
    hasPassword: z.boolean(),
  }),
  relay: z.object({ provider: z.literal("resend"), hasApiKey: z.boolean() }),
  dkim: z.object({ domain: z.optional(z.string()), selector: z.string(), hasKey: z.boolean() }),
});
export type EmailSettings = z.infer<typeof EmailSettings>;

export const DnsRecord = z.object({ host: z.string(), type: z.literal("TXT"), value: z.string() });
export type DnsRecord = z.infer<typeof DnsRecord>;
export const EmailDnsRecords = z.object({ spf: DnsRecord, dkim: DnsRecord, dmarc: DnsRecord });
export type EmailDnsRecords = z.infer<typeof EmailDnsRecords>;
export const DnsCheck = z.object({
  host: z.string(),
  ok: z.boolean(),
  expected: z.string(),
  found: z.array(z.string()),
});
export type DnsCheck = z.infer<typeof DnsCheck>;
export const EmailDnsReport = z.object({
  domain: z.string(),
  mx: DnsCheck,
  spf: DnsCheck,
  dkim: DnsCheck,
  dmarc: DnsCheck,
  healthy: z.boolean(),
});
export type EmailDnsReport = z.infer<typeof EmailDnsReport>;
export const DkimGenerateResult = z.object({ domain: z.string(), selector: z.string(), records: EmailDnsRecords });
export type DkimGenerateResult = z.infer<typeof DkimGenerateResult>;
export const EmailDnsResult = z.object({ records: EmailDnsRecords, report: EmailDnsReport });
export type EmailDnsResult = z.infer<typeof EmailDnsResult>;

/**
 * The admin view of the instance. `federationEnabled` is the setting (applied on restart), `federationRunning`
 * what runs now; `sessionSecretManaged` is false when the secret is pinned by env or file.
 */
export const AdminInstance = z.object({
  appName: z.string(),
  appDomain: z.string(),
  federationEnabled: z.boolean(),
  federationRunning: z.boolean(),
  sessionSecretManaged: z.boolean(),
  bannerText: z.nullable(z.string()),
  bannerImageUrl: z.nullable(z.string()),
  about: z.string(),
  rules: z.string(),
  privacyPolicy: z.string(),
  contactEmail: z.string(),
  contactUrl: z.string(),
  abuseEmail: z.string(),
  statusUrl: z.string(),
});
export type AdminInstance = z.infer<typeof AdminInstance>;

// ── moderation ──

/** A row of the admin user table, with the private fields moderation needs. */
export const AdminUser = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  bio: z.string(),
  publicEmail: z.string(),
  customSection: z.string(),
  avatarUrl: z.nullable(z.string()),
  isAdmin: z.boolean(),
  isModerator: z.boolean(),
  email: z.string(),
  emailVerified: z.boolean(),
  suspended: z.boolean(),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof AdminUser>;

/** A defederated domain; blocking one also blocks its subdomains. */
export const BlockedDomain = z.object({ domain: z.string(), reason: z.string(), createdAt: z.string() });
export type BlockedDomain = z.infer<typeof BlockedDomain>;

/** A deleted account awaiting restore, until `expiresAt` erases it. */
export const DeletedUser = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.nullable(z.string()),
  email: z.string(),
  postCount: z.number(),
  /** The deleting moderator's username, when known. */
  deletedBy: z.nullable(z.string()),
  deletedAt: z.string(),
  expiresAt: z.string(),
});
export type DeletedUser = z.infer<typeof DeletedUser>;

/** A report in the moderation queue, with light subject and reporter details. */
export const Report = z.object({
  id: z.string(),
  subjectType: z.enum(["post", "user"]),
  reason: z.string(),
  status: z.enum(["open", "resolved"]),
  resolution: z.string(),
  createdAt: z.string(),
  resolvedAt: z.nullable(z.string()),
  reporter: z.nullable(z.object({ username: z.string(), displayName: z.string() })),
  postId: z.nullable(z.string()),
  postTitle: z.nullable(z.string()),
  postAuthor: z.nullable(z.string()),
  userId: z.nullable(z.string()),
  userUsername: z.nullable(z.string()),
  userDisplayName: z.nullable(z.string()),
});
export type Report = z.infer<typeof Report>;

/** One account in full for moderators: counts, latest posts, profile tags and links, and reports. */
export const AdminUserDetail = z.object({
  user: AdminUser,
  postCounts: OwnPostCounts,
  followCounts: Counts,
  recentPosts: z.array(
    z.object({
      id: z.string(),
      title: z.nullable(z.string()),
      slug: z.nullable(z.string()),
      status: OwnPostStatus,
      createdAt: z.string(),
    }),
  ),
  reports: z.array(Report),
  tags: z.array(Tag),
  links: z.array(ProfileLink),
});
export type AdminUserDetail = z.infer<typeof AdminUserDetail>;

/** A page of the admin account tables, with totals before and after the filter. */
function accountPage<T extends z.ZodMiniType>(item: T) {
  return z.object({
    users: z.array(item),
    nextCursor: z.nullable(z.string()),
    total: z.number(),
    filteredTotal: z.number(),
  });
}

// ── responses ──
// Each endpoint's whole body, so a client parses exactly what arrives.

export const Ok = z.object({ ok: z.literal(true) });
export const PostPage = page(Post);
export const CommentPage = page(Comment);
export const NotificationPage = page(Notification);
export const PostResponse = z.object({ post: Post });
export const RandomPostResponse = z.object({ post: z.nullable(Post) });
export const PostItems = z.object({ items: z.array(Post) });
export const SavedPostResponse = z.object({ post: BarePost });
export const CommentResponse = z.object({ comment: Comment });
export const EditedCommentResponse = z.object({ comment: z.object({ id: z.string(), content: z.string() }) });
export const MeResponse = z.object({ user: z.nullable(Me) });
export const UserResponse = z.object({ user: User });
/** Changing a preference answers with the profile and the preference, plus the private fields when the scope allows. */
export const PreferencesResponse = z.object({ user: z.extend(User, { showAiAssistedPosts: z.boolean() }) });
export const RelationItems = z.object({ items: z.array(RelationActor) });
export const SuggestedUsers = z.object({ items: z.array(SuggestedUser) });
export const FollowRequests = z.object({ items: z.array(FollowRequest) });
export const FollowResponse = z.object({ ok: z.literal(true), state: z.enum(["requested", "following"]) });
export const TagList = z.object({ tags: z.array(TagWithCount) });
export const ReadingLists = z.object({ lists: z.array(ReadingList) });
export const ReadingListsForPost = z.object({ lists: z.array(ReadingListForPost) });
export const ReadingListResponse = z.object({ list: ReadingList });
export const UnreadCount = z.object({ count: z.number() });
export const WebhookTokens = z.object({ tokens: z.array(WebhookToken) });
export const MintedWebhookToken = z.object({ token: z.string(), tokenInfo: WebhookToken });
export const ConnectedApps = z.object({ connections: z.array(ConnectedApp) });
export const UploadedImage = z.object({ url: z.string() });
export const CustomSectionPreview = z.object({ html: z.string() });
export const PhotoProviders = z.object({ providers: z.array(PhotoProvider) });
export const StockPhotos = z.object({ items: z.array(StockPhoto) });
export const AdminUsers = accountPage(AdminUser);
export const DeletedUsers = accountPage(DeletedUser);
export const AdminUserResponse = z.object({ user: AdminUser });
export const AdminReports = z.object({ reports: z.array(Report), openCount: z.number() });
export const AiAssistedState = z.object({ aiAssisted: z.boolean() });
export const BlockedDomains = z.object({ domains: z.array(BlockedDomain) });
export const BlockedDomainResult = z.object({ domain: z.string(), purged: z.number() });
export const TagAliases = z.object({
  aliases: z.array(z.object({ aliasSlug: z.string(), slug: z.string(), name: z.string() })),
});
export const AccessRules = z.object({ rules: z.array(AccessRule) });
export const SiteStatistics = z.object({ websiteId: z.nullable(z.string()) });
export const UnsplashState = z.object({ configured: z.boolean() });
export const IndexNowCheck = z.object({ ok: z.boolean() });
export const Port25Check = z.object({ ok: z.boolean(), detail: z.string() });
export const EmailChangeUndone = z.object({ email: z.string() });
export const SitemapPosts = z.array(SitemapEntry);
