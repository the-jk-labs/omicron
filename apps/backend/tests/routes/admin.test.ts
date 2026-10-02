// SPDX-License-Identifier: AGPL-3.0-or-later
// The admin router's main job at the HTTP layer is the role boundary:
// instance-level settings are admin-only, user/post/report moderation is open
// to moderators too. Every route is checked against every role.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userRow } from "../fixtures.ts";
import { mount } from "./harness.ts";

vi.mock(import("@/services/anubisProtection.ts"));
vi.mock(import("@/services/email.ts"));
vi.mock(import("@/services/emailDns.ts"));
vi.mock(import("@/services/emailSettings.ts"));
vi.mock(import("@/services/instanceSetup.ts"));
vi.mock(import("@/services/media.ts"));
vi.mock(import("@/services/moderation.ts"));
vi.mock(import("@/services/seo.ts"));
vi.mock(import("@/services/settings.ts"));
vi.mock(import("@/services/tags.ts"));
vi.mock(import("@/services/unsplash.ts"));
import { adminRoutes } from "@/routes/admin.ts";
import * as anubis from "@/services/anubisProtection.ts";
import { sendTestEmail } from "@/services/email.ts";
import { verifyRecords } from "@/services/emailDns.ts";
import * as emailSettings from "@/services/emailSettings.ts";
import * as setup from "@/services/instanceSetup.ts";
import * as mediaService from "@/services/media.ts";
import * as moderation from "@/services/moderation.ts";
import * as seo from "@/services/seo.ts";
import * as settings from "@/services/settings.ts";

const api = mount("/api/admin", adminRoutes);
const UUID = "0b0e7c4e-5d2a-4e0f-9f53-5f5a4f0d3a11";

type Level = "admin" | "moderator";
type Route = [method: string, path: string, body: unknown, level: Level];

const routes: Route[] = [
  ["GET", "/settings", undefined, "admin"],
  ["PUT", "/settings/analytics", { onInstanceViews: true }, "admin"],
  ["GET", "/security", undefined, "admin"],
  ["PUT", "/security/anubis", { anubisProtection: true }, "admin"],
  ["GET", "/seo", undefined, "admin"],
  ["PUT", "/seo", { indexingEnabled: false }, "admin"],
  ["GET", "/unsplash", undefined, "admin"],
  ["PUT", "/unsplash", { accessKey: "k" }, "admin"],
  ["GET", "/instance", undefined, "admin"],
  ["PUT", "/instance", { appName: "X" }, "admin"],
  ["POST", "/instance/banner", "raw", "admin"],
  ["DELETE", "/instance/banner", undefined, "admin"],
  ["GET", "/email", undefined, "admin"],
  ["PUT", "/email", { mode: "console" }, "admin"],
  ["POST", "/email/dkim", { domain: "mail.example" }, "admin"],
  ["GET", "/email/dns", undefined, "admin"],
  ["GET", "/email/port25", undefined, "admin"],
  ["POST", "/email/test", { to: "a@x.test" }, "admin"],
  ["POST", `/users/${UUID}/role`, { makeAdmin: true, password: "p" }, "admin"],
  ["POST", `/users/${UUID}/moderator-role`, { makeModerator: true, password: "p" }, "admin"],
  ["GET", "/domains", undefined, "admin"],
  ["POST", "/domains", { domain: "bad.example" }, "admin"],
  ["DELETE", "/domains/bad.example", undefined, "admin"],
  ["GET", "/tags/aliases", undefined, "admin"],
  ["POST", "/tags/alias", { alias: "js", target: "javascript" }, "admin"],
  ["POST", "/tags/merge", { from: "a", to: "b" }, "admin"],
  ["GET", "/users", undefined, "moderator"],
  ["POST", `/users/${UUID}/suspend`, { suspend: true }, "moderator"],
  ["POST", `/users/${UUID}/delete`, { username: "ada", password: "p" }, "moderator"],
  ["POST", `/users/${UUID}/restore`, {}, "moderator"],
  ["GET", "/users/deleted", undefined, "moderator"],
  ["DELETE", `/users/deleted/${UUID}`, undefined, "admin"],
  ["GET", `/users/${UUID}`, undefined, "moderator"],
  ["PATCH", `/users/${UUID}`, { bio: "x" }, "moderator"],
  ["POST", `/users/${UUID}/avatar`, "raw", "moderator"],
  ["DELETE", `/users/${UUID}/avatar`, undefined, "moderator"],
  ["POST", `/users/${UUID}/verification-email`, undefined, "moderator"],
  ["POST", `/users/${UUID}/verify`, undefined, "moderator"],
  ["DELETE", `/posts/${UUID}`, undefined, "moderator"],
  ["GET", "/reports", undefined, "moderator"],
  ["POST", `/reports/${UUID}/resolve`, {}, "moderator"],
];

