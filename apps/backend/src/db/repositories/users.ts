// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type ActorKeyPair, type NewUser, users } from "@/db/schema.ts";

// All user DB access lives here. Services/routes never touch `db` directly.

export function findById(id: string) {
  return db.query.users.findFirst({ where: eq(users.id, id) });
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