// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Admin user deletion: soft-delete with a retention window.
//
// Covers the moderation service end to end against real Postgres: the
// GitHub-style confirmation (the exact username plus the acting admin's own
// password), the guards (self / other admins / already deleted), the effects
// (the row is kept but invisible, sessions are cleared, the restore list
// carries the account), restore, early purge, and expiry purge.
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { db } from "@/db/client.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { accounts, sessions } from "@/db/schema.ts";
import { HttpError } from "@/lib/http.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { registerHandler } from "@/queue/queue.ts";
import { sweep as sweepDeletedUsers } from "@/services/deletedUsers.ts";
import * as moderation from "@/services/moderation.ts";
import { closeDb, includesPost, mkPost, mkSession, mkUser, resetDb } from "./harness.ts";

const ADMIN_PASSWORD = "correct-horse-battery-staple-12";

// A Better Auth credential row for the admin, carrying a real bcrypt hash so
// the password re-verification runs for real (cost 4 keeps the suite fast;
// compare accepts any cost).
async function mkCredential(userId: string, password: string) {
  await db.insert(accounts).values({
    userId,
    accountId: userId,
    providerId: "credential",
    issuer: "local:credential",
    password: await bcrypt.hash(password, 4),
  });
}

async function sessionCount(userId: string): Promise<number> {
  return (await db.select().from(sessions).where(eq(sessions.userId, userId))).length;
}

type Rows = readonly { post: { id: string } }[];

async function globalPosts(): Promise<Rows> {
  return postsRepo.listGlobal(null, null);
}

// Runs the promise to settlement, returning whatever it threw (or a sentinel
// when it unexpectedly succeeded) so each test asserts on the status itself.
async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return new Error("expected rejection, but the call succeeded");
}

afterAll(async () => {
  await closeDb();
});

