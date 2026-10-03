// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, gt, gte, like, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { verifications } from "@/db/schema.ts";

// "Undo this email change" tokens, kept in Better Auth's verifications table
// under their own prefix. Only the token's hash is stored.
const PREFIX = "email-change-undo:";

export type EmailChangeUndo = { userId: string; oldEmail: string; newEmail: string };

export async function create(tokenHash: string, undo: EmailChangeUndo, expiresAt: Date): Promise<void> {
  await db.insert(verifications).values({ identifier: PREFIX + tokenHash, value: JSON.stringify(undo), expiresAt });
}

/** The undo a live (unexpired) token stands for, and when it was issued. */
export async function find(tokenHash: string): Promise<(EmailChangeUndo & { createdAt: Date }) | null> {
  const [row] = await db
    .select()
    .from(verifications)
    .where(and(eq(verifications.identifier, PREFIX + tokenHash), gt(verifications.expiresAt, new Date())));
  return row ? { ...(JSON.parse(row.value) as EmailChangeUndo), createdAt: row.createdAt } : null;
}

/** Removes an account's undo tokens issued at or after `since`; earlier ones stay. */
export async function removeIssuedSince(userId: string, since: Date): Promise<void> {
  await db
    .delete(verifications)
    .where(
      and(
        like(verifications.identifier, `${PREFIX}%`),
        sql`${verifications.value}::jsonb ->> 'userId' = ${userId}`,
        gte(verifications.createdAt, since),
      ),
    );
}
