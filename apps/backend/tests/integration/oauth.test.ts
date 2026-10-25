// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHmac, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeEach, expect, test } from "vitest";
import { auth } from "@/auth/auth.ts";
import { config } from "@/config.ts";
import { db } from "@/db/client.ts";
import * as repo from "@/db/repositories/oauth.ts";
import { oauthApps, oauthCodes, oauthRequests, oauthTokens, sessions, users } from "@/db/schema.ts";
import { handleError } from "@/lib/http.ts";
import { hashToken } from "@/lib/tokens.ts";
import { requireUser, sessionMiddleware } from "@/routes/middleware.ts";
import { oauthRoutes } from "@/routes/oauth.ts";
import type { AppEnv } from "@/routes/types.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { closeDb, mkUser, resetDb } from "./harness.ts";

const app = new Hono<AppEnv>().onError(handleError).route("/", oauthRoutes);
app.use("/api/private", sessionMiddleware);
app.get("/api/private", (c) => c.json({ userId: requireUser(c).id }));
const callback = "https://client.example/callback?keep=1";
let cookie: string;
let sessionId: string;
let userId: string;
let source = 0;
let origin: string;
beforeEach(async () => {
  await resetDb();
  const user = await mkUser("ada");
  userId = user.id;
  const token = `session-${++source}`;
  const [session] = await db
    .insert(sessions)
    .values({ userId, token, expiresAt: new Date(Date.now() + 3600_000) })
    .returning();
  sessionId = session.id;
  const signature = createHmac("sha256", config.SESSION_SECRET).update(token).digest("base64");
  cookie = `${(await auth.$context).authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${signature}`)}`;
  origin = await getOrigin();
});
afterAll(closeDb);

async function post(path: string, body: Record<string, unknown>, sessionCookie = cookie) {
  return app.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie,
      origin,
      "x-forwarded-for": `192.0.2.${source}`,
    },
    body: JSON.stringify(body),
  });
}

async function client() {
  const response = await post("/api/v1/apps", {
    client_name: "Directory",
    redirect_uris: callback,
    scopes: "read:accounts",
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { client_id: string; client_secret: string };
}

async function consent(c: { client_id: string }, extra: Record<string, string> = {}) {
  const query = new URLSearchParams({
    client_id: c.client_id,
    redirect_uri: callback,
    response_type: "code",
    scope: "read:accounts",
    state: "opaque+/=&",
    ...extra,
  });
  const response = await app.request(`/api/oauth/authorize?${query}`, { headers: { cookie } });
  expect(response.status).toBe(200);
  return (await response.json()) as { ticket: string };
}

async function grant(c: { client_id: string }, extra: Record<string, string> = {}) {
  const { ticket } = await consent(c, extra);
  const response = await post("/api/oauth/authorize", { ticket, decision: "allow" });
  expect(response.status).toBe(200);
  const target = new URL((await response.json()).redirect);
  expect(target.searchParams.get("keep")).toBe("1");
  expect(target.searchParams.get("state")).toBe("opaque+/=&");
  return target.searchParams.get("code")!;
}

const exchangeBody = (c: { client_id: string; client_secret: string }, code: string) => ({
  ...c,
  code,
  redirect_uri: callback,
  grant_type: "authorization_code",
});
const verify = (token: string) =>
  app.request("/api/v1/accounts/verify_credentials", { headers: { authorization: `Bearer ${token}` } });

test("real cookie → explicit consent → one-use code → identity-only token → revocation", async () => {
  const c = await client();
  const code = await grant(c);
  const response = await post("/oauth/token", exchangeBody(c, code));
  expect(response.status).toBe(200);
  const { access_token: token } = await response.json();
  const identity = await verify(token);
  expect(identity.status).toBe(200);
  expect(await identity.json()).toEqual({
    id: userId,
    username: "ada",
    acct: "ada",
    display_name: "ada",
    url: `${origin}/@ada`,
    uri: `${origin}/users/ada`,
  });
  expect((await app.request("/api/private", { headers: { authorization: `Bearer ${token}` } })).status).toBe(403);
  const [stored] = await db.select().from(oauthTokens);
  expect(stored.tokenHash).toBe(await hashToken(token));
  expect((await db.select().from(oauthCodes)).length).toBe(0);
  const connections = await app.request("/api/oauth/connections", { headers: { cookie } });
  const serialized = await connections.text();
  expect(serialized).not.toContain(stored.tokenHash);
  expect(serialized).not.toContain(token);
  expect((await post("/oauth/revoke", { ...c, token })).status).toBe(200);
  expect((await verify(token)).status).toBe(401);
  expect((await post("/oauth/revoke", { ...c, token })).status).toBe(200);
});

test("denial never creates a code or token and cannot be replayed", async () => {
  const c = await client();
  const { ticket } = await consent(c);
  const response = await post("/api/oauth/authorize", { ticket, decision: "deny" });
  expect(new URL((await response.json()).redirect).searchParams.get("error")).toBe("access_denied");
  expect((await post("/api/oauth/authorize", { ticket, decision: "allow" })).status).toBe(400);
  expect(await db.select().from(oauthCodes)).toHaveLength(0);
  expect(await db.select().from(oauthTokens)).toHaveLength(0);
});

test("consent is tied to the exact live browser session, not just the account", async () => {
  const c = await client();
  const { ticket } = await consent(c);
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  expect((await post("/api/oauth/authorize", { ticket, decision: "allow" })).status).toBe(401);
  expect(await db.select().from(oauthRequests)).toHaveLength(0);
});

test("two parallel approvals produce at most one authorization code", async () => {
  const c = await client();
  const { ticket } = await consent(c);
  const responses = await Promise.all([
    post("/api/oauth/authorize", { ticket, decision: "allow" }),
    post("/api/oauth/authorize", { ticket, decision: "allow" }),
  ]);
  expect(responses.map((r) => r.status).toSorted((a, b) => a - b)).toEqual([200, 400]);
  expect(await db.select().from(oauthCodes)).toHaveLength(1);
});

test("concurrent exchanges issue at most one token; detected reuse revokes it", async () => {
  const c = await client();
  const code = await grant(c);
  const body = exchangeBody(c, code);
  const responses = await Promise.all([post("/oauth/token", body), post("/oauth/token", body)]);
  expect(responses.map((r) => r.status).toSorted((a, b) => a - b)).toEqual([200, 400]);
  const token = (await responses.find((r) => r.status === 200)!.json()).access_token;
  expect((await verify(token)).status).toBe(401);
});

test("codes cannot move between clients or callback URLs; valid redemption still works", async () => {
  const c = await client();
  const other = await client();
  const code = await grant(c);
  expect((await post("/oauth/token", exchangeBody(other, code))).status).toBe(400);
  expect((await post("/oauth/token", { ...exchangeBody(c, code), redirect_uri: "https://evil.example/" })).status).toBe(
    400,
  );
  expect((await post("/oauth/token", exchangeBody(c, code))).status).toBe(200);
});

test("PKCE cannot be omitted or downgraded after consent", async () => {
  const c = await client();
  const verifier = "a".repeat(43);
  const code = await grant(c, {
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  expect((await post("/oauth/token", exchangeBody(c, code))).status).toBe(400);
  expect((await post("/oauth/token", { ...exchangeBody(c, code), code_verifier: "b".repeat(43) })).status).toBe(400);
  expect((await post("/oauth/token", { ...exchangeBody(c, code), code_verifier: verifier })).status).toBe(200);
});

test("expired consent, codes and tokens fail at the repository boundary", async () => {
  const c = await client();
  const expired = new Date(Date.now() - 60_000);
  const { ticket } = await consent(c);
  await db.update(oauthRequests).set({ expiresAt: expired });
  expect((await post("/api/oauth/authorize", { ticket, decision: "allow" })).status).toBe(400);
  const code = await grant(c);
  await db.update(oauthCodes).set({ expiresAt: expired });
  expect((await post("/oauth/token", exchangeBody(c, code))).status).toBe(400);
  const fresh = await grant(c);
  const token = (await (await post("/oauth/token", exchangeBody(c, fresh))).json()).access_token;
  await db.update(oauthTokens).set({ expiresAt: expired });
  expect((await verify(token)).status).toBe(401);
  await repo.cleanup();
  expect(await db.select().from(oauthRequests)).toHaveLength(0);
  expect(await db.select().from(oauthCodes)).toHaveLength(0);
  expect(await db.select().from(oauthTokens)).toHaveLength(0);
});

test("revocation and disconnect cannot affect another client or owner", async () => {
  const c = await client();
  const other = await client();
  const token = (await (await post("/oauth/token", exchangeBody(c, await grant(c)))).json()).access_token;
  expect((await post("/oauth/revoke", { ...other, token })).status).toBe(200);
  expect((await verify(token)).status).toBe(200);
  const [stored] = await db.select().from(oauthTokens);
  const stranger = await mkUser("other");
  await repo.removeConnection(stored.id, stranger.id);
  expect((await verify(token)).status).toBe(200);
  const response = await app.request(`/api/oauth/connections/${stored.id}`, {
    method: "DELETE",
    headers: { cookie, origin },
  });
  expect(response.status).toBe(200);
  expect((await verify(token)).status).toBe(401);
});

test("suspension and deletion immediately stop identity verification", async () => {
  const c = await client();
  const token = (await (await post("/oauth/token", exchangeBody(c, await grant(c)))).json()).access_token;
  await db.update(users).set({ suspendedAt: new Date() }).where(eq(users.id, userId));
  expect((await verify(token)).status).toBe(401);
  await db.update(users).set({ suspendedAt: null, deletedAt: new Date() }).where(eq(users.id, userId));
  expect((await verify(token)).status).toBe(401);
});

test("cleanup forgets only unused old registrations, preserving previously approved clients", async () => {
  const c = await client();
  const unused = await client();
  await grant(c);
  await db.update(oauthApps).set({ createdAt: new Date(Date.now() - 31 * 86400_000) });
  await db.delete(oauthCodes);
  await repo.cleanup();
  expect(await repo.findApp(c.client_id)).toBeDefined();
  expect(await repo.findApp(unused.client_id)).toBeUndefined();
});