function call([method, path, body]: Route) {
  const url = `/api/admin${path}`;
  if (body === undefined) return api.request(url, { method });
  if (body === "raw") {
    return api.request(url, { method, headers: { "content-type": "image/png" }, body: new Uint8Array([1]) });
  }
  return api.json(url, method, body);
}

beforeEach(() => {
  api.signOut();
  // Every service resolves to something serializable; the role check is what's under test.
  vi.mocked(moderation.listUsers).mockResolvedValue({ users: [], nextCursor: null });
  vi.mocked(moderation.listDeletedUsers).mockResolvedValue({ users: [], nextCursor: null });
  vi.mocked(moderation.getUserDetail).mockResolvedValue({
    user: userRow(),
    postCounts: { draft: 0, scheduled: 0, published: 0 },
    followCounts: { followers: 0, following: 0 },
    recentPosts: [],
    reports: [],
    tags: [],
    links: [],
  });
  vi.mocked(moderation.updateUserDetails).mockResolvedValue(userRow());
  vi.mocked(moderation.setUserAvatar).mockResolvedValue(userRow());
  vi.mocked(moderation.removeUserAvatar).mockResolvedValue(userRow());
  vi.mocked(moderation.listReports).mockResolvedValue([]);
  vi.mocked(moderation.blockDomain).mockResolvedValue({ domain: "bad.example", purged: 0 });
  vi.mocked(emailSettings.ensureDkimKeys).mockResolvedValue({ selector: "omicron", publicKey: "PUB" });
  vi.mocked(emailSettings.getEmailConfig).mockResolvedValue({
    dkim: { domain: "mail.example", selector: "omicron", publicKey: "PUB" },
  } as never);
  vi.mocked(mediaService.saveImage).mockResolvedValue("/api/uploads/b.png");
  vi.mocked(seo.getSeoSettings).mockResolvedValue({} as never);
});

describe("role boundary", () => {
  test.for([
    [null, 401],
    [{}, 403],
    [{ isModerator: true }, 403],
  ] as const)("rotate-secret as %o is %i", async ([user, status]) => {
    if (user) api.signIn(user);
    expect((await api.request("/api/admin/instance/rotate-secret", { method: "POST" })).status).toBe(status);
  });

  test.for(routes)("%s %s: anonymous is 401", async (route) => {
    expect((await call(route)).status).toBe(401);
  });

  test.for(routes)("%s %s: a regular account is 403", async (route) => {
    api.signIn();
    expect((await call(route)).status).toBe(403);
  });

  test.for(routes.filter((r) => r[3] === "admin"))("%s %s: a moderator is 403 (admin only)", async (route) => {
    api.signIn({ isModerator: true });
    const res = await call(route);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin access required." });
  });

  test.for(routes.filter((r) => r[3] === "moderator"))("%s %s: a moderator is allowed", async (route) => {
    api.signIn({ isModerator: true });
    expect((await call(route)).status).toBeLessThan(300);
  });

  test.for(routes)("%s %s: an admin is allowed", async (route) => {
    api.signIn({ isAdmin: true });
    expect((await call(route)).status).toBeLessThan(300);
  });

  test("purging a deleted account needs more than a moderator session", async () => {
    api.signIn({ isModerator: true });
    vi.mocked(moderation.purgeDeletedUser).mockResolvedValue();
    const res = await api.request(`/api/admin/users/deleted/${UUID}`, { method: "DELETE" });
    expect(res.status).not.toBe(200);
  });
});

