// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, asc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import {
  oauthTokens,
  type WebhookEvent,
  type WebhookSubscription,
  webhookDeliveries,
  webhookSubscriptions,
} from "@/db/schema.ts";

export async function countForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(webhookSubscriptions)
    .where(and(eq(webhookSubscriptions.userId, userId), isNull(webhookSubscriptions.revokedAt)));
  return row?.n ?? 0;
}

// Reconnecting must not double every event, and nothing makes app + user unique,
// so the same app, user and URL replaces what was there, including its old grant.
export function replace(values: {
  grantId: string;
  userId: string;
  username: string;
  clientId: string;
  url: string;
  secret: string;
}): Promise<WebhookSubscription> {
  return db.transaction(async (tx) => {
    const previous = await tx
      .delete(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.clientId, values.clientId),
          eq(webhookSubscriptions.userId, values.userId),
          eq(webhookSubscriptions.url, values.url),
        ),
      )
      .returning({ grantId: webhookSubscriptions.grantId });
    await tx.delete(webhookSubscriptions).where(eq(webhookSubscriptions.grantId, values.grantId));
    const staleGrants = previous.flatMap(({ grantId }) => (grantId && grantId !== values.grantId ? [grantId] : []));
    if (staleGrants.length) await tx.delete(oauthTokens).where(inArray(oauthTokens.id, staleGrants));
    const [row] = await tx.insert(webhookSubscriptions).values(values).returning();
    return row;
  });
}

export async function enqueueForUser(userId: string, event: WebhookEvent, postId: string): Promise<void> {
  const subscriptions = await db
    .select({ id: webhookSubscriptions.id })
    .from(webhookSubscriptions)
    .where(
      and(
        eq(webhookSubscriptions.userId, userId),
        isNotNull(webhookSubscriptions.grantId),
        isNull(webhookSubscriptions.revokedAt),
      ),
    );
  if (subscriptions.length === 0) return;
  await db.insert(webhookDeliveries).values(subscriptions.map(({ id }) => ({ subscriptionId: id, event, postId })));
}

// A subscription whose grant is gone, by any path, gets one final event and
// nothing else: what was still pending would describe a connection that ended.
export function queueRevocations(limit: number): Promise<number> {
  return db.transaction(async (tx) => {
    const orphans = await tx
      .select({ id: webhookSubscriptions.id })
      .from(webhookSubscriptions)
      .where(and(isNull(webhookSubscriptions.grantId), isNull(webhookSubscriptions.revokedAt)))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (orphans.length === 0) return 0;
    const ids = orphans.map(({ id }) => id);
    await tx.delete(webhookDeliveries).where(inArray(webhookDeliveries.subscriptionId, ids));
    await tx.update(webhookSubscriptions).set({ revokedAt: new Date() }).where(inArray(webhookSubscriptions.id, ids));
    await tx
      .insert(webhookDeliveries)
      .values(ids.map((subscriptionId) => ({ subscriptionId, event: "connection.revoked" as const })));
    return ids.length;
  });
}

// Pushing `nextAttemptAt` out is the lease: a process that dies mid-send leaves
// the row to be retried, and no other process takes it in the meantime.
export async function claimDue(limit: number, now: Date, leaseUntil: Date) {
  const due = db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(lte(webhookDeliveries.nextAttemptAt, now))
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(limit)
    .for("update", { skipLocked: true });
  const claimed = await db
    .update(webhookDeliveries)
    .set({ nextAttemptAt: leaseUntil })
    .where(inArray(webhookDeliveries.id, due))
    .returning();
  if (claimed.length === 0) return [];
  const subscriptions = await db
    .select()
    .from(webhookSubscriptions)
    .where(
      inArray(
        webhookSubscriptions.id,
        claimed.map((delivery) => delivery.subscriptionId),
      ),
    );
  const byId = new Map(subscriptions.map((subscription) => [subscription.id, subscription]));
  return claimed.flatMap((delivery) => {
    const subscription = byId.get(delivery.subscriptionId);
    return subscription ? [{ delivery, subscription }] : [];
  });
}

export async function deleteDelivery(id: string): Promise<void> {
  await db.delete(webhookDeliveries).where(eq(webhookDeliveries.id, id));
}

export async function reschedule(id: string, attempts: number, nextAttemptAt: Date): Promise<void> {
  await db.update(webhookDeliveries).set({ attempts, nextAttemptAt }).where(eq(webhookDeliveries.id, id));
}

export async function deleteSubscription(id: string): Promise<void> {
  await db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.id, id));
}

// The receiver answered 410: it no longer wants this connection, so end it here too.
export function endConnection(subscription: Pick<WebhookSubscription, "id" | "grantId">): Promise<void> {
  return db.transaction(async (tx) => {
    await tx.delete(webhookSubscriptions).where(eq(webhookSubscriptions.id, subscription.id));
    if (subscription.grantId) await tx.delete(oauthTokens).where(eq(oauthTokens.id, subscription.grantId));
  });
}
