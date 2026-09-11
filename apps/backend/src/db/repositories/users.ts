// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, desc, eq, gte, ilike, lt, ne, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client.ts";
import { type ActorKeyPair, follows, type NewUser, sessions, users } from "@/db/schema.ts";
import type { Cursor } from "@/lib/pagination.ts";

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
    .where(
      and(
        sql`${users.suspendedAt} is null`,
        sql`${users.deletedAt} is null`,
        or(ilike(users.username, term), ilike(users.displayName, term)),
      ),
    )
    .orderBy(users.displayName)
    .limit(limit);
}

// "Who to follow": local accounts ranked by follower count, newest as the
// tie-break. Excludes the viewer and anyone they already follow so suggestions
// stay actionable; for a signed-out viewer it's just the most-followed accounts.
export function suggested(viewerId: string | null, limit = 5) {
  const followerCount = sql<number>`count(${follows.followerId})::int`;
  // Suspended and deleted accounts are never suggested (they can't be followed meaningfully).
  const notSuspended = sql`${users.suspendedAt} is null and ${users.deletedAt} is null`;
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

// The oldest live local account. Used as the signing identity for outbound fetches
// (e.g. resolving remote actors on instances that require authorized fetch).
export function firstUser() {
  return db.query.users.findFirst({
    where: sql`${users.deletedAt} is null`,
    orderBy: (u, { asc }) => asc(u.createdAt),
  });
}

export async function countUsers(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.deletedAt} is null`);
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
// the updated row. Stamps `updatedAt`, which versions the profile's share card
// (see services/profileCard.ts) — any profile change is a new card URL.
export async function update(id: string, data: Partial<NewUser>) {
  const [row] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return row;
}

// Filter dimensions for the admin user table. Each is tri-state: true shows
// only matching accounts, false only the rest, undefined leaves it unfiltered.
export type AdminUserFilter = {
  suspended?: boolean;
  admin?: boolean;
  verified?: boolean;
};

// Live local accounts for the admin user table: newest first, optional handle /
// name / email substring filter plus the triage filters. Deleted accounts are
// excluded — they have their own restore list (listDeleted). Keyset-paginated
// over (created_at, id): pass the previous page's `nextCursor` to continue.
// Fetches limit + 1 rows so the service can derive the next cursor without a
// second query. Returns full rows (the admin serializer picks fields).
export const ADMIN_USERS_PAGE_SIZE = 50;
export const ADMIN_USERS_MAX_PAGE_SIZE = 100;

function adminConditions(query = "", filter: AdminUserFilter = {}): (SQL | undefined)[] {
  const conditions: (SQL | undefined)[] = [sql`${users.deletedAt} is null`];
  if (query.trim()) {
    const term = `%${query.replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(or(ilike(users.username, term), ilike(users.displayName, term), ilike(users.email, term)));
  }
  if (filter.suspended !== undefined) {
    conditions.push(filter.suspended ? sql`${users.suspendedAt} is not null` : sql`${users.suspendedAt} is null`);
  }
  if (filter.admin !== undefined) conditions.push(eq(users.isAdmin, filter.admin));
  if (filter.verified !== undefined) conditions.push(eq(users.emailVerified, filter.verified));
  return conditions;
}

// Rows strictly older than the cursor in (created_at, id) order.
function adminBeforeCursor(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const ts = new Date(cursor.createdAt);
  return or(lt(users.createdAt, ts), and(eq(users.createdAt, ts), lt(users.id, cursor.id)));
}

export function listForAdmin(
  query = "",
  filter: AdminUserFilter = {},
  cursor: Cursor | null = null,
  limit = ADMIN_USERS_PAGE_SIZE,
) {
  const capped = Math.min(Math.max(Math.trunc(limit) || ADMIN_USERS_PAGE_SIZE, 1), ADMIN_USERS_MAX_PAGE_SIZE);
  // `and()` drops undefined operands, so unset dimensions stay unfiltered.
  return db
    .select()
    .from(users)
    .where(and(...adminConditions(query, filter), adminBeforeCursor(cursor)))
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(capped + 1);
}

// Filtered live-account count for the admin table header ("N of M accounts"
// while searching). Uses the same conditions as listForAdmin, minus the cursor.
export async function countFiltered(query = "", filter: AdminUserFilter = {}): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(...adminConditions(query, filter)));
  return row?.n ?? 0;
}

// Recently deleted accounts, newest deletion first, with the deleting
// moderator's username (null when unknown). The admin restore list — the
// "backup" a deletion keeps for the retention window.
export function listDeleted(limit = 100) {
  const deleter = alias(users, "deleter");
  return db
    .select({ user: users, deletedByUsername: deleter.username })
    .from(users)
    .leftJoin(deleter, eq(users.deletedBy, deleter.id))
    .where(sql`${users.deletedAt} is not null`)
    .orderBy(desc(users.deletedAt))
    .limit(limit);
}

// Ids of deleted accounts whose retention window ended before `cutoff` — the
// expiry sweeper's claim list (see services/deletedUsers.ts).
export function listExpiredDeletedIds(cutoff: Date, limit = 100) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`${users.deletedAt} is not null`, lt(users.deletedAt, cutoff)))
    .orderBy(users.deletedAt)
    .limit(limit);
}

// Marks (a Date + moderator) or unmarks (null) an account as deleted. Returns
// the updated row.
export async function setDeleted(id: string, at: Date | null, by: string | null) {
  const [row] = await db.update(users).set({ deletedAt: at, deletedBy: by }).where(eq(users.id, id)).returning();
  return row;
}

// Irreversibly removes the row. Cascades wipe the account's posts, follows and
// the rest (see db/schema.ts); the sweeper and the admin "delete forever"
// action are the only callers.
export async function hardRemove(id: string) {
  await db.delete(users).where(eq(users.id, id));
}

// Sets (a Date) or clears (null) the suspension marker. Returns the updated row.
export async function setSuspended(id: string, at: Date | null) {
  const [row] = await db.update(users).set({ suspendedAt: at }).where(eq(users.id, id)).returning();
  return row;
}

// Grants or revokes the admin role. Returns the updated row.
export async function setAdmin(id: string, isAdmin: boolean) {
  const [row] = await db.update(users).set({ isAdmin }).where(eq(users.id, id)).returning();
  return row;
}

// How many live admins exist — the demote guardrail (the last admin cannot be
// removed). Deleted accounts cannot be admins (deletion refuses them), but the
// filter keeps the count honest regardless.
export async function countAdmins(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.isAdmin, true), sql`${users.deletedAt} is null`));
  return row?.n ?? 0;
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