describe("admin delete user", () => {
  const adminName = "root";
  let adminId: string;
  let fellowAdminId: string;
  let victimId: string;
  let victimPostId: string;

  // Captures the queued deletion notices instead of delivering them.
  const deletionNotices: { to: string; username: string; appName: string; origin: string; expiresAt: string }[] = [];

  beforeAll(async () => {
    await resetDb();

    registerHandler("send_account_deleted", async (payload) => {
      deletionNotices.push(payload);
    });

    const admin = await mkUser(adminName, { isAdmin: true });
    adminId = admin.id;
    await mkCredential(adminId, ADMIN_PASSWORD);

    const fellow = await mkUser("fellow", { isAdmin: true });
    fellowAdminId = fellow.id;
    await mkCredential(fellowAdminId, ADMIN_PASSWORD);

    const victim = await mkUser("victim");
    victimId = victim.id;
    const post = await mkPost(victimId, "victim-post");
    victimPostId = post.id;
    await mkSession(victimId, new Date());
  });

  test("wrong username is rejected and nothing changes", async () => {
    const err = await captureRejection(
      moderation.deleteUser(adminId, victimId, { username: "someone-else", password: ADMIN_PASSWORD }),
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
    expect((await usersRepo.findById(victimId))?.deletedAt).toBeNull();
  });

  test("wrong password is rejected and nothing changes", async () => {
    const err = await captureRejection(
      moderation.deleteUser(adminId, victimId, { username: "victim", password: "nope-nope-nope-nope" }),
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(401);
    expect((await usersRepo.findById(victimId))?.deletedAt).toBeNull();
  });

  test("an admin cannot delete their own account", async () => {
    const err = await captureRejection(
      moderation.deleteUser(adminId, adminId, { username: adminName, password: ADMIN_PASSWORD }),
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(403);
  });

  test("an admin cannot delete another admin", async () => {
    const err = await captureRejection(
      moderation.deleteUser(adminId, fellowAdminId, { username: "fellow", password: ADMIN_PASSWORD }),
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(403);
  });

  test("delete keeps the row but hides the account everywhere", async () => {
    await moderation.deleteUser(adminId, victimId, { username: "victim", password: ADMIN_PASSWORD });

    const row = await usersRepo.findById(victimId);
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.deletedBy).toBe(adminId);

    // Signed out: sessions are cleared.
    expect(await sessionCount(victimId)).toBe(0);

    // Vanishes from the admin table, the header count and search…
    expect((await usersRepo.listForAdmin()).some((u) => u.id === victimId)).toBe(false);
    expect((await usersRepo.listForAdmin("victim")).some((u) => u.id === victimId)).toBe(false);
    expect((await usersRepo.search("victim")).some((u) => u.id === victimId)).toBe(false);
    expect((await usersRepo.suggested(adminId)).some((u) => u.id === victimId)).toBe(false);
    const total = await usersRepo.countUsers();
    expect(total).toBe(2);

    // …and the account's posts vanish from public listings.
    expect(includesPost(await globalPosts(), victimPostId)).toBe(false);

    // The account is told what happened, off the request path — flush the
    // queue microtask before asserting.
    await new Promise((r) => setTimeout(r, 10));
    expect(deletionNotices).toHaveLength(1);
    expect(deletionNotices[0].to).toBe("victim@example.test");
    expect(deletionNotices[0].username).toBe("victim");
    expect(deletionNotices[0].appName).toBeTruthy();
    expect(deletionNotices[0].origin).toMatch(/^https?:\/\//);
    const noticeExpiry = new Date(deletionNotices[0].expiresAt).getTime();
    expect(noticeExpiry - (row?.deletedAt?.getTime() ?? 0)).toBe(moderation.DELETED_USER_RETENTION_DAYS * 86_400_000);
  });

  test("a deleted account shows up on the restore list with its metadata", async () => {
    const { users: deleted } = await moderation.listDeletedUsers();
    expect(deleted).toHaveLength(1);
    expect(deleted[0].user.id).toBe(victimId);
    expect(deleted[0].deletedByUsername).toBe(adminName);
    expect(deleted[0].postCount).toBe(1);
    expect(deleted[0].user.deletedAt).toBeInstanceOf(Date);
    expect(deleted[0].expiresAt.getTime() - deleted[0].user.deletedAt!.getTime()).toBe(
      moderation.DELETED_USER_RETENTION_DAYS * 86_400_000,
    );
  });

  test("deleting an already-deleted account 404s", async () => {
    const err = await captureRejection(
      moderation.deleteUser(adminId, victimId, { username: "victim", password: ADMIN_PASSWORD }),
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
  });

  test("restoring a live account 404s", async () => {
    const err = await captureRejection(moderation.restoreUser(adminId));
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
  });

  test("restore brings the account fully back", async () => {
    await moderation.restoreUser(victimId);

    const row = await usersRepo.findById(victimId);
    expect(row?.deletedAt).toBeNull();
    expect(row?.deletedBy).toBeNull();

    expect((await usersRepo.listForAdmin()).some((u) => u.id === victimId)).toBe(true);
    expect((await moderation.listDeletedUsers()).users).toHaveLength(0);
    expect(includesPost(await globalPosts(), victimPostId)).toBe(true);
  });

  test("purging a live account 404s", async () => {
    const err = await captureRejection(moderation.purgeDeletedUser(victimId));
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
  });

  test("purge erases the row and cascades its posts", async () => {
    await moderation.deleteUser(adminId, victimId, { username: "victim", password: ADMIN_PASSWORD });
    await moderation.purgeDeletedUser(victimId);

    expect(await usersRepo.findById(victimId)).toBeUndefined();
    expect(await postsRepo.findById(victimPostId)).toBeNull();
    expect((await moderation.listDeletedUsers()).users).toHaveLength(0);
  });

  test("expiry purge only takes accounts past the retention window", async () => {
    const oldTimer = await mkUser("oldtimer");
    const fresh = await mkUser("fresh");
    const ancient = new Date(Date.now() - (moderation.DELETED_USER_RETENTION_DAYS + 1) * 86_400_000);
    await usersRepo.setDeleted(oldTimer.id, ancient, adminId);
    await usersRepo.setDeleted(fresh.id, new Date(), adminId);

    expect(await moderation.purgeExpiredDeletedUsers()).toBe(1);
    expect(await usersRepo.findById(oldTimer.id)).toBeUndefined();
    expect((await usersRepo.findById(fresh.id))?.deletedAt).toBeInstanceOf(Date);

    // The sweeper service surfaces the same pass without throwing.
    await expect(sweepDeletedUsers()).resolves.toBe(0);
  });
});

describe("deleted restore list pagination", () => {
  beforeAll(async () => {
    await resetDb();

    const admin = await mkUser("root2", { isAdmin: true });
    await mkCredential(admin.id, ADMIN_PASSWORD);
    // Deleted one after another so deleted_at ties (same millisecond) also
    // exercise the id tiebreak in the keyset.
    for (const name of ["gone-a", "gone-b", "gone-c"]) {
      const u = await mkUser(name);
      await moderation.deleteUser(admin.id, u.id, { username: name, password: ADMIN_PASSWORD });
    }
  });

  test("pages cover every deleted account without overlap", async () => {
    const first = await moderation.listDeletedUsers(null, 2);
    expect(first.users).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await moderation.listDeletedUsers(decodeCursor(first.nextCursor), 2);
    expect(second.users).toHaveLength(1);
    expect(second.nextCursor).toBeNull();

    const ids = [...first.users, ...second.users].map((r) => r.user.id);
    expect(new Set(ids).size).toBe(3);
    expect(await moderation.countDeletedUsers()).toBe(3);
  });
});
