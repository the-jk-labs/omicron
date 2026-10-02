// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../src/routes/admin/+page.server";
import { event, user } from "../event";

test("a guest is sent to sign in", async () => {
  await expect(load(event().event)).rejects.toMatchObject({ status: 302, location: "/login" });
});

test("a regular user is forbidden", async () => {
  await expect(load(event({ user: user() }).event)).rejects.toMatchObject({ status: 403 });
});

test.for([{ isAdmin: true }, { isModerator: true }])("staff (%o) get in", async (role) => {
  const me = user(role);
  expect(await load(event({ user: me }).event)).toEqual({ user: me });
});
