// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { beforeEach, expect, test, vi } from "vitest";
import { userRow } from "../fixtures.ts";

const getSession = vi.hoisted(() => vi.fn<(a: { query?: { disableCookieCache?: boolean } }) => Promise<unknown>>());
const verifyJWT = vi.hoisted(() => vi.fn<(a: { body: { token: string } }) => Promise<unknown>>());
vi.mock("@/auth/auth.ts", () => ({ auth: { api: { getSession, verifyJWT } } }));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/oauth.ts"));

import * as usersRepo from "@/db/repositories/users.ts";
import { sessionMiddleware } from "@/routes/middleware.ts";
import type { AppEnv } from "@/routes/types.ts";

const app = new Hono<AppEnv>();
app.use("/api/*", sessionMiddleware);
app.all("/api/*", (c) => c.json({ user: c.get("user")?.id ?? null }));

const skipsCache = () => getSession.mock.calls.at(-1)?.[0].query?.disableCookieCache === true;

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "u1" }, session: {} });
  verifyJWT.mockReset();
  vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "u1" }));
});

// Every page load asks /api/me who is signed in; a session ended elsewhere
// (sign out other devices, an email-change undo) must not survive a reload.
test("the signed-in identity is always read from the database", async () => {
  await app.request("/api/me");
  expect(skipsCache()).toBe(true);
});

test.each(["POST", "PUT", "PATCH", "DELETE"])("a %s is authorized against the database", async (method) => {
  await app.request("/api/posts", { method });
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
