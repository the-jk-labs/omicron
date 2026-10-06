// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../src/routes/settings/+page.server";
import { apiError } from "../../fakeFetch";
import { event, user } from "../event";

const laptop = { id: "p1", name: "Laptop", backedUp: true, createdAt: "2026-09-01T00:00:00Z" };
const mine = { id: "s1", token: "mine", userAgent: "UA", updatedAt: "2026-09-10T10:00:00Z" };
const phone = { id: "s2", token: "phone", userAgent: "UA", updatedAt: "2026-09-20T10:00:00Z" };
const deno = { slug: "deno", name: "deno", postCount: 3 };
const bob = { id: "u-bob", username: "bob", displayName: "Bob", avatarUrl: null, remote: false };
const ci = { id: "t1", label: "CI", createdAt: "2026-01-01T00:00:00Z", lastUsedAt: null };
const routes = {
  "GET /api/auth/passkey/list-user-passkeys": [laptop],
  "GET /api/auth/list-sessions": [mine, phone],
  "GET /api/auth/get-session": { session: mine, user: { id: "u1" } },
  "GET /api/tags/following": { tags: [deno] },
  "GET /api/users/me/muted": { items: [bob] },
  "GET /api/users/me/blocked": { items: [] },
  "GET /api/webhooks/tokens": { tokens: [ci] },
};
// Better Auth's refusal when the sign-in is older than a day.
const notFresh = Response.json({ code: "SESSION_NOT_FRESH", message: "Session is not fresh" }, { status: 403 });

test("a guest is sent to sign in", async () => {
  await expect(load(event({ routes }).event)).rejects.toMatchObject({ status: 302, location: "/login" });
});

test("a guest's redirect asks the backend for nothing", async () => {
  const { event: e, calls } = event({ routes });
  await expect(load(e)).rejects.toMatchObject({ status: 302 });
  expect(calls).toEqual([]);
});

test("a signed-in user gets every settings list with the page", async () => {
  const me = user();
  expect(await load(event({ routes, user: me }).event)).toEqual({
    user: me,
    passkeys: [laptop],
    sessions: { locked: false, sessions: [mine, phone], currentToken: "mine" },
    followedTags: [deno],
    muted: [bob],
    blocked: [],
    webhookTokens: [ci],
    defaultFeed: null,
  });
});

test("the saved default feed comes with the page, so the switch never flips", async () => {
  const data = await load(event({ routes, user: user(), cookies: { "default-feed": "global" } }).event);
  expect(data).toMatchObject({ defaultFeed: "global" });
  const tampered = await load(event({ routes, user: user(), cookies: { "default-feed": "trending" } }).event);
  expect(tampered).toMatchObject({ defaultFeed: null });
});

test("an older sign-in gets the sessions locked, ready to confirm the password", async () => {
  const data = await load(
    event({ routes: { ...routes, "GET /api/auth/list-sessions": notFresh }, user: user() }).event,
  );
  expect(data).toMatchObject({ sessions: { locked: true } });
});

test("lists that fail to load are left to the browser instead of failing the page", async () => {
  const failing = Object.fromEntries(Object.keys(routes).map((route) => [route, apiError(500)]));
  const data = await load(event({ routes: failing, user: user() }).event);
  expect(data).toMatchObject({
    passkeys: null,
    sessions: null,
    followedTags: null,
    muted: null,
    blocked: null,
    webhookTokens: null,
  });
});

test("a failed current-session read leaves the sessions to the browser too", async () => {
  const data = await load(
    event({ routes: { ...routes, "GET /api/auth/get-session": apiError(500) }, user: user() }).event,
  );
  expect(data).toMatchObject({ sessions: null });
});
