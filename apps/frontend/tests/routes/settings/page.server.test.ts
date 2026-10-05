// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../src/routes/settings/+page.server";
import { apiError } from "../../fakeFetch";
import { event, user } from "../event";

const laptop = { id: "p1", name: "Laptop", backedUp: true, createdAt: "2026-09-01T00:00:00Z" };
const mine = { id: "s1", token: "mine", userAgent: "UA", updatedAt: "2026-09-10T10:00:00Z" };
const phone = { id: "s2", token: "phone", userAgent: "UA", updatedAt: "2026-09-20T10:00:00Z" };
const routes = {
  "GET /api/auth/passkey/list-user-passkeys": [laptop],
  "GET /api/auth/list-sessions": [mine, phone],
  "GET /api/auth/get-session": { session: mine, user: { id: "u1" } },
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

test("a signed-in user gets their passkeys and sessions with the page", async () => {
  const me = user();
  expect(await load(event({ routes, user: me }).event)).toEqual({
    user: me,
    passkeys: [laptop],
    sessions: { locked: false, sessions: [mine, phone], currentToken: "mine" },
  });
});

test("an older sign-in gets the sessions locked, ready to confirm the password", async () => {
  const data = await load(
    event({ routes: { ...routes, "GET /api/auth/list-sessions": notFresh }, user: user() }).event,
  );
  expect(data).toMatchObject({ sessions: { locked: true } });
});

test("lists that fail to load are left to the browser instead of failing the page", async () => {
  const failing = {
    "GET /api/auth/passkey/list-user-passkeys": apiError(500),
    "GET /api/auth/list-sessions": apiError(500),
    "GET /api/auth/get-session": apiError(500),
  };
  const data = await load(event({ routes: failing, user: user() }).event);
  expect(data).toMatchObject({ passkeys: null, sessions: null });
});

test("a failed current-session read leaves the sessions to the browser too", async () => {
  const data = await load(
    event({ routes: { ...routes, "GET /api/auth/get-session": apiError(500) }, user: user() }).event,
  );
  expect(data).toMatchObject({ sessions: null });
});
