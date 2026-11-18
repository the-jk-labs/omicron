// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../src/routes/admin/+page.server";
import { apiError } from "../../fakeFetch";
import { event, user } from "../event";

const queue = { reports: [], openCount: 0 };
const email = { mode: "console", from: "" };
const listed = (users: unknown[]) => ({ users, nextCursor: null, total: users.length, filteredTotal: users.length });
const routes = {
  "GET /api/admin/reports?status=open": queue,
  "GET /api/admin/email": email,
  "GET /api/admin/users": listed([{ id: "u1" }]),
  "GET /api/admin/users/deleted": listed([]),
  "GET /api/admin/instance": { appName: "Omicron" },
  "GET /api/admin/settings": { onInstanceViews: true },
  "GET /api/admin/umami": { enabled: false, websiteId: "" },
  "GET /api/admin/email-change-requests": { items: [] },
};

test("a guest is sent to sign in", async () => {
  await expect(load(event().event)).rejects.toMatchObject({ status: 302, location: "/login" });
});

test("a regular user is forbidden", async () => {
  await expect(load(event({ user: user() }).event)).rejects.toMatchObject({ status: 403 });
});

test.for([{ isAdmin: true }, { isModerator: true }])("staff (%o) get in, on Reports by default", async (role) => {
  const me = user(role);
  expect(await load(event({ user: me, routes }).event)).toEqual({
    user: me,
    tab: "reports",
    initial: { reports: queue },
    needsTwoFactor: false,
  });
});

const at = (tab: string) =>
  event({ user: user({ isAdmin: true }), routes, url: `https://blog.example/admin?tab=${tab}` });

// Loaded in the browser before, every tab showed "Loading…" on each refresh.
test("the tab in ?tab= is the one loaded with the page", async () => {
  expect(await load(at("email").event)).toMatchObject({ tab: "email", initial: { email } });
  expect(await load(at("users").event)).toMatchObject({
    tab: "users",
    initial: { users: { users: listed([{ id: "u1" }]), deleted: listed([]), emailChanges: [] } },
  });
  expect(await load(at("settings").event)).toMatchObject({
    initial: {
      instance: { identity: { appName: "Omicron" }, settings: { onInstanceViews: true } },
      umami: { enabled: false, websiteId: "" },
    },
  });
  expect(await load(at("nonsense").event)).toMatchObject({ tab: "reports", initial: { reports: queue } });
});

test("a moderator on an admin-only tab gets the tab but none of its data", async () => {
  const { event: e, calls } = event({
    user: user({ isModerator: true }),
    routes,
    url: "https://blog.example/admin?tab=email",
  });
  expect(await load(e)).toEqual({
    user: user({ isModerator: true }),
    tab: "email",
    initial: {},
    needsTwoFactor: false,
  });
  expect(calls).toEqual([]);
});

// Rendered with the page, so no moderation data ever flashes before the setup screen.
test("staff who must set up two-factor get only the setup screen, and nothing is loaded", async () => {
  const { event: e, calls } = event({
    user: user({ isModerator: true, twoFactorRequired: true, twoFactorEnabled: false }),
    routes,
  });
  expect(await load(e)).toMatchObject({ needsTwoFactor: true, initial: {} });
  expect(calls).toEqual([]);
});

test("once it's on, they get the moderation tools", async () => {
  const me = user({ isAdmin: true, twoFactorRequired: true, twoFactorEnabled: true });
  expect(await load(event({ user: me, routes }).event)).toMatchObject({
    needsTwoFactor: false,
    initial: { reports: queue },
  });
});

test("a moderator's Users tab doesn't ask for the admins' email-change queue", async () => {
  const { event: e, calls } = event({
    user: user({ isModerator: true }),
    routes,
    url: "https://blog.example/admin?tab=users",
  });
  expect(await load(e)).toMatchObject({ initial: { users: { emailChanges: null } } });
  expect(calls.map((c) => c.path)).not.toContain("/api/admin/email-change-requests");
});

test("a tab that fails to load is left to the browser", async () => {
  const failing = { "GET /api/admin/reports?status=open": apiError(500) };
  expect(await load(event({ user: user({ isAdmin: true }), routes: failing }).event)).toMatchObject({
    initial: { reports: null },
  });
});
