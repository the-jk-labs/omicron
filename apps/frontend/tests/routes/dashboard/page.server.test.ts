// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../src/routes/dashboard/+page.server";
import { event, user } from "../event";

const routes = { "GET /api/dashboard": { totals: { views: 3 } } };

test("a guest is sent to sign in", async () => {
  await expect(load(event({ routes }).event)).rejects.toMatchObject({ status: 302, location: "/login" });
});

test("a signed-in user gets the page data", async () => {
  const me = user();
  expect(await load(event({ routes, user: me }).event)).toEqual({ summary: { totals: { views: 3 } }, username: "ada" });
});
