import { sql } from "drizzle-orm";
import {
  boolean,
  index,
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
  isAdmin: boolean("is_admin").notNull().default(false),
  actorKeyPair: jsonb("actor_key_pair").$type<ActorKeyPair | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // deno-lint-ignore no-explicit-any -- drizzle's index-callback type degrades to any in the full program graph; isolated it infers fine, and indexes are also in the migration SQL.
}, (t: any) => [
  uniqueIndex("users_username_idx").on(t.username),
  uniqueIndex("users_email_idx").on(t.email),
]);

export type ActorKeyPair = {
  privateKey: JsonWebKey;
  publicKey: JsonWebKey;
};

// ── posts ──────────────────────────────────────────────────────────────
// `content_json` is the Tiptap document; `content_html` is the rendered HTML.
// Remote posts (ingested via federation) set `remote=true` and carry `ap_id`.
export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  contentHtml: text("content_html").notNull(),
  contentJson: jsonb("content_json"),
  apId: text("ap_id"),
  remote: boolean("remote").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // deno-lint-ignore no-explicit-any -- see note on users table.
}, (t: any) => [
  // Keyset pagination of the global/profile timelines.
  index("posts_created_at_idx").on(t.createdAt.desc(), t.id.desc()),
  index("posts_author_created_idx").on(t.authorId, t.createdAt.desc()),
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
  // deno-lint-ignore no-explicit-any -- see note on users table.
}, (t: any) => [
  // Prevent duplicate local follow edges.
  uniqueIndex("follows_local_unique_idx")
    .on(t.followerId, t.followeeId)
    .where(sql`${t.followerId} is not null and ${t.followeeId} is not null`),
  index("follows_follower_idx").on(t.followerId),
  index("follows_followee_idx").on(t.followeeId),
]);

// ── sessions ───────────────────────────────────────────────────────────
// Server-side sessions (cookie holds the opaque token = id). Keeps the app
// stateless; all session state lives in Postgres.
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // deno-lint-ignore no-explicit-any -- see note on users table.
}, (t: any) => [
  index("sessions_user_idx").on(t.userId),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Follow = typeof follows.$inferSelect;
export type Session = typeof sessions.$inferSelect;
