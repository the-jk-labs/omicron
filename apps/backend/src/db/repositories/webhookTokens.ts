// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type WebhookToken, webhookTokens } from "@/db/schema.ts";

// Webhook-token DB access. Services never touch `db` directly. Tokens are
// stored hashed (see lib/webhook.ts); the plaintext never reaches this layer.

export async function create(userId: string, label: string, tokenHash: string) {
  const [row] = await db
    .insert(webhookTokens)
    .values({ userId, label, tokenHash })
    .returning();
  return row;
}

// A user's live tokens, newest first. Revoked rows are dropped rather than
// shown struck through — the owner revoked them, they need no epitaph.
export function listForUser(userId: string): Promise<WebhookToken[]> {
  return db
    .select()
    .from(webhookTokens)
    .where(and(eq(webhookTokens.userId, userId), isNull(webhookTokens.revokedAt)))
    .orderBy(desc(webhookTokens.createdAt));
}

// Live-token count for a user, so the service can cap how many they hold.
export async function countForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(webhookTokens)
    .where(and(eq(webhookTokens.userId, userId), isNull(webhookTokens.revokedAt)));
  return row?.n ?? 0;
}

// Resolves a presented credential to its live token row. Matching on the hash
// means the lookup is an index probe over a fixed-width value — the plaintext
// is never compared, and a revoked row never matches.
export function findLive(tokenHash: string): Promise<WebhookToken | undefined> {
  return db.query.webhookTokens.findFirst({
    where: and(eq(webhookTokens.tokenHash, tokenHash), isNull(webhookTokens.revokedAt)),
  });
}

// Records that a token was just used. Fire-and-forget from the ingest path: the
// timestamp is for the owner's benefit, so it must never fail a publish.
export async function touchLastUsed(id: string) {
  await db.update(webhookTokens).set({ lastUsedAt: new Date() }).where(eq(webhookTokens.id, id));
}

// Revokes one of the user's own tokens. Scoped by `userId` in the WHERE clause
// so a guessed id can't retire someone else's credential. Returns whether a row
// was actually retired.
export async function revoke(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(webhookTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(webhookTokens.id, id),
        eq(webhookTokens.userId, userId),
        isNull(webhookTokens.revokedAt),
      ),
    )
    .returning({ id: webhookTokens.id });
  return rows.length > 0;
}
