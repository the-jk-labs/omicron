// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userRow } from "../fixtures.ts";

vi.mock(import("@/db/repositories/oauth.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/db/repositories/webhookSubscriptions.ts"));
vi.mock(import("@/lib/webhookDelivery.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
  postWebhook: vi.fn<typeof postWebhook>(),
}));

import * as oauthRepo from "@/db/repositories/oauth.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as repo from "@/db/repositories/webhookSubscriptions.ts";
import type { WebhookDelivery, WebhookEvent, WebhookSubscription } from "@/db/schema.ts";
import { postWebhook, signatureHeader } from "@/lib/webhookDelivery.ts";
import { emitDeleted, emitPublished, RETRY_DELAYS_MS, subscribe, sweep } from "@/services/webhookSubscriptions.ts";

const now = new Date("2026-11-07T12:00:00Z");
const subscription: WebhookSubscription = {
  id: "sub-1",
  grantId: "grant-1",
  userId: "user-1",
  username: "ada",
  clientId: "client-1",
  url: "https://app.example/hook",
  secret: "whsec_test",
  revokedAt: null,
  createdAt: now,
};
const delivery = (event: WebhookEvent = "post.updated", attempts = 0): WebhookDelivery => ({
  id: "delivery-1",
  subscriptionId: "sub-1",
  event,
  postId: event === "connection.revoked" ? null : "post-1",
  occurredAt: now,
  attempts,
  nextAttemptAt: now,
});
const claim = (item: WebhookDelivery, sub = subscription) =>
  vi.mocked(repo.claimDue).mockResolvedValue([{ delivery: item, subscription: sub }]);

beforeEach(() => {
  vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "user-1", username: "ada" }));
  vi.mocked(repo.queueRevocations).mockResolvedValue(0);
  vi.mocked(repo.claimDue).mockResolvedValue([]);
});

describe("subscribe", () => {
  const user = userRow({ id: "user-1", username: "ada" });
  const grant = { id: "grant-1", clientId: "client-1" };

  beforeEach(() => {
    vi.mocked(oauthRepo.findApp).mockResolvedValue({ redirectUris: ["https://app.example/cb"] } as never);
    vi.mocked(repo.countForUser).mockResolvedValue(0);
    vi.mocked(repo.replace).mockImplementation(async (values) => ({ ...subscription, ...values }));
  });

  test("ties the subscription to the grant and mints a fresh secret", async () => {
    const created = await subscribe(grant, user, "https://app.example/hook");
    expect(repo.replace).toHaveBeenCalledWith(
      expect.objectContaining({ grantId: "grant-1", userId: "user-1", username: "ada", clientId: "client-1" }),
    );
    expect(created.secret).toMatch(/^whsec_[0-9a-f]{64}$/);
  });

  test("refuses a URL off the app's own origin", async () => {
    await expect(subscribe(grant, user, "https://evil.example/hook")).rejects.toMatchObject({ status: 400 });
    expect(repo.replace).not.toHaveBeenCalled();
  });

  test("refuses when the app is gone", async () => {
    vi.mocked(oauthRepo.findApp).mockResolvedValue(undefined);
    await expect(subscribe(grant, user, "https://app.example/hook")).rejects.toMatchObject({ status: 403 });
  });

  test("caps how many one account can hold", async () => {
    vi.mocked(repo.countForUser).mockResolvedValue(20);
    await expect(subscribe(grant, user, "https://app.example/hook")).rejects.toMatchObject({ status: 400 });
  });
});

describe("emitting", () => {
  const published = (post: object) => vi.mocked(postsRepo.findById).mockResolvedValue({ post } as never);

  test.each([
    ["create", "post.created"],
    ["update", "post.updated"],
  ] as const)("a published post's %s becomes %s", async (action, event) => {
    published({ remote: false, status: "published", authorId: "user-1" });
    await emitPublished("post-1", action);
    expect(repo.enqueueForUser).toHaveBeenCalledWith("user-1", event, "post-1");
  });

  test.each([
    ["remote", { remote: true, status: "published", authorId: "user-1" }],
    ["no longer published", { remote: false, status: "draft", authorId: "user-1" }],
    ["authorless", { remote: false, status: "published", authorId: null }],
  ])("a %s post emits nothing", async (_label, post) => {
    published(post);
    await emitPublished("post-1", "create");
    expect(repo.enqueueForUser).not.toHaveBeenCalled();
  });

  test.each([
    ["private", { isPrivate: true }],
    ["suspended", { suspendedAt: now }],
    ["deleted", { deletedAt: now }],
  ])("a %s author emits nothing", async (_label, opts) => {
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow(opts));
    await emitDeleted("post-1", "user-1");
    expect(repo.enqueueForUser).not.toHaveBeenCalled();
  });

  test("a deletion names the post, whose row is already gone", async () => {
    await emitDeleted("post-1", "user-1");
    expect(repo.enqueueForUser).toHaveBeenCalledWith("user-1", "post.deleted", "post-1");
  });
});

