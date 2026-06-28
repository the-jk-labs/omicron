// SPDX-License-Identifier: AGPL-3.0-or-later
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Postgres full-text search vector. Drizzle has no native `tsvector` type, so we
// declare a minimal custom type purely so the column and its GIN index live in
// the schema (source of truth); the value is always database-generated.
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ── users ──────────────────────────────────────────────────────────────
// The first registered user becomes admin. `actor_key_pair` holds the
// ActivityPub RSA key pair (JWK) used by Fedify for HTTP signatures.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull().default(""),
  avatarUrl: text("avatar_url"),
  isAdmin: boolean("is_admin").notNull().default(false),
  actorKeyPair: jsonb("actor_key_pair").$type<ActorKeyPair | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("users_username_idx").on(t.username),
  uniqueIndex("users_email_idx").on(t.email),
  // Trigram indexes for people search (ILIKE '%term%' on handle / display name).
  index("users_username_trgm_idx").using("gin", sql`${t.username} gin_trgm_ops`),
  index("users_display_name_trgm_idx").using("gin", sql`${t.displayName} gin_trgm_ops`),
]);

export type ActorKeyPair = {
  privateKey: JsonWebKey;
  publicKey: JsonWebKey;
};

// ── remote actors ───────────────────────────────────────────────────────
// Cached fediverse Person objects, resolved on demand via WebFinger when a
// viewer opens /@user@host. Distinct from `users` (which are local accounts
// with credentials) so local identity stays free of federated junk.
export const remoteActors = pgTable("remote_actors", {
  id: uuid("id").primaryKey().defaultRandom(),
  apId: text("ap_id").notNull(),
  handle: text("handle").notNull(), // "user@host"
  username: text("username").notNull(), // preferredUsername
  host: text("host").notNull(),
  displayName: text("display_name").notNull().default(""),
  bio: text("bio").notNull().default(""),
  avatarUrl: text("avatar_url"),
  inboxUrl: text("inbox_url"),
  sharedInboxUrl: text("shared_inbox_url"),
  outboxUrl: text("outbox_url"),
  followersCount: integer("followers_count"),
  followingCount: integer("following_count"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("remote_actors_ap_id_idx").on(t.apId),
  uniqueIndex("remote_actors_handle_idx").on(t.handle),
  // Trigram indexes for people search (ILIKE '%term%' on handle / display name).
  index("remote_actors_handle_trgm_idx").using("gin", sql`${t.handle} gin_trgm_ops`),
  index("remote_actors_display_name_trgm_idx").using("gin", sql`${t.displayName} gin_trgm_ops`),
]);

// ── posts ──────────────────────────────────────────────────────────────
// `content_json` is the Tiptap document; `content_html` is the rendered HTML.
// Local posts carry `author_id`; remote posts (ingested via federation or
// fetched from a remote outbox) set `remote=true`, carry `ap_id`, and reference
// `remote_actor_id`. Exactly one of the two author columns is set (DB CHECK).
export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "cascade" }),
  remoteActorId: uuid("remote_actor_id").references(() => remoteActors.id, { onDelete: "cascade" }),
  title: text("title"),
  contentHtml: text("content_html").notNull(),
  contentJson: jsonb("content_json"),
  apId: text("ap_id"),
  // ActivityPub object type. Long-form blog content is "Article" (what Omicron,
  // Ghost, WriteFreely publish); microblog content is "Note" (Mastodon, etc.).
  // Drives the Global feed, which surfaces blogs only.
  apType: text("ap_type").notNull().default("Article"),
  remote: boolean("remote").notNull().default(false),
  // Publication state. `draft` posts are private to their author (never federated,
  // never surfaced in any public feed or profile) until published. Remote posts
  // are always `published`. Existing rows default to `published` on migration.
  status: text("status").notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Precomputed full-text search document: title (weight A) + tag-stripped body
  // (weight B). STORED + GIN-indexed, so search is an index lookup instead of a
  // per-row recompute. Always database-generated; excluded from feed selects
  // (see selectPosts) so timelines never ship the vector over the wire.
  searchVector: tsvector("search_vector").generatedAlwaysAs(
    sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', regexp_replace(content_html, '<[^>]+>', ' ', 'g')), 'B')`,
  ),
}, (t) => [
  // Keyset pagination of the global/profile timelines.
  index("posts_created_at_idx").on(t.createdAt.desc(), t.id.desc()),
  // Backs full-text search (websearch_to_tsquery `@@` + ts_rank).
  index("posts_search_idx").using("gin", t.searchVector),
  index("posts_author_created_idx").on(t.authorId, t.createdAt.desc()),
  // Drafts listing: an author's posts filtered by status, newest first.
  index("posts_author_status_created_idx").on(t.authorId, t.status, t.createdAt.desc()),
  index("posts_remote_actor_created_idx").on(t.remoteActorId, t.createdAt.desc()),
  uniqueIndex("posts_ap_id_idx").on(t.apId),
]);

