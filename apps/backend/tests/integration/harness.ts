// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Test harness for the integration suite: a real Postgres, real migrations,
// real SQL. Unit tests cover the pure functions; these cover the queries, which
// is where the visibility rules actually live and where unit tests cannot
// reach.
//
// Requires DATABASE_URL to point at a THROWAWAY database — `resetDb()` truncates
// every table it touches. See `deno task test:integration` and the `postgres`
// service in .github/workflows/ci.yml.
import { sql } from "@/db/client.ts";
import { db } from "@/db/client.ts";
import { runMigrations } from "@/db/migrate.ts";
import {
  follows,
  posts,
  postTags,
  readingListItems,
  readingLists,
  recommendations,
  tagFollows,
  tags,
  users,
} from "@/db/schema.ts";

let migrated = false;

// Applies migrations once per test process, then hands back a clean database.
// Every test starts from empty so ordering between tests can never matter.
export async function resetDb(): Promise<void> {
  if (!migrated) {
    await runMigrations();
    migrated = true;
  }
  // `restart identity cascade` reaches the tables that reference these; the
  // suite asserts on the listed ones only.
  await sql`
    truncate users, posts, tags, post_tags, tag_follows, follows,
             recommendations, reading_lists, reading_list_items
    restart identity cascade`;
}

// Closes the pool so `deno test` does not report a leaked resource. Call from
// the last step of each test file.
export async function closeDb(): Promise<void> {
  await sql.end();
}

// ── fixtures ────────────────────────────────────────────────────────────
// Deliberately terse: a visibility test should read as a sentence about who
// can see what, not as twenty lines of insert boilerplate.

export type UserOpts = { isPrivate?: boolean; suspended?: boolean };

export async function mkUser(username: string, opts: UserOpts = {}) {
  const [row] = await db.insert(users).values({
    username,
    email: `${username}@example.test`,
    passwordHash: "not-a-real-hash",
    displayName: username,
    isPrivate: opts.isPrivate ?? false,
    suspendedAt: opts.suspended ? new Date() : null,
  }).returning();
  return row;
}

export type PostOpts = { status?: "draft" | "published"; apType?: string; remote?: boolean };

export async function mkPost(authorId: string, slug: string, opts: PostOpts = {}) {
  const [row] = await db.insert(posts).values({
    authorId,
    title: slug,
    contentHtml: `<p>${slug}</p>`,
    slug,
    status: opts.status ?? "published",
    apType: opts.apType ?? "Article",
    remote: opts.remote ?? false,
  }).returning();
  return row;
}

export async function mkTag(slug: string) {
  const [row] = await db.insert(tags).values({ slug, name: slug }).returning();
  return row;
}

export async function tagPost(postId: string, tagId: string) {
  await db.insert(postTags).values({ postId, tagId });
}

export async function followTag(userId: string, tagId: string) {
  await db.insert(tagFollows).values({ userId, tagId });
}

// `approved: false` models a pending request to a private account — the case
// that must not leak anything.
export async function follow(followerId: string, followeeId: string, approved = true) {
  await db.insert(follows).values({ followerId, followeeId, approved });
}

export async function recommend(userId: string, postId: string) {
  await db.insert(recommendations).values({ userId, postId });
}

export async function mkList(userId: string, title: string, visibility: "public" | "private") {
  const [row] = await db.insert(readingLists).values({ userId, title, visibility }).returning();
  return row;
}

export async function addToList(listId: string, postId: string) {
  await db.insert(readingListItems).values({ listId, postId });
}

// ── assertion helper ────────────────────────────────────────────────────

// The suite asserts on "is this post in this result", never on ordering or
// counts, so a change to pagination or ranking cannot make a visibility test
// fail for an unrelated reason.
export function includesPost(rows: readonly { post: { id: string } }[], postId: string): boolean {
  return rows.some((r) => r.post.id === postId);
}
