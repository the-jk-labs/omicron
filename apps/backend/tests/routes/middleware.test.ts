// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { beforeEach, expect, test, vi } from "vitest";
import { userRow } from "../fixtures.ts";

const getSession = vi.hoisted(() => vi.fn<(a: { query?: { disableCookieCache?: boolean } }) => Promise<unknown>>());
const verifyJWT = vi.hoisted(() => vi.fn<(a: { body: { token: string } }) => Promise<unknown>>());
vi.mock("@/auth/auth.ts", () => ({ auth: { api: { getSession, verifyJWT } } }));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/instanceSetup.ts"));
vi.mock(import("@/services/oauth.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, accessIdentity: vi.fn<typeof actual.accessIdentity>() };
});

import * as usersRepo from "@/db/repositories/users.ts";
import { handleError } from "@/lib/http.ts";
import { sessionMiddleware } from "@/routes/middleware.ts";
import type { AppEnv } from "@/routes/types.ts";
import { getOrigin } from "@/services/instanceSetup.ts";

const origin = "https://blog.example.test";
const app = new Hono<AppEnv>().onError(handleError);
app.use("/api/*", sessionMiddleware);
app.all("/api/*", (c) => c.json({ user: c.get("user")?.id ?? null }));

const skipsCache = () => getSession.mock.calls.at(-1)?.[0].query?.disableCookieCache === true;

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "u1" }, session: {} });
  verifyJWT.mockReset();
  vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "u1" }));
  vi.mocked(getOrigin).mockResolvedValue(origin);
});

// Every page load asks /api/me who is signed in; a session ended elsewhere
// (sign out other devices, an email-change undo) must not survive a reload.
test("the signed-in identity is always read from the database", async () => {
  await app.request("/api/me");
  expect(skipsCache()).toBe(true);
});

test.each(["POST", "PUT", "PATCH", "DELETE"])("a %s is authorized against the database", async (method) => {
  await app.request("/api/posts", { method, headers: { origin } });
  expect(skipsCache()).toBe(true);
});

test("ordinary reads may use Better Auth's short-lived cookie cache", async () => {
  await app.request("/api/feed");
  expect(skipsCache()).toBe(false);
});

test("a session the database no longer has is signed out", async () => {
  getSession.mockResolvedValue(null);
  const res = await app.request("/api/me");
  expect(await res.json()).toEqual({ user: null });
  expect(usersRepo.findById).not.toHaveBeenCalled();
});

test("a valid JWT resolves the current user without reading a cookie session", async () => {
  verifyJWT.mockResolvedValue({ payload: { sub: "u1" } });

  const res = await app.request("/api/feed", { headers: { Authorization: "Bearer signed.jwt.token" } });

  expect(await res.json()).toEqual({ user: "u1" });
  expect(verifyJWT).toHaveBeenCalledWith({ body: { token: "signed.jwt.token" } });
  expect(getSession).not.toHaveBeenCalled();
});

test("an invalid JWT never falls back to a cookie session", async () => {
  verifyJWT.mockRejectedValue(new Error("invalid token"));

  const res = await app.request("/api/feed", { headers: { Authorization: "Bearer invalid.jwt.token" } });

  expect(await res.json()).toEqual({ user: null });
  expect(getSession).not.toHaveBeenCalled();
});

test.for(["POST", "PUT", "PATCH", "DELETE"])(
  "cookie-authenticated %s rejects untrusted or missing origins",
  async (method) => {
    for (const value of [
      undefined,
      "null",
      "https://untrusted.example.test",
      "https://blog.example.test:8443",
      "http://blog.example.test",
      "https://blog.example.test.evil.test",
    ]) {
      const headers = new Headers({ cookie: "session=fixture" });
      if (value !== undefined) headers.set("origin", value);
      const response = await app.request("/api/posts", { method, headers });
      expect(response.status, `${method} Origin: ${value}`).toBe(403);
      expect(await response.json()).toEqual({ error: "A same-origin request is required." });
    }
  },
);

test.for(["POST", "PUT", "PATCH", "DELETE"])(
  "cookie-authenticated %s permits the configured origin",
  async (method) => {
    const response = await app.request("/api/posts", { method, headers: { cookie: "session=fixture", origin } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: "u1" });
  },
);

test.for([undefined, "application/x-www-form-urlencoded", "text/plain", "application/json", "image/png"])(
  "cookie-write origin validation does not depend on content type %o",
  async (contentType) => {
    const headers = new Headers({ cookie: "session=fixture", origin: "https://untrusted.example.test" });
    if (contentType) headers.set("content-type", contentType);
    expect((await app.request("/api/posts", { method: "POST", headers })).status).toBe(403);
  },
);

test.for(["GET", "HEAD", "OPTIONS"])("cookie-authenticated %s remains available without an origin", async (method) => {
  expect((await app.request("/api/feed", { method, headers: { cookie: "session=fixture" } })).status).toBe(200);
  expect(getOrigin).not.toHaveBeenCalled();
});

test.for(["POST", "PUT", "PATCH", "DELETE"])(
  "bearer JWT %s remains independent of cookies and origins",
  async (method) => {
    verifyJWT.mockResolvedValue({ payload: { sub: "u1" } });
    for (const value of [undefined, "https://client.example"]) {
      const headers = new Headers({ authorization: "Bearer signed.jwt.token", cookie: "session=fixture" });
      if (value) headers.set("origin", value);
      const response = await app.request("/api/posts", { method, headers });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ user: "u1" });
    }
    expect(getSession).not.toHaveBeenCalled();
    expect(getOrigin).not.toHaveBeenCalled();
  },
);

test("non-bearer authorization cannot bypass the cookie-write origin check", async () => {
  const response = await app.request("/api/posts", {
    method: "POST",
    headers: {
      cookie: "session=fixture",
      authorization: "Basic Zml4dHVyZQ==",
      origin: "https://untrusted.example.test",
    },
  });
  expect(response.status).toBe(403);
});

test("request and forwarded hosts cannot redefine the trusted cookie-write origin", async () => {
  const response = await app.request("https://untrusted.example.test/api/posts", {
    method: "POST",
    headers: {
      cookie: "session=fixture",
      origin: "https://untrusted.example.test",
      host: "untrusted.example.test",
      "x-forwarded-host": "untrusted.example.test",
      "x-forwarded-proto": "https",
    },
  });
  expect(response.status).toBe(403);
});

test("anonymous writes are left to the endpoint's own authentication", async () => {
  getSession.mockResolvedValue(null);
  const response = await app.request("/api/posts", { method: "POST", headers: { origin: "https://client.example" } });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ user: null });
  expect(getOrigin).not.toHaveBeenCalled();
});