describe("admin endpoints", () => {
  beforeEach(() => {
    api.signIn({ id: "admin", isAdmin: true });
  });

  test("analytics toggle validates and echoes", async () => {
    expect(await (await api.json("/api/admin/settings/analytics", "PUT", { onInstanceViews: false })).json()).toEqual({
      onInstanceViews: false,
    });
    expect(settings.setOnInstanceViewsEnabled).toHaveBeenCalledWith(false);
    const bad = await api.json("/api/admin/settings/analytics", "PUT", { onInstanceViews: "no" });
    expect(await bad.json()).toEqual({ error: "Expected { onInstanceViews: boolean }." });
  });

  test("a failed Anubis toggle becomes a 400 with Caddy's reason", async () => {
    vi.mocked(anubis.setAnubisProtectionEnabled).mockRejectedValue(new Error("Caddy rejected the config."));
    const res = await api.json("/api/admin/security/anubis", "PUT", { anubisProtection: true });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Caddy rejected the config." });
  });

  test("instance update saves identity and the federation toggle", async () => {
    await api.json("/api/admin/instance", "PUT", { appName: " X ", federationEnabled: false });
    expect(setup.setInstanceIdentity).toHaveBeenCalledWith({ appName: "X", federationEnabled: false });
    expect(setup.setFederationEnabled).toHaveBeenCalledWith(false);
    expect((await api.json("/api/admin/instance", "PUT", { appName: "" })).status).toBe(400);
    expect((await api.json("/api/admin/instance", "PUT", { bannerText: "x".repeat(281) })).status).toBe(400);
  });

  test("banner upload stores the image and the URL", async () => {
    const res = await api.request("/api/admin/instance/banner", {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: new Uint8Array([1, 2]),
    });
    expect(res.status).toBe(201);
    expect(mediaService.saveImage).toHaveBeenCalledWith("admin", new Uint8Array([1, 2]), "image/png");
    expect(setup.setBannerImageUrl).toHaveBeenCalledWith("/api/uploads/b.png");
  });

  test("rotation of an env-pinned session secret is refused with a 400", async () => {
    // tests/test.env pins SESSION_SECRET, which is exactly the refused case.
    const res = await api.request("/api/admin/instance/rotate-secret", { method: "POST" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("pinned");
  });

  test("DKIM keys are generated for the lower-cased domain", async () => {
    const body = await (await api.json("/api/admin/email/dkim", "POST", { domain: "Mail.Example" })).json();
    expect(emailSettings.ensureDkimKeys).toHaveBeenCalledWith("mail.example");
    expect(body).toMatchObject({ domain: "mail.example", selector: "omicron" });
    expect(body.records.dkim.host).toBe("omicron._domainkey.mail.example");
  });

  test("the DNS check needs a key first", async () => {
    vi.mocked(emailSettings.getEmailConfig).mockResolvedValue({ dkim: { selector: "omicron" } } as never);
    expect((await api.request("/api/admin/email/dns")).status).toBe(400);
    expect(verifyRecords).not.toHaveBeenCalled();
  });

  test("a failed test email is a 400 with the transport error", async () => {
    vi.mocked(sendTestEmail).mockRejectedValue(new Error("535 auth failed"));
    const res = await api.json("/api/admin/email/test", "POST", { to: "a@x.test" });
    expect(await res.json()).toEqual({ error: "Could not send the test email: 535 auth failed" });
    expect((await api.json("/api/admin/email/test", "POST", { to: "nope" })).status).toBe(400);
  });

  test("role changes pass the target, flag and password", async () => {
    await api.json(`/api/admin/users/${UUID}/role`, "POST", { makeAdmin: false, password: "pw", notify: true });
    expect(moderation.setAdminRole).toHaveBeenCalledWith("admin", UUID, {
      makeAdmin: false,
      password: "pw",
      notify: true,
    });
    expect((await api.json(`/api/admin/users/${UUID}/role`, "POST", { makeAdmin: true, password: "" })).status).toBe(
      400,
    );
  });

  test("blocking a domain answers 201 with the purge count", async () => {
    const res = await api.json("/api/admin/domains", "POST", { domain: "bad.example", reason: "spam" });
    expect(res.status).toBe(201);
    expect(moderation.blockDomain).toHaveBeenCalledWith("bad.example", "spam");
  });
});

describe("moderator endpoints", () => {
  beforeEach(() => {
    api.signIn({ id: "mod", isModerator: true });
  });

  test("the user table parses filters, sort, cursor and limit", async () => {
    vi.mocked(moderation.countUsers).mockResolvedValue(10);
    vi.mocked(moderation.countFilteredUsers).mockResolvedValue(3);
    const body = await (
      await api.request("/api/admin/users?q=ada&suspended=true&admin=false&verified=maybe&sort=username&limit=5")
    ).json();
    expect(body).toEqual({ users: [], nextCursor: null, total: 10, filteredTotal: 3 });
    expect(moderation.listUsers).toHaveBeenCalledWith(
      "ada",
      { suspended: true, admin: false, verified: undefined },
      null,
      5,
      "username",
    );
  });

  test("an unknown sort is 'newest'", async () => {
    await api.request("/api/admin/users?sort=random");
    expect(vi.mocked(moderation.listUsers).mock.calls[0][4]).toBe("newest");
  });

  test("the user table never exposes credentials", async () => {
    vi.mocked(moderation.listUsers).mockResolvedValue({
      users: [userRow({ passwordHash: "hash", actorKeyPair: { publicKey: "x" } as never })],
      nextCursor: null,
    });
    const json = JSON.stringify(await (await api.request("/api/admin/users")).json());
    expect(json).not.toContain("hash");
    expect(json).not.toContain("publicKey");
  });

  test("suspend validates and passes notify", async () => {
    await api.json(`/api/admin/users/${UUID}/suspend`, "POST", { suspend: true, notify: true });
    expect(moderation.setSuspended).toHaveBeenCalledWith("mod", UUID, true, { notify: true });
    expect((await api.json(`/api/admin/users/${UUID}/suspend`, "POST", {})).status).toBe(400);
  });

  test("delete requires the typed username and a password", async () => {
    const res = await api.json(`/api/admin/users/${UUID}/delete`, "POST", { username: " ", password: "p" });
    expect(await res.json()).toEqual({ error: "username: Type the account's username to confirm." });
    expect(moderation.deleteUser).not.toHaveBeenCalled();
  });

  test("restore and resolve tolerate an empty body", async () => {
    await api.request(`/api/admin/users/${UUID}/restore`, { method: "POST" });
    expect(moderation.restoreUser).toHaveBeenCalledWith(UUID, { notify: undefined });
    await api.request(`/api/admin/reports/${UUID}/resolve`, { method: "POST" });
    expect(moderation.resolveReport).toHaveBeenCalledWith("mod", UUID, "");
  });

  test("reports can be filtered by status; junk means all", async () => {
    vi.mocked(moderation.openReportCount).mockResolvedValue(2);
    expect(await (await api.request("/api/admin/reports?status=open")).json()).toEqual({ reports: [], openCount: 2 });
    expect(moderation.listReports).toHaveBeenLastCalledWith("open");
    await api.request("/api/admin/reports?status=everything");
    expect(moderation.listReports).toHaveBeenLastCalledWith(undefined);
  });

  test("post removal passes the notify flag", async () => {
    await api.request(`/api/admin/posts/${UUID}?notify=true`, { method: "DELETE" });
    expect(moderation.removePost).toHaveBeenCalledWith(UUID, "mod", { notify: true });
  });

  test("'deleted' is never read as a user id", async () => {
    await api.request("/api/admin/users/deleted");
    expect(moderation.getUserDetail).not.toHaveBeenCalled();
    expect(moderation.listDeletedUsers).toHaveBeenCalled();
  });
});
