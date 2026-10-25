// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash, createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { buildApp } from "@/app.ts";
import { auth } from "@/auth/auth.ts";
import { config } from "@/config.ts";
import { db } from "@/db/client.ts";
import * as oauthRepo from "@/db/repositories/oauth.ts";
import { oauthApps, oauthRefreshTokens, oauthTokens, sessions, users } from "@/db/schema.ts";
import { seedFederationRunning } from "@/services/federationState.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { closeDb, mkPost, mkUser, resetDb } from "./harness.ts";

let app: Awaited<ReturnType<typeof buildApp>>;
let cookie: string;
let userId: string;
let origin: string;
let source = 0;
const callback = "org.example.reader:/oauth/callback";
const verifier = "a".repeat(43);

beforeAll(async () => {
  seedFederationRunning(false);
  app = await buildApp();
});
beforeEach(async () => {
  await resetDb();
  userId = (await mkUser("ada")).id;
  const token = `client-test-session-${++source}`;
  await db.insert(sessions).values({ userId, token, expiresAt: new Date(Date.now() + 3600_000) });
  const signature = createHmac("sha256", config.SESSION_SECRET).update(token).digest("base64");
  cookie = `${(await auth.$context).authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${signature}`)}`;
  origin = await getOrigin();
});
afterAll(closeDb);

async function post(path: string, body: unknown, browser = false) {
  return app.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `192.0.2.${source}`,
      ...(browser ? { cookie, origin } : {}),
    },
    body: JSON.stringify(body),
  });
}
async function register(scopes = "read write", redirect = callback, publicClient = true) {
  const res = await post("/api/v1/apps", {
    client_name: "Third-party Reader",
    redirect_uris: [redirect],
    scopes,
    token_endpoint_auth_method: publicClient ? "none" : "client_secret_basic",
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { client_id: string; client_secret?: string };
}
async function authorize(
  client: { client_id: string; client_secret?: string },
  scopes = "read write",
  redirect = callback,
) {
  const query = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirect,
    response_type: "code",
    scope: scopes,
    state: "opaque-client-state",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  const prepared = await app.request(`/api/oauth/authorize?${query}`, { headers: { cookie } });
  expect(prepared.status).toBe(200);
  const { ticket } = await prepared.json();
  const approved = await post("/api/oauth/authorize", { ticket, decision: "allow" }, true);
  expect(approved.status).toBe(200);
  const target = new URL((await approved.json()).redirect);
  expect(target.searchParams.get("state")).toBe("opaque-client-state");
  const result = await post("/oauth/token", {
    ...client,
    redirect_uri: redirect,
    grant_type: "authorization_code",
    code: target.searchParams.get("code"),
    code_verifier: verifier,
  });
  expect(result.status).toBe(200);
  return (await result.json()) as { access_token: string; refresh_token: string; scope: string };
}
async function grant(scopes = "read write") {
  const client = await register(scopes);
  return { client, ...(await authorize(client, scopes)) };
}
const refresh = (client: { client_id: string; client_secret?: string }, refresh_token: string) =>
  post("/oauth/token", { ...client, grant_type: "refresh_token", refresh_token });
async function api(token: string, path: string, method = "GET", body?: unknown) {
  return app.request(`/api${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-forwarded-for": `192.0.2.${source}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("public discovery and CORS work without federation or a browser session", async () => {
  const discovery = await app.request("/api/client");
  expect(discovery.status).toBe(200);
  const manifest = await discovery.json();
  expect(manifest).toMatchObject({
    apiVersion: 1,
    apiBase: "/api",
    authorization: { grant_types_supported: ["authorization_code", "refresh_token"] },
  });
  expect(manifest.operations).toContainEqual({ method: "POST", path: "/api/posts", scope: "write:posts" });
  const metadata = await app.request("/.well-known/oauth-authorization-server");
  expect(metadata.status).toBe(200);
  const options = await app.request("/api/posts", {
    method: "OPTIONS",
    headers: {
      origin: "https://client.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type",
    },
  });
  expect(options.status).toBe(204);
  expect(options.headers.get("access-control-allow-origin")).toBe("*");
});

test("application verification returns approved permissions without a secret", async () => {
  const credentials = await grant();
  const res = await api(credentials.access_token, "/v1/apps/verify_credentials");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({
    id: credentials.client.client_id,
    scopes: ["read", "write"],
    redirect_uris: [callback],
  });
  expect(body).not.toHaveProperty("client_secret");
  expect(body).not.toHaveProperty("secretHash");
});

