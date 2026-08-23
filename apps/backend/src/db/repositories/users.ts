// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, desc, eq, gte, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type ActorKeyPair, follows, type NewUser, sessions, users } from "@/db/schema.ts";

// All user DB access lives here. Services/routes never touch `db` directly.

export function findById(id: string) {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

// Find local accounts by handle or display name. Substring, case-insensitive —
// the cheapest match that feels right for a name lookup. `%` and `_` in the
// query are escaped so they match literally.
export function search(query: string, limit = 10) {
  const term = `%${query.replace(/[%_\\]/g, "\\$&")}%`;
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(and(sql`${users.suspendedAt} is null`, or(ilike(users.username, term), ilike(users.displayName, term))))
    .orderBy(users.displayName)
    .limit(limit);
}

// "Who to follow": local accounts ranked by follower count, newest as the
// tie-break. Excludes the viewer and anyone they already follow so suggestions
// stay actionable; for a signed-out viewer it's just the most-followed accounts.
export function suggested(viewerId: string | null, limit = 5) {
  const followerCount = sql<number>`count(${follows.followerId})::int`;
  // Suspended accounts are never suggested (they can't be followed meaningfully).
  const notSuspended = sql`${users.suspendedAt} is null`;
  const exclude = viewerId
    ? and(
        notSuspended,
        ne(users.id, viewerId),
        sql`${users.id} not in (
        select followee_id from follows
        where follower_id = ${viewerId} and followee_id is not null
      )`,
        // Never suggest someone the viewer has blocked, or who has blocked them.
        sql`${users.id} not in (
        select target_user_id from blocks
          where user_id = ${viewerId} and target_user_id is not null
        union
        select user_id from blocks where target_user_id = ${viewerId}
      )`,
      )
    : notSuspended;
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      followerCount,
    })
    .from(users)
    .leftJoin(follows, eq(follows.followeeId, users.id))
    .where(exclude)
    .groupBy(users.id)
    .orderBy(desc(followerCount), desc(users.createdAt))
    .limit(limit);
}

export function findByUsername(username: string) {
  return db.query.users.findFirst({ where: eq(users.username, username) });
}

export function findByEmail(email: string) {
  return db.query.users.findFirst({ where: eq(users.email, email) });
}

// The oldest local account. Used as the signing identity for outbound fetches
// (e.g. resolving remote actors on instances that require authorized fetch).
export function firstUser() {
  return db.query.users.findFirst({ orderBy: (u, { asc }) => asc(u.createdAt) });
}

export async function countUsers(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return row?.n ?? 0;
}

// Accounts that signed in at least once since `since` — NodeInfo's definition of
// an active user, which is a sign-in and not a post.
//
// Counted from sessions, one row per sign-in, so an account that signed in twice
// counts once. It errs low and never high: signing out deletes the row, so a
// visit that ended in a deliberate logout is not remembered. That is the right
// direction for a number published to fediverse directories — an undercount
// misrepresents nothing, and there is no other record of a sign-in to consult.
export async function countActiveSince(since: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${sessions.userId})::int` })
    .from(sessions)
    .where(gte(sessions.createdAt, since));
  return row?.n ?? 0;
}

export async function create(data: NewUser) {
  const [row] = await db.insert(users).values(data).returning();
  return row;
}

export async function setKeyPair(id: string, keyPair: ActorKeyPair) {
  await db.update(users).set({ actorKeyPair: keyPair }).where(eq(users.id, id));
}

// Partial update of mutable profile fields (display name, bio, avatar). Returns
// the updated row.
export async function update(id: string, data: Partial<NewUser>) {
  const [row] = await db.update(users).set(data).where(eq(users.id, id)).returning();
  return row;
}

// Permanently deletes a user. FK cascades remove their posts, follows, likes,
// comments, sessions, mutes and blocks.
export async function remove(id: string) {
  await db.delete(users).where(eq(users.id, id));
}

// Local accounts for the admin user table: newest first, optional handle /
// name substring filter. Returns full rows (the admin serializer picks fields).
export function listForAdmin(query = "", limit = 100) {
  const where = query.trim()
    ? (() => {
        const term = `%${query.replace(/[%_\\]/g, "\\$&")}%`;
        return or(ilike(users.username, term), ilike(users.displayName, term));
      })()
    : undefined;
  return db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(limit);
}

// Sets (a Date) or clears (null) the suspension marker. Returns the updated row.
export async function setSuspended(id: string, at: Date | null) {
  const [row] = await db.update(users).set({ suspendedAt: at }).where(eq(users.id, id)).returning();
  return row;
}

// Every account's id, email, and creation time — for the one-off email-lowercase
// backfill (scripts/backfill_email_lowercase.ts), which canonicalises rows that
// predate case-normalised registration. Oldest first, so a collision report is
// deterministic and names the original account first.
export function listEmails(): Promise<{ id: string; email: string; createdAt: Date }[]> {
  return db
    .select({ id: users.id, email: users.email, createdAt: users.createdAt })
    .from(users)
    .orderBy(users.createdAt);
}
