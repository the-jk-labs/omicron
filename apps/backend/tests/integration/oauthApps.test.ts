// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash, createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { buildApp } from "@/app.ts";
import { auth } from "@/auth/auth.ts";
import { config } from "@/config.ts";
import { db } from "@/db/client.ts";
import { oauthApps, oauthTokens, sessions, users } from "@/db/schema.ts";
import { seedFederationRunning } from "@/services/federationState.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { closeDb, mkUser, resetDb } from "./harness.ts";

const callback = "https://app.example/oauth/callback";
const verifier = "a".repeat(43);

let app: Awaited<ReturnType<typeof buildApp>>;
let origin: string;
let source = 0;

beforeAll(async () => {
  seedFederationRunning(false);
  app = await buildApp();
});
beforeEach(async () => {
  await resetDb();
  origin = await getOrigin();
  source += 1;
});
afterAll(closeDb);

async function signIn(username: string) {
  const { id } = await mkUser(username);
  const token = `apps-test-${username}-${source}`;
  await db.insert(sessions).values({ userId: id, token, expiresAt: new Date(Date.now() + 3600_000) });
  const signature = createHmac("sha256", config.SESSION_SECRET).update(token).digest("base64");
  const name = (await auth.$context).authCookies.sessionToken.name;
  return { id, cookie: `${name}=${encodeURIComponent(`${token}.${signature}`)}` };
}