test("unapproved full-client registrations remain usable after 30 days of inactivity", async () => {
  const client = await register();
  await db.update(oauthApps).set({ createdAt: new Date(Date.now() - 31 * 86400_000) });
  await oauthRepo.cleanup();
  const credentials = await authorize(client);
  expect((await api(credentials.access_token, "/me")).status).toBe(200);
});

test("a native client can read, compose, schedule, publish, edit, save, interact and delete using only OAuth", async () => {
  const { access_token: token } = await grant();
  expect((await api(token, "/me")).status).toBe(200);
  expect((await api(token, "/users/me", "PATCH", { displayName: "Ada Lovelace" })).status).toBe(200);
  const created = await api(token, "/posts", "POST", {
    title: "Third-party article",
    contentHtml: "<p>Native editor content.</p>",
    status: "draft",
    tags: ["clients"],
  });
  expect(created.status).toBe(201);
  const id = (await created.json()).post.id;
  expect((await api(token, "/posts/mine?status=draft")).status).toBe(200);
  expect(
    (
      await api(token, `/posts/${id}`, "PATCH", {
        status: "scheduled",
        publishAt: new Date(Date.now() + 86400_000).toISOString(),
      })
    ).status,
  ).toBe(200);
  expect((await api(token, "/posts/mine?status=scheduled")).status).toBe(200);
  expect((await api(token, `/posts/${id}`, "PATCH", { status: "published", publishAt: null })).status).toBe(200);
  expect((await api(token, `/posts/${id}/like`, "POST")).status).toBe(200);
  const comment = await api(token, `/posts/${id}/comments`, "POST", { content: "Posted from another client." });
  expect(comment.status).toBe(201);
  const commentId = (await comment.json()).comment.id;
  expect(
    (await api(token, `/posts/${id}/comments/${commentId}`, "PATCH", { content: "Edited natively." })).status,
  ).toBe(200);
  const list = await api(token, "/lists", "POST", { title: "Private bookmarks", visibility: "private" });
  expect(list.status).toBe(201);
  const listId = (await list.json()).list.id;
  expect((await api(token, `/lists/${listId}/items`, "POST", { postId: id })).status).toBe(200);
  const saved = await api(token, `/lists/${listId}/items`);
  expect((await saved.json()).items).toHaveLength(1);
  for (const path of [
    "/feed",
    "/posts?scope=local",
    "/posts/mine/counts",
    "/lists/read-later",
    "/notifications",
    "/dashboard",
    "/users/me/blocked",
    "/users/me/muted",
    "/users/me/follow-requests",
    "/photos/providers",
    "/search?q=Third-party",
  ]) {
    expect({ path, status: (await api(token, path)).status }).toEqual({ path, status: 200 });
  }
  const bob = await mkUser("bob");
  expect((await api(token, `/users/${bob.username}/follow`, "POST")).status).toBe(201);
  expect((await api(token, `/users/${bob.username}/mute`, "POST")).status).toBe(201);
  expect((await api(token, `/users/${bob.username}/mute`, "DELETE")).status).toBe(200);
  expect((await api(token, "/notifications/read", "POST")).status).toBe(200);
  expect((await api(token, `/posts/${id}/comments/${commentId}`, "DELETE")).status).toBe(200);
  expect((await api(token, `/posts/${id}`, "DELETE")).status).toBe(200);
  expect((await api(token, `/lists/${listId}`, "DELETE")).status).toBe(200);
});

test("OAuth never bypasses resource ownership or grants cookie/session security access", async () => {
  const { access_token: token } = await grant();
  const bob = await mkUser("bob");
  const draft = await mkPost(bob.id, "private-draft", { status: "draft" });
  expect((await api(token, `/posts/${draft.id}`)).status).toBe(404);
  expect((await api(token, `/posts/${draft.id}`, "PATCH", { title: "Not mine" })).status).toBe(403);
  expect((await api(token, "/auth/token")).status).toBe(401);
  expect((await api(token, "/oauth/connections")).status).toBe(401);
  expect((await api(token, "/setup", "POST", {})).status).toBe(403);
});

test("read-only, profile-write, and administrator permissions remain separate", async () => {
  const read = await grant("read");
  expect((await api(read.access_token, "/posts", "POST", { contentHtml: "<p>No.</p>" })).status).toBe(403);
  expect((await api(read.access_token, "/admin/settings")).status).toBe(403);
  const profile = await grant("write:accounts");
  const response = await api(profile.access_token, "/users/me/preferences", "PATCH", { showAiAssistedPosts: false });
  expect(response.status).toBe(200);
  expect((await response.json()).user).not.toHaveProperty("email");
  const admin = await grant("admin:read admin:write");
  expect((await api(admin.access_token, "/admin/settings")).status).toBe(403);
  await db.update(users).set({ isAdmin: true }).where(eq(users.id, userId));
  expect((await api(admin.access_token, "/admin/settings")).status).toBe(200);
  const bob = await mkUser("bob");
  expect((await api(admin.access_token, `/admin/users/${bob.id}/suspend`, "POST", { suspend: true })).status).toBe(200);
  await db.update(users).set({ isAdmin: false }).where(eq(users.id, userId));
  expect((await api(admin.access_token, "/admin/settings")).status).toBe(403);
});

