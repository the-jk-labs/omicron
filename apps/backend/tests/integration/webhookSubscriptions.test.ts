// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash, createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("@/lib/webhookDelivery.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
  postWebhook: vi.fn<typeof postWebhook>(),
}));

import { buildApp } from "@/app.ts";
import { auth } from "@/auth/auth.ts";
import { config } from "@/config.ts";
import { db } from "@/db/client.ts";
import * as oauthRepo from "@/db/repositories/oauth.ts";
import { oauthTokens, sessions, users, webhookDeliveries, webhookSubscriptions } from "@/db/schema.ts";
import { postWebhook } from "@/lib/webhookDelivery.ts";
import { seedFederationRunning } from "@/services/federationState.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { emitDeleted, emitPublished, sweep } from "@/services/webhookSubscriptions.ts";
import { closeDb, mkPost, mkUser, resetDb } from "./harness.ts";

const callback = "https://app.example/oauth/callback";
const hook = "https://app.example/hooks/omicron";
const scopes = "read:accounts webhooks:posts";
const verifier = "a".repeat(43);

let app: Awaited<ReturnType<typeof buildApp>>;
let cookie: string;
let userId: string;
let origin: string;
let source = 0;

beforeAll(async () => {
  seedFederationRunning(false);
  app = await buildApp();
});
beforeEach(async () => {
  await resetDb();
  vi.mocked(postWebhook).mockReset();
  vi.mocked(postWebhook).mockResolvedValue(200);
  userId = (await mkUser("ada")).id;
  const token = `webhook-test-session-${++source}`;
  await db.insert(sessions).values({ userId, token, expiresAt: new Date(Date.now() + 3600_000) });
  const signature = createHmac("sha256", config.SESSION_SECRET).update(token).digest("base64");
  cookie = `${(await auth.$context).authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${signature}`)}`;
  origin = await getOrigin();
});
afterAll(closeDb);

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${source}`, ...headers },
    body: JSON.stringify(body),
  });

async function register(requested = scopes) {
  const registered = await post("/api/v1/apps", {
    client_name: "Community site",
    redirect_uris: [callback],
    scopes: requested,
  });
  expect(registered.status).toBe(200);
  return (await registered.json()) as { client_id: string; client_secret: string };
}