// ── follows ────────────────────────────────────────────────────────────
// Three edge shapes share this table:
//   local → local:   follower_id + followee_id
//   remote → local:   followee_id + remote_actor (inbound; the remote follower URI)
//   local → remote:   follower_id + remote_followee_id (outbound; FK to remote_actors)
export const follows = pgTable("follows", {
  id: uuid("id").primaryKey().defaultRandom(),
  followerId: uuid("follower_id").references(() => users.id, { onDelete: "cascade" }),
  followeeId: uuid("followee_id").references(() => users.id, { onDelete: "cascade" }),
  remoteActor: text("remote_actor"),
  remoteFolloweeId: uuid("remote_followee_id").references(() => remoteActors.id, {
    onDelete: "cascade",
  }),
  approved: boolean("approved").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Prevent duplicate local follow edges.
  uniqueIndex("follows_local_unique_idx")
    .on(t.followerId, t.followeeId)
    .where(sql`${t.followerId} is not null and ${t.followeeId} is not null`),
  // Prevent duplicate outbound local→remote follow edges.
  uniqueIndex("follows_remote_followee_unique_idx")
    .on(t.followerId, t.remoteFolloweeId)
    .where(sql`${t.followerId} is not null and ${t.remoteFolloweeId} is not null`),
  index("follows_follower_idx").on(t.followerId),
  index("follows_followee_idx").on(t.followeeId),
]);

// ── mutes & blocks ───────────────────────────────────────────────────────
// Personal moderation edges. Both share the same shape as a follow edge: an
// actor (`user_id`, always a local user) targeting either a local user
// (`target_user_id`) or a cached remote actor (`target_remote_actor_id`).
//
// MUTE hides the target's posts from the muter's feeds and profile views. It is
// silent and one-directional.
//
// BLOCK is stronger and bidirectional locally: the blocked actor's posts are
// hidden from the blocker, and the blocker's posts are hidden from the blocked
// user. Blocks are NOT federated (no ActivityPub Block is sent) — they only
// affect what this instance shows.
function relationTable(name: string) {
  return pgTable(name, {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "cascade" }),
    targetRemoteActorId: uuid("target_remote_actor_id").references(() => remoteActors.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  }, (t) => [
    uniqueIndex(`${name}_local_unique_idx`)
      .on(t.userId, t.targetUserId)
      .where(sql`${t.targetUserId} is not null`),
    uniqueIndex(`${name}_remote_unique_idx`)
      .on(t.userId, t.targetRemoteActorId)
      .where(sql`${t.targetRemoteActorId} is not null`),
    index(`${name}_user_idx`).on(t.userId),
  ]);
}

export const mutes = relationTable("mutes");
export const blocks = relationTable("blocks");

// ── likes ──────────────────────────────────────────────────────────────
// One row per (post, user). The unique index makes liking idempotent and lets
// us derive counts + the viewer's own like state with a single grouped query.
export const likes = pgTable("likes", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("likes_post_user_idx").on(t.postId, t.userId),
  index("likes_post_idx").on(t.postId),
]);

// ── comments ───────────────────────────────────────────────────────────
// Single-level threaded comments. `content` is plain text — rendered escaped
// on the client, never as HTML. `parentId` is null for top-level comments and
// points at the top-level comment a reply belongs to (replies are not nested
// beyond one level — replying to a reply attaches to its top-level parent).
export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("comments_post_created_idx").on(t.postId, t.createdAt.desc(), t.id.desc()),
  index("comments_parent_idx").on(t.parentId, t.createdAt, t.id),
]);

// ── comment likes ──────────────────────────────────────────────────────
// One row per (comment, user); mirrors `likes` for posts. The unique index
// makes liking idempotent and powers batched count + viewer-state queries.
export const commentLikes = pgTable("comment_likes", {
  id: uuid("id").primaryKey().defaultRandom(),
  commentId: uuid("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("comment_likes_comment_user_idx").on(t.commentId, t.userId),
  index("comment_likes_comment_idx").on(t.commentId),
]);

// ── tags ───────────────────────────────────────────────────────────────
// Topical hashtags attached to posts. `slug` is the normalized key (lowercase,
// `#` stripped — see lib/tags.ts) used for uniqueness, URLs and matching;
// `name` keeps the display form as first written. Tags federate as ActivityPub
// Hashtag objects on a post's `tag` property.
export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tags_slug_idx").on(t.slug),
  // Trigram index for tag search (ILIKE '%term%' on the slug).
  index("tags_slug_trgm_idx").using("gin", sql`${t.slug} gin_trgm_ops`),
]);

