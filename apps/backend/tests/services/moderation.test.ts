// SPDX-License-Identifier: AGPL-3.0-or-later
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { postWithAuthor, remotePostWithAuthor, userRow, uuid } from "../fixtures.ts";

vi.mock(import("@/db/repositories/accounts.ts"));
vi.mock(import("@/db/repositories/blockedDomains.ts"));
vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/db/repositories/instanceSettings.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/profileLinks.ts"));
vi.mock(import("@/db/repositories/remoteActors.ts"));
vi.mock(import("@/db/repositories/reports.ts"));
vi.mock(import("@/db/repositories/sessions.ts"));
vi.mock(import("@/db/repositories/tags.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/accountNotices.ts"));
vi.mock(import("@/services/users.ts"));
vi.mock(import("@/federation/outbound.ts"));
vi.mock(import("@/auth/auth.ts"), () => ({
  auth: { api: { sendVerificationEmail: vi.fn<(...args: unknown[]) => Promise<unknown>>() } } as never,
}));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import { auth } from "@/auth/auth.ts";
import { config } from "@/config.ts";
import * as accountsRepo from "@/db/repositories/accounts.ts";
import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as linksRepo from "@/db/repositories/profileLinks.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as reportsRepo from "@/db/repositories/reports.ts";
import * as sessionsRepo from "@/db/repositories/sessions.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import type { User } from "@/db/schema.ts";
import { sendActorDelete } from "@/federation/outbound.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { queue } from "@/queue/queue.ts";
import * as notices from "@/services/accountNotices.ts";
import { seedFederationRunning } from "@/services/federationState.ts";
import * as mod from "@/services/moderation.ts";
import * as usersService from "@/services/users.ts";

const PASSWORD = "correct horse battery staple";
const HASH = bcrypt.hashSync(PASSWORD, 4);

const admin = userRow({ id: "admin", username: "root", isAdmin: true });
const admin2 = userRow({ id: "admin2", username: "root2", isAdmin: true });
const moderator = userRow({ id: "mod", username: "mod", isModerator: true });
const moderator2 = userRow({ id: "mod2", username: "mod2", isModerator: true });
const regular = userRow({ id: "user", username: "ada", email: "ada@x.test" });
const deleted = userRow({ id: "gone", username: "gone", deletedAt: new Date("2026-01-01T00:00:00Z") });

function accounts(...users: User[]) {
  const byId = new Map(users.map((u) => [u.id, u]));
  vi.mocked(usersRepo.findById).mockImplementation((async (id: string) => byId.get(id)) as never);
}

let originalDomain: string;

beforeEach(() => {
  originalDomain = config.APP_DOMAIN;
  accounts(admin, admin2, moderator, moderator2, regular, deleted);
  vi.mocked(accountsRepo.findCredentialHashByUserId).mockResolvedValue(HASH);
  vi.mocked(usersRepo.countAdmins).mockResolvedValue(2);
  vi.mocked(reportsRepo.hasOpenDuplicate).mockResolvedValue(false);
  seedFederationRunning(false);
});

afterEach(() => {
  config.APP_DOMAIN = originalDomain;
});