async function connect(requested = scopes, client?: { client_id: string; client_secret: string }) {
  client ??= await register(requested);
  const query = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: callback,
    response_type: "code",
    scope: requested,
    state: "state",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  const prepared = await app.request(`/api/oauth/authorize?${query}`, { headers: { cookie } });
  expect(prepared.status).toBe(200);
  const { ticket } = await prepared.json();
  const approved = await post("/api/oauth/authorize", { ticket, decision: "allow" }, { cookie, origin });
  expect(approved.status).toBe(200);
  const code = new URL((await approved.json()).redirect).searchParams.get("code");
  const exchanged = await post("/oauth/token", {
    ...client,
    redirect_uri: callback,
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
  });
  expect(exchanged.status).toBe(200);
  return (await exchanged.json()) as { access_token: string };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function subscribed() {
  const { access_token } = await connect();
  const res = await post("/api/webhook-subscriptions", { url: hook }, bearer(access_token));
  expect(res.status).toBe(201);
  return { access_token, subscription: (await res.json()) as { id: string; url: string; secret: string } };
}

const sentEvents = () => vi.mocked(postWebhook).mock.calls.map(([, body]) => JSON.parse(body).event as string);
const later = (ms: number) => new Date(Date.now() + ms);

test("the whole flow: approve, subscribe, publish, receive a verifiable signed event", async () => {
  const { subscription } = await subscribed();
  expect(subscription.url).toBe(hook);

  const created = await mkPost(userId, "hello");
  await emitPublished(created.id, "create");
  expect(await sweep(later(1000))).toBe(1);

  const [url, body, headers] = vi.mocked(postWebhook).mock.calls[0];
  expect(url.href).toBe(hook);
  expect(JSON.parse(body)).toMatchObject({ event: "post.created", postId: created.id, username: "ada" });
  expect(headers["x-omicron-subscription"]).toBe(subscription.id);
  const match = /^t=(\d+),v1=([0-9a-f]+)$/.exec(headers["x-omicron-signature"])!;
  expect(match[2]).toBe(createHmac("sha256", subscription.secret).update(`${match[1]}.${body}`).digest("hex"));
  expect(await db.select().from(webhookDeliveries)).toEqual([]);
});

test("each event type reaches the receiver in turn", async () => {
  await subscribed();
  const created = await mkPost(userId, "hello");
  await emitPublished(created.id, "update");
  await emitDeleted(created.id, userId);
  await sweep(later(1000));
  expect(sentEvents().toSorted()).toEqual(["post.deleted", "post.updated"]);
});

test("the scope is required, and a broad grant doesn't imply it", async () => {
  const { access_token } = await connect("read write");
  const res = await post("/api/webhook-subscriptions", { url: hook }, bearer(access_token));
  expect(res.status).toBe(403);
});

test("a browser session can't create a subscription", async () => {
  const res = await post("/api/webhook-subscriptions", { url: hook }, { cookie, origin });
  expect(res.status).toBe(403);
});

test("an app can only point events at its own origin", async () => {
  const { access_token } = await connect();
  const res = await post("/api/webhook-subscriptions", { url: "https://evil.example/hook" }, bearer(access_token));
  expect(res.status).toBe(400);
  expect(await db.select().from(webhookSubscriptions)).toEqual([]);
});

test("reconnecting replaces the subscription and its old grant, so events aren't doubled", async () => {
  const client = await register();
  const subscribe = async () => {
    const { access_token } = await connect(scopes, client);
    return await post("/api/webhook-subscriptions", { url: hook }, bearer(access_token));
  };
  const first = await (await subscribe()).json();
  const second = await (await subscribe()).json();
  expect(second.id).not.toBe(first.id);
  expect(second.secret).not.toBe(first.secret);
  expect((await db.select().from(webhookSubscriptions)).map(({ id }) => id)).toEqual([second.id]);
  expect(await db.select().from(oauthTokens)).toHaveLength(1);
});

test("subscribing twice on one grant leaves one subscription", async () => {
  const { access_token } = await connect();
  for (let i = 0; i < 2; i++) {
    expect((await post("/api/webhook-subscriptions", { url: hook }, bearer(access_token))).status).toBe(201);
  }
  expect(await db.select().from(webhookSubscriptions)).toHaveLength(1);
  expect(await db.select().from(oauthTokens)).toHaveLength(1);
});

test("the connection outlives its tokens: cleanup keeps the grant, but it gives no API access", async () => {
  const { access_token } = await subscribed();
  const past = new Date(Date.now() - 1000);
  await db.update(oauthTokens).set({ expiresAt: past, refreshExpiresAt: past });

  await oauthRepo.cleanup();
  expect(await db.select().from(oauthTokens)).toHaveLength(1);
  const connections = await app.request("/api/oauth/connections", { headers: { cookie } });
  expect((await connections.json()).connections).toMatchObject([{ webhookActive: true }]);
  expect((await post("/api/webhook-subscriptions", { url: hook }, bearer(access_token))).status).toBe(401);

  const created = await mkPost(userId, "hello");
  await emitPublished(created.id, "create");
  await sweep(later(1000));
  expect(sentEvents()).toEqual(["post.created"]);
});

test("a grant with no subscription still expires", async () => {
  await connect();
  const past = new Date(Date.now() - 1000);
  await db.update(oauthTokens).set({ expiresAt: past, refreshExpiresAt: past });
  await oauthRepo.cleanup();
  expect(await db.select().from(oauthTokens)).toEqual([]);
});

test("disconnecting sends one connection.revoked in place of anything pending, then removes the subscription", async () => {
  await subscribed();
  const created = await mkPost(userId, "hello");
  await emitPublished(created.id, "create");
  const [grant] = await db.select().from(oauthTokens);
  await oauthRepo.removeConnection(grant.id, userId);

  await sweep(later(1000));
  expect(sentEvents()).toEqual(["connection.revoked"]);
  expect(await db.select().from(webhookSubscriptions)).toEqual([]);
});

test("removing the account also sends connection.revoked, naming it", async () => {
  await subscribed();
  await db.delete(users).where(eq(users.id, userId));
  await sweep(later(1000));
  expect(sentEvents()).toEqual(["connection.revoked"]);
  expect(JSON.parse(vi.mocked(postWebhook).mock.calls[0][1])).toMatchObject({ username: "ada", postId: null });
});

test("a 410 from the receiver ends the connection on this side too", async () => {
  await subscribed();
  const created = await mkPost(userId, "hello");
  await emitPublished(created.id, "create");
  vi.mocked(postWebhook).mockResolvedValue(410);
  await sweep(later(1000));
  expect(await db.select().from(webhookSubscriptions)).toEqual([]);
  expect(await db.select().from(oauthTokens)).toEqual([]);
});

test("a failed delivery waits, and its lease stops another sweep sending it again", async () => {
  await subscribed();
  const created = await mkPost(userId, "hello");
  await emitPublished(created.id, "create");
  vi.mocked(postWebhook).mockResolvedValue(503);
  const first = later(1000);
  await sweep(first);
  expect(await sweep(first)).toBe(0);
  const [row] = await db.select().from(webhookDeliveries);
  expect(row.attempts).toBe(1);
  expect(row.nextAttemptAt).toEqual(new Date(first.getTime() + 60_000));
});

test("a private author's posts produce no events", async () => {
  await subscribed();
  await db.update(users).set({ isPrivate: true }).where(eq(users.id, userId));
  const created = await mkPost(userId, "hello");
  await emitPublished(created.id, "create");
  expect(await db.select().from(webhookDeliveries)).toEqual([]);
});
