// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { sessions, users } from "@/db/schema.ts";

// Session DB access. The cookie carries the opaque session id.

export async function create(id: string, userId: string, expiresAt: Date) {
  await db.insert(sessions).values({ id, userId, expiresAt });
}

// Returns the owning user if the session exists and hasn't expired.
export async function findUser(id: string) {
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row?.user ?? null;
}

export async function remove(id: string) {
  await db.delete(sessions).where(eq(sessions.id, id));
}