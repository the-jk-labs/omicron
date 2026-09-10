// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { accounts } from "@/db/schema.ts";

// All Better Auth credential access lives here. Only the bcrypt hash is ever
// read — never written — and only to re-verify the acting admin's password
// before a destructive moderation action (see services/moderation.ts).
export async function findCredentialHashByUserId(userId: string): Promise<string | null> {
  const row = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")),
  });
  return row?.password ?? null;
}

// Keeps the credential account's identifier in sync when an admin changes the
// login email (users.email is the sign-in lookup, but accountId mirrors it).
export async function setCredentialAccountId(userId: string, email: string): Promise<void> {
  await db
    .update(accounts)
    .set({ accountId: email })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
}