describe("sweep", () => {
  test("signs exactly what it sends", async () => {
    claim(delivery());
    vi.mocked(postWebhook).mockResolvedValue(200);
    expect(await sweep(now)).toBe(1);
    const [url, body, headers] = vi.mocked(postWebhook).mock.calls[0];
    expect(url.href).toBe("https://app.example/hook");
    expect(JSON.parse(body)).toEqual({
      id: "delivery-1",
      event: "post.updated",
      postId: "post-1",
      username: "ada",
      occurredAt: now.toISOString(),
    });
    expect(headers["x-omicron-subscription"]).toBe("sub-1");
    expect(headers["x-omicron-signature"]).toBe(
      await signatureHeader("whsec_test", Math.floor(now.getTime() / 1000), body),
    );
  });

  test("a 2xx removes the delivery and keeps the subscription", async () => {
    claim(delivery());
    vi.mocked(postWebhook).mockResolvedValue(204);
    await sweep(now);
    expect(repo.deleteDelivery).toHaveBeenCalledWith("delivery-1");
    expect(repo.deleteSubscription).not.toHaveBeenCalled();
  });

  test("a 410 ends the whole connection", async () => {
    claim(delivery());
    vi.mocked(postWebhook).mockResolvedValue(410);
    await sweep(now);
    expect(repo.endConnection).toHaveBeenCalledWith(subscription);
    expect(repo.reschedule).not.toHaveBeenCalled();
  });

  test.each(RETRY_DELAYS_MS.map((delay, attempts) => [attempts, delay] as const))(
    "failure number %i waits %i ms",
    async (attempts, delay) => {
      claim(delivery("post.updated", attempts));
      vi.mocked(postWebhook).mockResolvedValue(500);
      await sweep(now);
      expect(repo.reschedule).toHaveBeenCalledWith("delivery-1", attempts + 1, new Date(now.getTime() + delay));
    },
  );

  test("a redirect or a network error is a failure, not a success", async () => {
    claim(delivery());
    vi.mocked(postWebhook).mockResolvedValue(302);
    await sweep(now);
    vi.mocked(postWebhook).mockRejectedValue(new Error("timeout"));
    await sweep(now);
    expect(repo.reschedule).toHaveBeenCalledTimes(2);
    expect(repo.deleteDelivery).not.toHaveBeenCalled();
  });

  test("the delivery is dropped once the retries run out", async () => {
    claim(delivery("post.updated", RETRY_DELAYS_MS.length));
    vi.mocked(postWebhook).mockResolvedValue(500);
    await sweep(now);
    expect(repo.deleteDelivery).toHaveBeenCalledWith("delivery-1");
    expect(repo.reschedule).not.toHaveBeenCalled();
  });

  test.each([
    ["private", { isPrivate: true }],
    ["suspended", { suspendedAt: now }],
    ["deleted", { deletedAt: now }],
  ])("nothing is sent once the author is %s", async (_label, opts) => {
    claim(delivery());
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow(opts));
    await sweep(now);
    expect(postWebhook).not.toHaveBeenCalled();
    expect(repo.deleteDelivery).toHaveBeenCalledWith("delivery-1");
  });

  test("connection.revoked is still sent for a removed account, then the subscription goes", async () => {
    claim(delivery("connection.revoked"), { ...subscription, grantId: null, revokedAt: now });
    vi.mocked(usersRepo.findById).mockResolvedValue(undefined);
    vi.mocked(postWebhook).mockResolvedValue(200);
    await sweep(now);
    expect(JSON.parse(vi.mocked(postWebhook).mock.calls[0][1])).toMatchObject({
      event: "connection.revoked",
      postId: null,
      username: "ada",
    });
    expect(repo.deleteSubscription).toHaveBeenCalledWith("sub-1");
  });

  test("a revocation that never gets through still removes the subscription", async () => {
    claim(delivery("connection.revoked", RETRY_DELAYS_MS.length), { ...subscription, grantId: null, revokedAt: now });
    vi.mocked(postWebhook).mockResolvedValue(500);
    await sweep(now);
    expect(repo.deleteSubscription).toHaveBeenCalledWith("sub-1");
  });

  test("a failed sweep is logged, not thrown", async () => {
    vi.mocked(repo.claimDue).mockRejectedValue(new Error("db down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sweep(now)).toBe(0);
    expect(error).toHaveBeenCalled();
  });
});