test("expired access can be renewed, both secrets rotate, and refresh replay revokes the entire grant", async () => {
  const credentials = await grant();
  await db.update(oauthTokens).set({ expiresAt: new Date(Date.now() - 1000) });
  expect((await api(credentials.access_token, "/me")).status).toBe(401);
  await oauthRepo.cleanup();
  expect(await db.select().from(oauthTokens)).toHaveLength(1);
  const connections = await app.request("/api/oauth/connections", { headers: { cookie } });
  expect((await connections.json()).connections).toHaveLength(1);
  const renewed = await refresh(credentials.client, credentials.refresh_token);
  expect(renewed.status).toBe(200);
  const next = await renewed.json();
  expect(next.scope).toBe("read write");
  expect(next.refresh_token).not.toBe(credentials.refresh_token);
  expect((await api(next.access_token, "/me")).status).toBe(200);
  expect((await api(credentials.access_token, "/me")).status).toBe(401);
  expect((await refresh(credentials.client, credentials.refresh_token)).status).toBe(400);
  expect((await api(next.access_token, "/me")).status).toBe(401);
  expect((await refresh(credentials.client, next.refresh_token)).status).toBe(400);
});

test("concurrent refresh produces at most one successor and detected reuse invalidates it", async () => {
  const credentials = await grant();
  const responses = await Promise.all([
    refresh(credentials.client, credentials.refresh_token),
    refresh(credentials.client, credentials.refresh_token),
  ]);
  expect(responses.map((res) => res.status).toSorted((a, b) => a - b)).toEqual([200, 400]);
  const next = await responses.find((res) => res.status === 200)!.json();
  expect((await api(next.access_token, "/me")).status).toBe(401);
});

test("absolute grant expiry stops renewal and cleanup removes refresh history with its grant", async () => {
  const credentials = await grant();
  await db
    .update(oauthTokens)
    .set({ expiresAt: new Date(Date.now() - 1000), refreshExpiresAt: new Date(Date.now() - 1000) });
  expect((await refresh(credentials.client, credentials.refresh_token)).status).toBe(400);
  expect((await api(credentials.access_token, "/me")).status).toBe(401);
  await oauthRepo.cleanup();
  expect(await db.select().from(oauthTokens)).toHaveLength(0);
  expect(await db.select().from(oauthRefreshTokens)).toHaveLength(0);
});

test("renewal and revocation are client-bound; disconnect and suspension stop both token types", async () => {
  const credentials = await grant();
  const other = await register();
  expect((await refresh(other, credentials.refresh_token)).status).toBe(400);
  expect((await post("/oauth/revoke", { ...other, token: credentials.refresh_token })).status).toBe(200);
  expect((await api(credentials.access_token, "/me")).status).toBe(200);
  const [stored] = await db.select().from(oauthTokens);
  expect(
    (await app.request(`/api/oauth/connections/${stored.id}`, { method: "DELETE", headers: { cookie, origin } }))
      .status,
  ).toBe(200);
  expect((await refresh(credentials.client, credentials.refresh_token)).status).toBe(400);
  expect((await api(credentials.access_token, "/me")).status).toBe(401);
  const next = await authorize(credentials.client);
  await db.update(users).set({ suspendedAt: new Date() }).where(eq(users.id, userId));
  expect((await api(next.access_token, "/me")).status).toBe(401);
  expect((await refresh(credentials.client, next.refresh_token)).status).toBe(400);
});

test("HTTPS confidential clients retain Basic authentication and refresh-token revocation", async () => {
  const redirect = "https://client.example/callback";
  const client = await register("read write", redirect, false);
  expect(client.client_secret).toBeDefined();
  const credentials = await authorize(client, "read write", redirect);
  const res = await app.request("/oauth/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: credentials.refresh_token }),
  });
  expect(res.status).toBe(200);
  const next = await res.json();
  expect((await post("/oauth/revoke", { ...client, token: next.refresh_token })).status).toBe(200);
  expect((await api(next.access_token, "/me")).status).toBe(401);
});
