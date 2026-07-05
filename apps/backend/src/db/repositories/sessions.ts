// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { sessions, users } from "@/db/schema.ts";
import { hashToken } from "@/lib/tokens.ts";

// Session DB access. The cookie carries the raw, high-entropy session token; we
// only ever persist its SHA-256 hash (as `sessions.id`), so a database read —
// leaked backup, replica, or SQLi elsewhere — yields no directly replayable
// tokens. The raw token is unrecoverable from what we store.

export async function create(rawToken: string, userId: string, expiresAt: Date) {
  await db.insert(sessions).values({ id: await hashToken(rawToken), userId, expiresAt });
}

// Returns the owning user if the session exists and hasn't expired.
export async function findUser(rawToken: string) {
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, await hashToken(rawToken)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row?.user ?? null;
}

export async function remove(rawToken: string) {
  await db.delete(sessions).where(eq(sessions.id, await hashToken(rawToken)));
}

// Drops every session for a user. Used after a password reset so any existing
// logins (including a possible attacker's) are forced to re-authenticate.
export async function removeAllForUser(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