let ip = 0;
const send = (path: string, method: string, cookie: string, body?: unknown, extra: Record<string, string> = {}) =>
  app.request(path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `192.0.3.${++ip % 250}`,
      cookie,
      origin,
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const fields = { client_name: "My app", redirect_uris: [callback], scopes: "read:accounts" };

async function create(cookie: string, overrides: object = {}) {
  const res = await send("/api/oauth/apps", "POST", cookie, { ...fields, ...overrides });
  expect(res.status).toBe(201);
  return (await res.json()) as { app: { id: string; name: string }; clientSecret: string | null };
}

async function approve(cookie: string, clientId: string, clientSecret: string | null, scope = "read:accounts") {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: "code",
    scope,
    state: "s",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  const prepared = await send(`/api/oauth/authorize?${query}`, "GET", cookie);
  expect(prepared.status).toBe(200);
  const { ticket } = await prepared.json();
  const approved = await send("/api/oauth/authorize", "POST", cookie, { ticket, decision: "allow" });
  const code = new URL((await approved.json()).redirect).searchParams.get("code");
  return await send("/oauth/token", "POST", "", {
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    redirect_uri: callback,
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
  });
}

test("an account registers an application, which belongs to it", async () => {
  const ada = await signIn("ada");
  const { app: created, clientSecret } = await create(ada.cookie);
  expect(clientSecret).toBeTruthy();

  const [row] = await db.select().from(oauthApps);
  expect(row.ownerId).toBe(ada.id);
  expect(row.secretHash).not.toContain(clientSecret);

  const listed = await (await send("/api/oauth/apps", "GET", ada.cookie)).json();
  expect(listed.apps).toHaveLength(1);
  expect(listed.apps[0]).toMatchObject({ id: created.id, name: "My app", redirectUris: [callback] });
  expect(listed.apps[0]).not.toHaveProperty("secretHash");
  expect(JSON.stringify(listed)).not.toContain(clientSecret);
  expect(listed.availableScopes.map((p: { scope: string }) => p.scope)).toContain("webhooks:posts");
});

test("nobody can register without an account", async () => {
  expect((await send("/api/oauth/apps", "POST", "", fields)).status).toBe(401);
  expect((await send("/api/v1/apps", "POST", "", fields)).status).toBe(404);
  expect(await db.select().from(oauthApps)).toEqual([]);
});

test("discovery no longer advertises open registration", async () => {
  const metadata = await (await app.request("/.well-known/oauth-authorization-server")).json();
  expect(metadata).not.toHaveProperty("registration_endpoint");
});

test("an account can hold only ten applications", async () => {
  const ada = await signIn("ada");
  await db.insert(oauthApps).values(
    Array.from({ length: 10 }, (_, i) => ({
      id: `app-${i}`,
      ownerId: ada.id,
      secretHash: "x",
      name: "n",
      redirectUris: [callback],
    })),
  );
  const res = await send("/api/oauth/apps", "POST", ada.cookie, fields);
  expect(res.status).toBe(409);
  expect(await db.select().from(oauthApps)).toHaveLength(10);

  const bob = await signIn("bob");
  await create(bob.cookie);
});

test("an OAuth token can't create or manage applications, even with every scope", async () => {
  const ada = await signIn("ada");
  const { app: created, clientSecret } = await create(ada.cookie, { scopes: "read write" });
  const token = (await (await approve(ada.cookie, created.id, clientSecret, "read write")).json()).access_token;

  const asApp = { authorization: `Bearer ${token}` };
  expect((await send("/api/oauth/apps", "POST", "", fields, asApp)).status).toBe(401);
  expect((await send("/api/oauth/apps", "GET", "", undefined, asApp)).status).toBe(401);
  expect((await send(`/api/oauth/apps/${created.id}`, "DELETE", "", undefined, asApp)).status).toBe(401);
});

test("a cross-site request can't touch an owner's applications", async () => {
  const ada = await signIn("ada");
  const { app: created } = await create(ada.cookie);
  const evil = { origin: "https://evil.example" };
  expect((await send("/api/oauth/apps", "POST", ada.cookie, fields, evil)).status).toBe(403);
  expect((await send(`/api/oauth/apps/${created.id}`, "DELETE", ada.cookie, undefined, evil)).status).toBe(403);
  expect(await db.select().from(oauthApps)).toHaveLength(1);
});

test("another account's application looks like it doesn't exist", async () => {
  const ada = await signIn("ada");
  const bob = await signIn("bob");
  const { app: created } = await create(ada.cookie);
  const path = `/api/oauth/apps/${created.id}`;

  expect((await (await send("/api/oauth/apps", "GET", bob.cookie)).json()).apps).toEqual([]);
  expect((await send(path, "PATCH", bob.cookie, { ...fields, client_name: "Stolen" })).status).toBe(404);
  expect((await send(`${path}/secret`, "POST", bob.cookie)).status).toBe(404);
  expect((await send(path, "DELETE", bob.cookie)).status).toBe(404);

  const [row] = await db.select().from(oauthApps);
  expect(row.name).toBe("My app");
});

test("the owner can edit an application, and bad settings are refused", async () => {
  const ada = await signIn("ada");
  const { app: created } = await create(ada.cookie);
  const path = `/api/oauth/apps/${created.id}`;

  const edited = await send(path, "PATCH", ada.cookie, {
    client_name: "Renamed",
    redirect_uris: "https://app.example/new\nhttps://app.example/other",
    scopes: "read:accounts webhooks:posts",
    website: "https://app.example",
  });
  expect(edited.status).toBe(200);
  expect((await edited.json()).app).toMatchObject({
    id: created.id,
    name: "Renamed",
    website: "https://app.example",
    redirectUris: ["https://app.example/new", "https://app.example/other"],
    scopes: ["read:accounts", "webhooks:posts"],
  });

  expect((await send(path, "PATCH", ada.cookie, { ...fields, redirect_uris: "javascript:alert(1)" })).status).toBe(400);
  expect((await send(path, "PATCH", ada.cookie, { ...fields, scopes: "everything" })).status).toBe(400);
});

test("a new secret works and the old one stops", async () => {
  const ada = await signIn("ada");
  const { app: created, clientSecret } = await create(ada.cookie);

  const rotated = await send(`/api/oauth/apps/${created.id}/secret`, "POST", ada.cookie);
  expect(rotated.status).toBe(200);
  const fresh = (await rotated.json()).clientSecret;
  expect(fresh).not.toBe(clientSecret);

  expect((await approve(ada.cookie, created.id, clientSecret)).status).toBeGreaterThanOrEqual(400);
  expect((await approve(ada.cookie, created.id, fresh)).status).toBe(200);
});

test("a public client has no secret, and PKCE alone gets it a token", async () => {
  const ada = await signIn("ada");
  const { app: created, clientSecret } = await create(ada.cookie, {
    redirect_uris: [callback],
    token_endpoint_auth_method: "none",
  });
  expect(clientSecret).toBeNull();
  expect((await send(`/api/oauth/apps/${created.id}/secret`, "POST", ada.cookie)).status).toBe(400);
  expect((await approve(ada.cookie, created.id, null)).status).toBe(200);
});

test("deleting an application disconnects everyone who approved it", async () => {
  const ada = await signIn("ada");
  const reader = await signIn("reader");
  const { app: created, clientSecret } = await create(ada.cookie);
  const token = (await (await approve(reader.cookie, created.id, clientSecret)).json()).access_token;
  expect(await db.select().from(oauthTokens)).toHaveLength(1);

  expect((await send(`/api/oauth/apps/${created.id}`, "DELETE", ada.cookie)).status).toBe(200);

  expect(await db.select().from(oauthApps)).toEqual([]);
  expect(await db.select().from(oauthTokens)).toEqual([]);
  const verify = await send("/api/v1/accounts/verify_credentials", "GET", "", undefined, {
    authorization: `Bearer ${token}`,
  });
  expect(verify.status).toBe(401);
});

test("removing an account removes its applications", async () => {
  const ada = await signIn("ada");
  await create(ada.cookie);
  await db.delete(users).where(eq(users.id, ada.id));
  expect(await db.select().from(oauthApps)).toEqual([]);
});

test("a suspended owner's application can't collect new approvals", async () => {
  const ada = await signIn("ada");
  const reader = await signIn("reader");
  const { app: created } = await create(ada.cookie);
  await db.update(users).set({ suspendedAt: new Date() }).where(eq(users.id, ada.id));
  const query = new URLSearchParams({
    client_id: created.id,
    redirect_uri: callback,
    response_type: "code",
    scope: "read:accounts",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  expect((await send(`/api/oauth/authorize?${query}`, "GET", reader.cookie)).status).toBe(400);
});
