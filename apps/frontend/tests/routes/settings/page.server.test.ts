// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../src/routes/settings/+page.server";
import { apiError } from "../../fakeFetch";
import { event, user } from "../event";

const laptop = { id: "p1", name: "Laptop", backedUp: true, createdAt: "2026-09-01T00:00:00Z" };
const routes = { "GET /api/auth/passkey/list-user-passkeys": [laptop] };

test("a guest is sent to sign in", async () => {
  await expect(load(event({ routes }).event)).rejects.toMatchObject({ status: 302, location: "/login" });
});

test("a signed-in user gets the page data, passkeys included", async () => {
  const me = user();
  expect(await load(event({ routes, user: me }).event)).toEqual({ user: me, passkeys: [laptop] });
});

test("a guest's redirect asks the backend for nothing", async () => {
  const { event: e, calls } = event({ routes });
  await expect(load(e)).rejects.toMatchObject({ status: 302 });
  expect(calls).toEqual([]);
});

test("passkeys that fail to load are left to the browser instead of failing the page", async () => {
  const me = user();
  const failing = { "GET /api/auth/passkey/list-user-passkeys": apiError(500) };
  expect(await load(event({ routes: failing, user: me }).event)).toEqual({ user: me, passkeys: null });
});
