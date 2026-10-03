// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type Passkey, passkeys } from "@/db/schema.ts";

// Passkey DB access outside Better Auth, which owns the per-user CRUD.

// Removes every passkey on the instance; returns how many were removed.
export async function deleteAll(): Promise<number> {
  const rows = await db.delete(passkeys).returning({ id: passkeys.id });
  return rows.length;
}

export async function findById(id: string): Promise<Passkey | undefined> {
  const [row] = await db.select().from(passkeys).where(eq(passkeys.id, id));
  return row;
}

export async function deleteAllForUser(userId: string): Promise<void> {
  await db.delete(passkeys).where(eq(passkeys.userId, userId));
}