describe("report", () => {
  test("files a trimmed, capped report against a post", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1" }));
    await mod.report("user", { subjectType: "post", subjectId: "p1", reason: `  ${"x".repeat(1200)}  ` });
    expect(reportsRepo.create).toHaveBeenCalledWith({
      reporterId: "user",
      subjectType: "post",
      postId: "p1",
      userId: null,
      reason: "x".repeat(1000),
    });
  });

  test("files a report against an account", async () => {
    await mod.report("mod", { subjectType: "user", subjectId: "user" });
    expect(reportsRepo.create).toHaveBeenCalledWith({
      reporterId: "mod",
      subjectType: "user",
      postId: null,
      userId: "user",
      reason: "",
    });
  });

  test("a duplicate open report is silently accepted, not stored twice", async () => {
    vi.mocked(reportsRepo.hasOpenDuplicate).mockResolvedValue(true);
    await expect(mod.report("mod", { subjectType: "user", subjectId: "user" })).resolves.toBeUndefined();
    expect(reportsRepo.create).not.toHaveBeenCalled();
  });

  test("refuses unknown subjects, missing targets and self-reports", async () => {
    await expect(mod.report("user", { subjectType: "comment" as never, subjectId: "x" })).rejects.toMatchObject({
      status: 400,
    });
    vi.mocked(postsRepo.findById).mockResolvedValue(null);
    await expect(mod.report("user", { subjectType: "post", subjectId: "nope" })).rejects.toMatchObject({ status: 404 });
    await expect(mod.report("user", { subjectType: "user", subjectId: "nobody" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(mod.report("user", { subjectType: "user", subjectId: "user" })).rejects.toMatchObject({
      status: 400,
      message: "You can't report yourself.",
    });
  });
});

describe("reports queue", () => {
  test("list, count and resolve", async () => {
    vi.mocked(reportsRepo.list).mockResolvedValue([]);
    vi.mocked(reportsRepo.countOpen).mockResolvedValue(3);
    await mod.listReports("open");
    expect(reportsRepo.list).toHaveBeenCalledWith("open");
    expect(await mod.openReportCount()).toBe(3);
  });

  test("resolving trims and caps the resolution", async () => {
    vi.mocked(reportsRepo.findById).mockResolvedValue({ id: "r1", status: "open" } as never);
    await mod.resolveReport("mod", "r1", `  ${"y".repeat(1100)} `);
    expect(reportsRepo.resolve).toHaveBeenCalledWith("r1", "mod", "y".repeat(1000));
  });

  test("resolving twice is a no-op; an unknown report is 404", async () => {
    vi.mocked(reportsRepo.findById).mockResolvedValue({ id: "r1", status: "resolved" } as never);
    await mod.resolveReport("mod", "r1", "again");
    expect(reportsRepo.resolve).not.toHaveBeenCalled();
    vi.mocked(reportsRepo.findById).mockResolvedValue(undefined);
    await expect(mod.resolveReport("mod", "x", "")).rejects.toMatchObject({ status: 404 });
  });
});

const userRows = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    userRow({ id: `u${i}`, username: `user${i}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) }),
  );

describe("listUsers", () => {
  beforeEach(() => {
    vi.mocked(usersRepo.encodeAdminCursor).mockImplementation((c) => JSON.stringify(c));
  });

  test("clamps the page size between 1 and the maximum", async () => {
    vi.mocked(usersRepo.listForAdmin).mockResolvedValue([]);
    for (const [asked, used] of [
      [0, usersRepo.ADMIN_USERS_PAGE_SIZE],
      [-5, 1],
      [10, 10],
      [10_000, usersRepo.ADMIN_USERS_MAX_PAGE_SIZE],
      [Number.NaN, usersRepo.ADMIN_USERS_PAGE_SIZE],
    ]) {
      await mod.listUsers("", {}, null, asked);
      expect(vi.mocked(usersRepo.listForAdmin).mock.lastCall?.[3]).toBe(used);
    }
  });

  test("mints a time cursor by default and a username cursor when sorted by name", async () => {
    vi.mocked(usersRepo.listForAdmin).mockResolvedValue(userRows(3));
    const byTime = await mod.listUsers("", {}, null, 2);
    expect(byTime.users).toHaveLength(2);
    expect(JSON.parse(byTime.nextCursor!)).toEqual({
      v: "t",
      createdAt: userRows(3)[1].createdAt.toISOString(),
      id: "u1",
    });
    const byName = await mod.listUsers("", {}, null, 2, "username");
    expect(JSON.parse(byName.nextCursor!)).toEqual({ v: "u", username: "user1", id: "u1" });
  });

  test("the last page has no cursor; counts delegate", async () => {
    vi.mocked(usersRepo.listForAdmin).mockResolvedValue(userRows(2));
    expect((await mod.listUsers("", {}, null, 2)).nextCursor).toBe(null);
    vi.mocked(usersRepo.countFiltered).mockResolvedValue(7);
    vi.mocked(usersRepo.countUsers).mockResolvedValue(9);
    expect(await mod.countFilteredUsers("a", { role: "admin" } as never)).toBe(7);
    expect(await mod.countUsers()).toBe(9);
  });
});

describe("setSuspended", () => {
  test("suspends, signs the account out everywhere and notifies on opt-in", async () => {
    await mod.setSuspended("mod", "user", true, { notify: true });
    expect(vi.mocked(usersRepo.setSuspended).mock.calls[0][1]).toBeInstanceOf(Date);
    expect(sessionsRepo.removeAllForUser).toHaveBeenCalledWith("user");
    expect(notices.notifySuspended).toHaveBeenCalledWith("ada@x.test", "ada");
  });

  test("reinstating clears the timestamp and keeps sessions", async () => {
    await mod.setSuspended("mod", "user", false, { notify: true });
    expect(usersRepo.setSuspended).toHaveBeenCalledWith("user", null);
    expect(sessionsRepo.removeAllForUser).not.toHaveBeenCalled();
    expect(notices.notifyReinstated).toHaveBeenCalledWith("ada@x.test", "ada");
  });

  test("is silent without opt-in", async () => {
    await mod.setSuspended("mod", "user", true);
    expect(notices.notifySuspended).not.toHaveBeenCalled();
  });

  test.for([
    ["admin", "admin", "You can't suspend your own account."],
    ["admin", "admin2", "You can't moderate another admin."],
    ["mod", "admin", "You can't moderate another admin."],
    ["mod", "mod2", "Only admins can moderate another moderator."],
    ["user", "mod", "Moderator access required."],
  ])("%s may not suspend %s", async ([actor, target, message]) => {
    await expect(mod.setSuspended(actor, target, true)).rejects.toMatchObject({ status: 403, message });
    expect(usersRepo.setSuspended).not.toHaveBeenCalled();
  });

  test("an admin may suspend a moderator", async () => {
    await mod.setSuspended("admin", "mod", true);
    expect(usersRepo.setSuspended).toHaveBeenCalled();
  });

  test("an unknown target is 404", async () => {
    await expect(mod.setSuspended("admin", "nobody", true)).rejects.toMatchObject({ status: 404 });
  });
});

describe.each([
  ["setAdminRole", "makeAdmin", mod.setAdminRole],
  ["setModeratorRole", "makeModerator", mod.setModeratorRole],
] as const)("%s", (_name, flag, fn) => {
  const input = (on: boolean, password = PASSWORD) => ({ [flag]: on, password, notify: true }) as never;

  test("requires the caller to be an admin", async () => {
    await expect(fn("mod", "user", input(true))).rejects.toMatchObject({ status: 403 });
  });

  test("never changes your own role", async () => {
    await expect(fn("admin", "admin", input(false))).rejects.toMatchObject({ status: 403 });
  });

  test("re-verifies the acting admin's password", async () => {
    await expect(fn("admin", "user", input(true, "wrong"))).rejects.toMatchObject({ status: 401 });
    vi.mocked(accountsRepo.findCredentialHashByUserId).mockResolvedValue(null);
    await expect(fn("admin", "user", input(true))).rejects.toMatchObject({ status: 401 });
  });

  test("a deleted or unknown target is 404", async () => {
    await expect(fn("admin", "gone", input(true))).rejects.toMatchObject({ status: 404 });
    await expect(fn("admin", "nobody", input(true))).rejects.toMatchObject({ status: 404 });
  });
});

describe("setAdminRole", () => {
  test("grants and notifies", async () => {
    await mod.setAdminRole("admin", "user", { makeAdmin: true, password: PASSWORD, notify: true });
    expect(usersRepo.setAdmin).toHaveBeenCalledWith("user", true);
    expect(notices.notifyAdminGranted).toHaveBeenCalledWith("ada@x.test", "ada");
  });

  test("revokes and notifies", async () => {
    await mod.setAdminRole("admin", "admin2", { makeAdmin: false, password: PASSWORD, notify: true });
    expect(usersRepo.setAdmin).toHaveBeenCalledWith("admin2", false);
    expect(notices.notifyAdminRevoked).toHaveBeenCalled();
  });

  test("a no-op change writes nothing", async () => {
    await mod.setAdminRole("admin", "admin2", { makeAdmin: true, password: PASSWORD, notify: true });
    expect(usersRepo.setAdmin).not.toHaveBeenCalled();
  });

  test("never removes the last admin", async () => {
    vi.mocked(usersRepo.countAdmins).mockResolvedValue(1);
    await expect(mod.setAdminRole("admin", "admin2", { makeAdmin: false, password: PASSWORD })).rejects.toMatchObject({
      status: 403,
      message: "You can't remove the last admin.",
    });
  });
});

describe("setModeratorRole", () => {
  test("grants, revokes and notifies only on opt-in", async () => {
    await mod.setModeratorRole("admin", "user", { makeModerator: true, password: PASSWORD, notify: true });
    expect(usersRepo.setModerator).toHaveBeenCalledWith("user", true);
    expect(notices.notifyModeratorGranted).toHaveBeenCalled();
    await mod.setModeratorRole("admin", "mod", { makeModerator: false, password: PASSWORD });
    expect(usersRepo.setModerator).toHaveBeenCalledWith("mod", false);
    expect(notices.notifyModeratorRevoked).not.toHaveBeenCalled();
  });

  test("an admin target needs no moderator flag", async () => {
    await expect(
      mod.setModeratorRole("admin", "admin2", { makeModerator: true, password: PASSWORD }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("getUserDetail", () => {
  test("assembles the moderation context", async () => {
    vi.mocked(postsRepo.countsByAuthor).mockResolvedValue({ draft: 0, scheduled: 0, published: 2 });
    vi.mocked(followsRepo.counts).mockResolvedValue({ followers: 1, following: 0 });
    vi.mocked(postsRepo.listRecentByAuthor).mockResolvedValue([] as never);
    vi.mocked(reportsRepo.listAgainstUser).mockResolvedValue([]);
    vi.mocked(tagsRepo.tagsForUser).mockResolvedValue([{ slug: "a", name: "A" }]);
    vi.mocked(linksRepo.listForUser).mockResolvedValue([
      { id: "l", userId: "user", platform: "github", url: "https://github.com/a", label: "", position: 0 } as never,
    ]);
    const detail = await mod.getUserDetail("user");
    expect(detail.user).toBe(regular);
    expect(detail.links).toEqual([{ platform: "github", url: "https://github.com/a", label: "" }]);
    expect(detail.tags).toEqual([{ slug: "a", name: "A" }]);
  });

  test("a deleted account is 404", async () => {
    await expect(mod.getUserDetail("gone")).rejects.toMatchObject({ status: 404 });
  });
});

describe("deleteUser", () => {
  const input = { username: "ada", password: PASSWORD, notify: true };

  test("soft-deletes, signs out and notifies with the restore deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
    await mod.deleteUser("mod", "user", input);
    vi.useRealTimers();
    expect(usersRepo.setDeleted).toHaveBeenCalledWith("user", new Date("2026-06-01T00:00:00Z"), "mod");
    expect(sessionsRepo.removeAllForUser).toHaveBeenCalledWith("user");
    expect(notices.notifyModeratorDeleted).toHaveBeenCalledWith("ada@x.test", "ada", "2026-07-01T00:00:00.000Z");
    expect(sendActorDelete).not.toHaveBeenCalled();
  });

  test("federates Delete(actor) first when federation is running, and survives its failure", async () => {
    seedFederationRunning(true);
    vi.mocked(sendActorDelete).mockRejectedValue(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await mod.deleteUser("mod", "user", input);
    expect(sendActorDelete).toHaveBeenCalledWith("user");
    expect(usersRepo.setDeleted).toHaveBeenCalled();
  });

  test("the typed username must match exactly (trimmed)", async () => {
    await expect(mod.deleteUser("mod", "user", { ...input, username: "Ada" })).rejects.toMatchObject({
      status: 400,
    });
    await expect(mod.deleteUser("mod", "user", { ...input, username: "  ada " })).resolves.toBeUndefined();
  });

  test("a wrong password is 401 and nothing is deleted", async () => {
    await expect(mod.deleteUser("mod", "user", { ...input, password: "nope" })).rejects.toMatchObject({ status: 401 });
    expect(usersRepo.setDeleted).not.toHaveBeenCalled();
  });

  test.for([
    ["mod", "mod", 403],
    ["mod", "admin", 403],
    ["mod", "mod2", 403],
    ["user", "mod", 403],
    ["admin", "gone", 404],
  ] as const)("%s deleting %s is refused (%i)", async ([actor, target, status]) => {
    await expect(mod.deleteUser(actor, target, { username: target, password: PASSWORD })).rejects.toMatchObject({
      status,
    });
  });
});

describe("restore / purge / expiry", () => {
  test("restoring brings the account back and re-federates the actor", async () => {
    await mod.restoreUser("gone", { notify: true });
    expect(usersRepo.setDeleted).toHaveBeenCalledWith("gone", null, null);
    expect(notices.notifyRestored).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith("federate_actor_update", { userId: "gone" });
  });

  test("only a deleted account can be restored or purged", async () => {
    await expect(mod.restoreUser("user")).rejects.toMatchObject({ status: 404 });
    await expect(mod.purgeDeletedUser("user")).rejects.toMatchObject({ status: 404 });
    await mod.purgeDeletedUser("gone");
    expect(usersRepo.hardRemove).toHaveBeenCalledWith("gone");
  });

  test("expiry purges accounts deleted more than 30 days ago", async () => {
    vi.mocked(usersRepo.listExpiredDeletedIds).mockResolvedValue([{ id: "a" }, { id: "b" }] as never);
    const now = new Date("2026-06-01T00:00:00Z");
    expect(await mod.purgeExpiredDeletedUsers(now, 10)).toBe(2);
    expect(usersRepo.listExpiredDeletedIds).toHaveBeenCalledWith(new Date("2026-05-02T00:00:00Z"), 10);
    expect(vi.mocked(usersRepo.hardRemove).mock.calls).toEqual([["a"], ["b"]]);
  });

  test("deletionExpiresAt adds the 30-day window", () => {
    expect(mod.deletionExpiresAt(new Date("2026-01-31T12:00:00Z"))).toEqual(new Date("2026-03-02T12:00:00Z"));
    expect(mod.DELETED_USER_RETENTION_DAYS).toBe(30);
  });

  test("listDeletedUsers attaches post counts and expiry, keyed on deletion time", async () => {
    const rows = [0, 1, 2].map((i) => ({
      user: userRow({ id: uuid(i), deletedAt: new Date(Date.UTC(2026, 4, 10 - i)) }),
      deletedByUsername: "mod",
    }));
    vi.mocked(usersRepo.listDeleted).mockResolvedValue(rows);
    vi.mocked(postsRepo.countLocalByAuthors).mockResolvedValue(new Map([[uuid(0), 4]]));
    const out = await mod.listDeletedUsers(null, 2);
    expect(out.users.map((u) => [u.user.id, u.postCount])).toEqual([
      [uuid(0), 4],
      [uuid(1), 0],
    ]);
    expect(out.users[0].expiresAt).toEqual(mod.deletionExpiresAt(rows[0].user.deletedAt!));
    expect(decodeCursor(out.nextCursor)).toEqual({ createdAt: rows[1].user.deletedAt!.toISOString(), id: uuid(1) });
    vi.mocked(usersRepo.countDeleted).mockResolvedValue(3);
    expect(await mod.countDeletedUsers("q")).toBe(3);
  });
});

describe("email verification", () => {
  test("verifyEmail marks it verified and tells the account; idempotent", async () => {
    accounts(moderator, userRow({ id: "user", emailVerified: false }));
    await mod.verifyEmail("mod", "user");
    expect(usersRepo.update).toHaveBeenCalledWith("user", { emailVerified: true });
    expect(notices.notifyVerified).toHaveBeenCalled();
    accounts(moderator, userRow({ id: "user", emailVerified: true }));
    vi.mocked(usersRepo.update).mockClear();
    await mod.verifyEmail("mod", "user");
    expect(usersRepo.update).not.toHaveBeenCalled();
  });

  test("resendVerification goes through Better Auth and maps its error to 400", async () => {
    accounts(moderator, userRow({ id: "user", email: "u@x.test", emailVerified: false }));
    await mod.resendVerification("mod", "user");
    expect(auth.api.sendVerificationEmail).toHaveBeenCalledWith({
      body: { email: "u@x.test" },
      headers: expect.any(Headers),
    });
    vi.mocked(auth.api.sendVerificationEmail).mockRejectedValue(new Error("SMTP down"));
    await expect(mod.resendVerification("mod", "user")).rejects.toMatchObject({ status: 400, message: "SMTP down" });
  });

  test("resending to a verified address is a 400", async () => {
    await expect(mod.resendVerification("mod", "user")).rejects.toMatchObject({ status: 400 });
  });

  test("both respect the role hierarchy", async () => {
    await expect(mod.verifyEmail("mod", "admin")).rejects.toMatchObject({ status: 403 });
    await expect(mod.resendVerification("mod", "mod2")).rejects.toMatchObject({ status: 403 });
    await expect(mod.verifyEmail("nobody", "user")).rejects.toMatchObject({ status: 403 });
  });
});

describe("avatars", () => {
  test("set and remove go through the account's own upload path", async () => {
    const bytes = new Uint8Array([1]);
    await mod.setUserAvatar("mod", "user", bytes, "image/png");
    expect(usersService.setAvatar).toHaveBeenCalledWith("user", bytes, "image/png");
    await mod.removeUserAvatar("mod", "user");
    expect(usersService.removeAvatar).toHaveBeenCalledWith("user");
  });

  test("respect the role hierarchy and deleted accounts", async () => {
    await expect(mod.setUserAvatar("mod", "admin", new Uint8Array(), "image/png")).rejects.toMatchObject({
      status: 403,
    });
    await expect(mod.removeUserAvatar("mod", "gone")).rejects.toMatchObject({ status: 404 });
  });
});

describe("updateUserDetails", () => {
  beforeEach(() => {
    vi.mocked(usersRepo.findByEmail).mockResolvedValue(undefined);
  });

  test("profile fields go through the account's own update path", async () => {
    await mod.updateUserDetails("mod", "user", { displayName: "Ada" });
    expect(usersService.updateProfile).toHaveBeenCalledWith("user", { displayName: "Ada" });
  });

  test("an email-only edit does not touch the profile", async () => {
    await mod.updateUserDetails("mod", "user", { email: "new@x.test" });
    expect(usersService.updateProfile).not.toHaveBeenCalled();
  });

  test("a new email is stored unverified, the old address told, and a link sent", async () => {
    await mod.updateUserDetails("mod", "user", { email: "  New@X.test " });
    expect(usersRepo.update).toHaveBeenCalledWith("user", { email: "new@x.test", emailVerified: false });
    expect(accountsRepo.setCredentialAccountId).toHaveBeenCalledWith("user", "new@x.test");
    expect(notices.notifyEmailChanged).toHaveBeenCalledWith("ada@x.test", "ada", "new@x.test");
    expect(auth.api.sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ body: { email: "new@x.test" } }),
    );
  });

  test("a case-only change canonicalises without re-verification", async () => {
    accounts(moderator, userRow({ id: "user", email: "Ada@X.test" }));
    await mod.updateUserDetails("mod", "user", { email: "ada@x.test" });
    expect(usersRepo.update).toHaveBeenCalledWith("user", { email: "ada@x.test" });
    expect(auth.api.sendVerificationEmail).not.toHaveBeenCalled();
  });

  test("the same address is a no-op", async () => {
    await mod.updateUserDetails("mod", "user", { email: "ADA@x.test" });
    expect(usersRepo.update).not.toHaveBeenCalled();
  });

  test.for(["", "   ", "nope", "a@b", `${"x".repeat(250)}@x.test`])("refuses email %j", async (email) => {
    await expect(mod.updateUserDetails("mod", "user", { email })).rejects.toMatchObject({ status: 400 });
    expect(usersRepo.update).not.toHaveBeenCalled();
  });

  test("an address owned by someone else is refused", async () => {
    vi.mocked(usersRepo.findByEmail).mockResolvedValue(userRow({ id: "other" }));
    await expect(mod.updateUserDetails("mod", "user", { email: "taken@x.test" })).rejects.toMatchObject({
      status: 400,
      message: "That email is already in use.",
    });
  });

  test("a failed verification send is reported but the address is already changed", async () => {
    vi.mocked(auth.api.sendVerificationEmail).mockRejectedValue(new Error("SMTP down"));
    await expect(mod.updateUserDetails("mod", "user", { email: "new@x.test" })).rejects.toMatchObject({
      status: 400,
      message: "Email updated, but the verification email could not be sent: SMTP down",
    });
    expect(usersRepo.update).toHaveBeenCalled();
  });

  test("respects the role hierarchy", async () => {
    await expect(mod.updateUserDetails("mod", "admin", { bio: "x" })).rejects.toMatchObject({ status: 403 });
    await expect(mod.updateUserDetails("mod", "gone", { bio: "x" })).rejects.toMatchObject({ status: 404 });
  });

  test("a rejected email leaves the profile fields untouched", async () => {
    await mod.updateUserDetails("mod", "user", { displayName: "Changed", email: "not-an-email" }).catch(() => {});
    expect(usersService.updateProfile).not.toHaveBeenCalled();
  });
});

describe("removePost", () => {
  test("removes a local post and tells the author on opt-in", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1", title: "T" }, { id: "user" }));
    await mod.removePost("p1", "mod", { notify: true });
    expect(postsRepo.remove).toHaveBeenCalledWith("p1");
    expect(notices.notifyPostAuthorRemoved).toHaveBeenCalledWith("user", "mod", "T");
  });

  test("refuses remote posts and 404s on missing ones", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(remotePostWithAuthor());
    await expect(mod.removePost("p", "mod")).rejects.toMatchObject({ status: 403 });
    vi.mocked(postsRepo.findById).mockResolvedValue(null);
    await expect(mod.removePost("p", "mod")).rejects.toMatchObject({ status: 404 });
  });

  test("a moderator takedown of a published post is federated as a Delete", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1" }, { id: "user" }));
    await mod.removePost("p1", "mod");
    expect(queue.add).toHaveBeenCalledWith("federate_post_delete", { postId: "p1", authorId: "user" });
  });
});

describe("domain blocks", () => {
  test("blocks a normalized domain and purges its cached actors", async () => {
    vi.mocked(remoteActorsRepo.removeByDomain).mockResolvedValue(4);
    expect(await mod.blockDomain("https://Bad.Example/@spam", "  spam  ")).toEqual({
      domain: "bad.example",
      purged: 4,
    });
    expect(blockedDomainsRepo.add).toHaveBeenCalledWith("bad.example", "spam");
  });

  test("caps the reason at 1000 characters", async () => {
    await mod.blockDomain("bad.example", "r".repeat(2000));
    expect(vi.mocked(blockedDomainsRepo.add).mock.calls[0][1]).toHaveLength(1000);
  });

  test("refuses input that is not a domain", async () => {
    await expect(mod.blockDomain("not a domain", "")).rejects.toMatchObject({ status: 400 });
  });

  test("refuses to block this instance or a parent of it", async () => {
    config.APP_DOMAIN = "blog.example.com";
    await expect(mod.blockDomain("blog.example.com", "")).rejects.toMatchObject({ status: 400 });
    await expect(mod.blockDomain("example.com", "")).rejects.toMatchObject({ status: 400 });
    expect(blockedDomainsRepo.add).not.toHaveBeenCalled();
  });

  test("a subdomain of this instance's domain can still be blocked", async () => {
    config.APP_DOMAIN = "example.com";
    await expect(mod.blockDomain("spam.example.com", "")).resolves.toBeDefined();
  });

  // The guard reads the effective domain (getAppDomain), not the boot-time APP_DOMAIN.
  test("refuses to block the domain configured in the setup wizard", async () => {
    config.APP_DOMAIN = "localhost:5173";
    vi.mocked(settingsRepo.get).mockImplementation(async (key: string) =>
      key === "instance.appDomain" ? "blog.example.com" : undefined,
    );
    await expect(mod.blockDomain("blog.example.com", "")).rejects.toMatchObject({ status: 400 });
  });

  test("refuses to block this instance when APP_DOMAIN includes a port", async () => {
    config.APP_DOMAIN = "blog.example.com:8443";
    await expect(mod.blockDomain("blog.example.com", "")).rejects.toMatchObject({ status: 400 });
  });

  test("unblock normalizes, falling back to the raw lowercased input", async () => {
    await mod.unblockDomain("https://Bad.Example/x");
    expect(blockedDomainsRepo.remove).toHaveBeenLastCalledWith("bad.example");
    await mod.unblockDomain("  Weird Value ");
    expect(blockedDomainsRepo.remove).toHaveBeenLastCalledWith("weird value");
  });

  test("list and isBlocked delegate", async () => {
    vi.mocked(blockedDomainsRepo.list).mockResolvedValue([]);
    vi.mocked(blockedDomainsRepo.isBlocked).mockResolvedValue(true);
    expect(await mod.listBlockedDomains()).toEqual([]);
    expect(await mod.isDomainBlocked("x.example")).toBe(true);
  });
});
