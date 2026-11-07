// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";
import * as oauthRepo from "@/db/repositories/oauth.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as repo from "@/db/repositories/webhookSubscriptions.ts";
import type { User, WebhookDelivery, WebhookEvent, WebhookSubscription } from "@/db/schema.ts";
import { badRequest, forbidden } from "@/lib/http.ts";
import { generateSigningSecret, postWebhook, signatureHeader, webhookTarget } from "@/lib/webhookDelivery.ts";

// Post-event webhooks for OAuth applications. Delivery is a Postgres sweep rather
// than a queue job: the queue's worker is one serial loop, so one slow receiver
// would stall mail and federation, and its retries span seconds, not hours.

const MAX_PER_USER = 20;
const SWEEP_INTERVAL_MS = 10_000;
const SWEEP_BATCH = 50;
const CONCURRENCY = 5;
const LEASE_MS = 2 * 60_000;
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];

export async function subscribe(grant: { id: string; clientId: string }, user: User, input: string) {
  const app = await oauthRepo.findApp(grant.clientId);
  if (!app) throw forbidden("The application is unavailable.");
  const url = webhookTarget(input, app.redirectUris, config.ALLOW_PRIVATE_FEDERATION);
  if (!url) throw badRequest("The URL must be HTTPS and share an origin with one of the app's redirect URIs.");
  if ((await repo.countForUser(user.id)) >= MAX_PER_USER) throw badRequest("Too many webhook subscriptions.");
  return await repo.replace({
    grantId: grant.id,
    userId: user.id,
    username: user.username,
    clientId: grant.clientId,
    url: url.href,
    secret: generateSigningSecret(),
  });
}

// A private author's posts aren't public, so they never produce an event.
const isPublicAuthor = (author: User | undefined | null) =>
  Boolean(author && !author.isPrivate && !author.suspendedAt && !author.deletedAt);

export async function emitPublished(postId: string, action: "create" | "update"): Promise<void> {
  const row = await postsRepo.findById(postId);
  if (!row || row.post.remote || row.post.status !== "published" || !row.post.authorId) return;
  await emit(action === "create" ? "post.created" : "post.updated", postId, row.post.authorId);
}

export const emitDeleted = (postId: string, authorId: string) => emit("post.deleted", postId, authorId);

async function emit(event: WebhookEvent, postId: string, authorId: string): Promise<void> {
  if (isPublicAuthor(await usersRepo.findById(authorId))) await repo.enqueueForUser(authorId, event, postId);
}

let started = false;
let sweeping = false;

export function startWebhookSweeper(): void {
  if (started) return;
  started = true;
  void sweep();
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
}

/** One pass. Safe on every node: rows are claimed with `for update skip locked`. */
export async function sweep(now = new Date()): Promise<number> {
  if (sweeping) return 0;
  sweeping = true;
  try {
    await repo.queueRevocations(SWEEP_BATCH);
    const claimed = await repo.claimDue(SWEEP_BATCH, now, new Date(now.getTime() + LEASE_MS));
    for (let i = 0; i < claimed.length; i += CONCURRENCY) {
      await Promise.all(claimed.slice(i, i + CONCURRENCY).map((item) => deliver(item, now)));
    }
    return claimed.length;
  } catch (err) {
    console.error("webhooks: sweep failed:", err);
    return 0;
  } finally {
    sweeping = false;
  }
}

async function deliver(
  { delivery, subscription }: { delivery: WebhookDelivery; subscription: WebhookSubscription },
  now: Date,
) {
  const final = delivery.event === "connection.revoked";
  try {
    if (!final && !isPublicAuthor(await usersRepo.findById(subscription.userId))) {
      await repo.deleteDelivery(delivery.id);
      return;
    }
    const status = await send(delivery, subscription, now);
    if (status === 410) {
      await repo.endConnection(subscription);
    } else if (status >= 200 && status < 300) {
      await finish(delivery, subscription);
    } else {
      await retry(delivery, subscription, now);
    }
  } catch {
    await retry(delivery, subscription, now).catch((err: unknown) => console.error("webhooks: retry failed:", err));
  }
}

async function send(delivery: WebhookDelivery, subscription: WebhookSubscription, now: Date): Promise<number> {
  const allowPrivate = config.ALLOW_PRIVATE_FEDERATION;
  // Checked again at send time: the stored URL may predate a rule change.
  const url = webhookTarget(subscription.url, [subscription.url], allowPrivate);
  if (!url) throw new Error("Invalid webhook URL.");
  const body = JSON.stringify({
    id: delivery.id,
    event: delivery.event,
    postId: delivery.postId,
    username: subscription.username,
    occurredAt: delivery.occurredAt.toISOString(),
  });
  const signature = await signatureHeader(subscription.secret, Math.floor(now.getTime() / 1000), body);
  return await postWebhook(
    url,
    body,
    { "x-omicron-subscription": subscription.id, "x-omicron-signature": signature },
    allowPrivate,
  );
}

const finish = (delivery: WebhookDelivery, subscription: WebhookSubscription) =>
  delivery.event === "connection.revoked" ? repo.deleteSubscription(subscription.id) : repo.deleteDelivery(delivery.id);

async function retry(delivery: WebhookDelivery, subscription: WebhookSubscription, now: Date) {
  const delay = RETRY_DELAYS_MS[delivery.attempts];
  if (delay === undefined) await finish(delivery, subscription);
  else await repo.reschedule(delivery.id, delivery.attempts + 1, new Date(now.getTime() + delay));
}
