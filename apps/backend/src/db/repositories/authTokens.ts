// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type AuthToken, authTokens } from "@/db/schema.ts";

// Auth-token DB access (password reset + email verification). Services never
// touch `db` directly. Tokens are stored hashed (see lib/tokens.ts).

export type AuthTokenPurpose = "password_reset" | "email_verify";

export async function create(
  userId: string,
  purpose: AuthTokenPurpose,
  tokenHash: string,
  expiresAt: Date,
) {
  const [row] = await db
    .insert(authTokens)
    .values({ userId, purpose, tokenHash, expiresAt })
    .returning();
  return row;
}

// Returns a token row only if it exists, matches the purpose, is unused and
// unexpired — the single check a redeem path needs.
export async function findValid(
  tokenHash: string,
  purpose: AuthTokenPurpose,
): Promise<AuthToken | undefined> {
  return await db.query.authTokens.findFirst({
    where: and(
      eq(authTokens.tokenHash, tokenHash),
      eq(authTokens.purpose, purpose),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, new Date()),
    ),
  });
}

export async function markUsed(id: string) {
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, id));
}

// Invalidate any outstanding tokens of a purpose for a user (e.g. before issuing
// a fresh one, so only the latest link is live).
export async function deleteForUser(userId: string, purpose: AuthTokenPurpose) {
  await db
    .delete(authTokens)
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose)));
}

// Opportunistic cleanup of spent/expired rows so the table can't grow unbounded.
export async function pruneExpired() {
  await db
    .delete(authTokens)
    .where(or(lt(authTokens.expiresAt, new Date()), isNotNull(authTokens.usedAt)));
}