// ── post ↔ tag join ──────────────────────────────────────────────────────
// One row per (post, tag). The unique index makes tagging idempotent; the
// tag-keyed index backs tag-feed lookups and the post-keyed index backs the
// batched tag load that enriches timelines.
export const postTags = pgTable("post_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("post_tags_unique_idx").on(t.postId, t.tagId),
  index("post_tags_tag_idx").on(t.tagId),
  index("post_tags_post_idx").on(t.postId),
]);

// ── user ↔ tag join (profile tags) ───────────────────────────────────────
// Topic tags a local user features on their profile (like Mastodon's featured
// hashtags). One row per (user, tag); federated out on the actor's `tag`.
export const userTags = pgTable("user_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("user_tags_unique_idx").on(t.userId, t.tagId),
  index("user_tags_user_idx").on(t.userId),
]);

// ── remote actor ↔ tag join (cached profile tags) ────────────────────────
// Profile tags parsed from a cached remote actor's Person `tag` Hashtags, so
// federated profiles display their tags too. Refreshed when the actor is
// re-cached (see federation/remote.ts).
export const remoteActorTags = pgTable("remote_actor_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  remoteActorId: uuid("remote_actor_id").notNull().references(() => remoteActors.id, {
    onDelete: "cascade",
  }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("remote_actor_tags_unique_idx").on(t.remoteActorId, t.tagId),
  index("remote_actor_tags_actor_idx").on(t.remoteActorId),
]);

// ── tag follows ──────────────────────────────────────────────────────────
// A local user following a tag. Posts carrying a followed tag surface in the
// follower's personalized ("For you") feed, alongside followed authors.
export const tagFollows = pgTable("tag_follows", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tag_follows_unique_idx").on(t.userId, t.tagId),
  index("tag_follows_user_idx").on(t.userId),
  index("tag_follows_tag_idx").on(t.tagId),
]);

// ── reading lists ────────────────────────────────────────────────────────
// User-curated collections of posts, like YouTube playlists. A user can own
// many lists; each is `public` (surfaced on their profile) or `private` (only
// the owner sees it). New lists default to public.
//
// Every user has exactly one special "Read later" list (`is_read_later`),
// created lazily on first use and defaulting to private — the analogue of
// YouTube's Watch Later. It cannot be deleted or renamed (enforced in the
// service); its visibility is the only editable field. A partial unique index
// guarantees at most one read-later list per user.
export const readingLists = pgTable("reading_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  visibility: text("visibility").notNull().default("public"), // "public" | "private"
  isReadLater: boolean("is_read_later").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // The owner's lists, newest first (lists management + profile tab).
  index("reading_lists_user_created_idx").on(t.userId, t.createdAt.desc()),
  // At most one read-later list per user.
  uniqueIndex("reading_lists_read_later_idx")
    .on(t.userId)
    .where(sql`${t.isReadLater}`),
]);

// ── reading list ↔ post join ──────────────────────────────────────────────
// One row per (list, post). The unique index makes adding idempotent; rows are
// ordered by `created_at` so the most recently added post shows first (like a
// playlist's "date added" order). Keyset-paginated on (created_at, id).
export const readingListItems = pgTable("reading_list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").notNull().references(() => readingLists.id, { onDelete: "cascade" }),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("reading_list_items_unique_idx").on(t.listId, t.postId),
  // A list's items, newest-added first.
  index("reading_list_items_list_created_idx").on(t.listId, t.createdAt.desc(), t.id.desc()),
  // "Which of my lists contain this post" lookup for the save menu.
  index("reading_list_items_post_idx").on(t.postId),
]);

// ── sessions ───────────────────────────────────────────────────────────
// Server-side sessions (cookie holds the opaque token = id). Keeps the app
// stateless; all session state lives in Postgres.
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("sessions_user_idx").on(t.userId),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type RemoteActor = typeof remoteActors.$inferSelect;
export type NewRemoteActor = typeof remoteActors.$inferInsert;
export type Follow = typeof follows.$inferSelect;
export type Mute = typeof mutes.$inferSelect;
export type Block = typeof blocks.$inferSelect;
export type Like = typeof likes.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type CommentLike = typeof commentLikes.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type PostTag = typeof postTags.$inferSelect;
export type TagFollow = typeof tagFollows.$inferSelect;
export type UserTag = typeof userTags.$inferSelect;
export type RemoteActorTag = typeof remoteActorTags.$inferSelect;
export type ReadingList = typeof readingLists.$inferSelect;
export type NewReadingList = typeof readingLists.$inferInsert;
export type ReadingListItem = typeof readingListItems.$inferSelect;
