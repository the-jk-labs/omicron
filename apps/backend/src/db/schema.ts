// SPDX-License-Identifier: AGPL-3.0-or-later
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Keyset pagination of the global/profile timelines.
  index("posts_created_at_idx").on(t.createdAt.desc(), t.id.desc()),
  index("posts_author_created_idx").on(t.authorId, t.createdAt.desc()),
  index("posts_remote_actor_created_idx").on(t.remoteActorId, t.createdAt.desc()),
  uniqueIndex("posts_ap_id_idx").on(t.apId),
]);

// ── follows ────────────────────────────────────────────────────────────
// Supports local↔local and remote↔local relationships. For inbound remote
// follows, `follower_id` is null and `remote_actor` holds the actor URI.
export const follows = pgTable("follows", {
  id: uuid("id").primaryKey().defaultRandom(),
  followerId: uuid("follower_id").references(() => users.id, { onDelete: "cascade" }),
  followeeId: uuid("followee_id").references(() => users.id, { onDelete: "cascade" }),
  remoteActor: text("remote_actor"),
  approved: boolean("approved").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Prevent duplicate local follow edges.
  uniqueIndex("follows_local_unique_idx")
    .on(t.followerId, t.followeeId)
    .where(sql`${t.followerId} is not null and ${t.followeeId} is not null`),
  index("follows_follower_idx").on(t.followerId),
  index("follows_followee_idx").on(t.followeeId),
]);

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
export type Like = typeof likes.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type CommentLike = typeof commentLikes.$inferSelect;
export type Session = typeof sessions.$inferSelect;
