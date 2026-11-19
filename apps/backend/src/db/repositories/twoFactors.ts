// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { twoFactors, users } from "@/db/schema.ts";

// Two-factor DB access outside Better Auth, which owns setup and verification.

// Turns two-factor off for an account and forgets its authenticator secret and
// backup codes, so its owner signs in with the password alone and can set it up again.
export async function resetForUser(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(twoFactors).where(eq(twoFactors.userId, userId));
    await tx.update(users).set({ twoFactorEnabled: false, updatedAt: new Date() }).where(eq(users.id, userId));
  });
}
