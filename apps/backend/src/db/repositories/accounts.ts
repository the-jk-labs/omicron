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
