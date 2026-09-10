// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Admin roles and the user detail endpoint.
//
// Covers promotion / demotion end to end against real Postgres: the password
// re-verification, the guards (self, wrong password, deleted target), the
// last-admin count the demote guardrail reads, the granted/revoked notices,
// and the detail payload (counts, latest posts, reports against the account
// and its posts).
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { db } from "@/db/client.ts";
import * as reportsRepo from "@/db/repositories/reports.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { accounts } from "@/db/schema.ts";
import { HttpError } from "@/lib/http.ts";
import { registerHandler } from "@/queue/queue.ts";
import { adminUserDetailView } from "@/routes/serializers.ts";
import * as moderation from "@/services/moderation.ts";
import { closeDb, follow, mkPost, mkUser, resetDb } from "./harness.ts";

const ADMIN_PASSWORD = "correct-horse-battery-staple-12";

async function mkCredential(userId: string, password: string) {
  await db.insert(accounts).values({
    userId,
    accountId: userId,
    providerId: "credential",
    issuer: "local:credential",
    password: await bcrypt.hash(password, 4),
  });
}

type Notice = { to: string; username: string; appName: string; origin: string };

const captured = new Map<string, Notice[]>();

function notices(job: string): Notice[] {
  return captured.get(job) ?? [];
}

async function flush() {
  await new Promise((r) => setTimeout(r, 10));
}

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

describe("admin roles", () => {
  let adminId: string;
  let userId: string;

  beforeAll(async () => {
    await resetDb();

    for (const job of ["send_admin_granted", "send_admin_revoked"] as const) {
      registerHandler(job, async (payload) => {
        captured.set(job, [...(captured.get(job) ?? []), payload]);
      });
    }

    adminId = (await mkUser("root", { isAdmin: true })).id;
    await mkCredential(adminId, ADMIN_PASSWORD);
    userId = (await mkUser("member")).id;
  });

  test("wrong password is rejected and the role is unchanged", async () => {
    const err = await captureRejection(
      moderation.setAdminRole(adminId, userId, { makeAdmin: true, password: "nope-nope-nope-nope" }),
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(401);
    expect((await usersRepo.findById(userId))?.isAdmin).toBe(false);
  });

  test("an admin cannot change their own role", async () => {
    const err = await captureRejection(
      moderation.setAdminRole(adminId, adminId, { makeAdmin: false, password: ADMIN_PASSWORD }),
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(403);
    expect((await usersRepo.findById(adminId))?.isAdmin).toBe(true);
  });

  test("promote grants the role and notifies the account", async () => {
    await moderation.setAdminRole(adminId, userId, { makeAdmin: true, password: ADMIN_PASSWORD });
    await flush();

    expect((await usersRepo.findById(userId))?.isAdmin).toBe(true);
    const [notice] = notices("send_admin_granted");
    expect(notice?.to).toBe("member@example.test");
    expect(notice?.username).toBe("member");
  });

  test("promoting an admin is a no-op (no second notice)", async () => {
    await moderation.setAdminRole(adminId, userId, { makeAdmin: true, password: ADMIN_PASSWORD });
    await flush();

    expect(notices("send_admin_granted")).toHaveLength(1);
  });

  test("the admin count tracks promotions", async () => {
    expect(await usersRepo.countAdmins()).toBe(2);
  });

  test("demote revokes the role and notifies the account", async () => {
    await moderation.setAdminRole(adminId, userId, { makeAdmin: false, password: ADMIN_PASSWORD });
    await flush();

    expect((await usersRepo.findById(userId))?.isAdmin).toBe(false);
    expect(await usersRepo.countAdmins()).toBe(1);
    const [notice] = notices("send_admin_revoked");
    expect(notice?.to).toBe("member@example.test");
    expect(notice?.username).toBe("member");
  });

  test("role change on a deleted account 404s", async () => {
    await usersRepo.setDeleted(userId, new Date(), adminId);
    const err = await captureRejection(
      moderation.setAdminRole(adminId, userId, { makeAdmin: true, password: ADMIN_PASSWORD }),
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
  });
});

describe("admin user detail", () => {
  let subjectId: string;
  let postId: string;

  beforeAll(async () => {
    await resetDb();

    subjectId = (await mkUser("subject")).id;
    const reporterId = (await mkUser("reporter")).id;
    const fanId = (await mkUser("fan")).id;
    postId = (await mkPost(subjectId, "subject-post")).id;

    await follow(fanId, subjectId);
    await reportsRepo.create({ reporterId, subjectType: "user", userId: subjectId, reason: "spam" });
    await reportsRepo.create({ reporterId, subjectType: "post", postId, reason: "mislabeled" });
  });

  test("returns counts, latest posts and every report against the account", async () => {
    const detail = await moderation.getUserDetail(subjectId);

    expect(detail.user.id).toBe(subjectId);
    expect(detail.postCounts.published).toBe(1);
    expect(detail.followCounts.followers).toBe(1);
    expect(detail.followCounts.following).toBe(0);
    expect(detail.recentPosts.map((p) => p.id)).toContain(postId);
    expect(detail.reports).toHaveLength(2);
    expect(detail.reports.map((r) => r.reason).toSorted()).toEqual(["mislabeled", "spam"]);

    // The serializer shapes the wire payload without dropping fields.
    const view = adminUserDetailView(detail);
    expect(view.user.username).toBe("subject");
    expect(view.reports).toHaveLength(2);
    expect(view.recentPosts[0].id).toBe(postId);
  });

  test("detail for a deleted or missing account 404s", async () => {
    const goneId = (await mkUser("gone")).id;
    await usersRepo.setDeleted(goneId, new Date(), subjectId);

    const deletedErr = await captureRejection(moderation.getUserDetail(goneId));
    expect(deletedErr).toBeInstanceOf(HttpError);
    expect((deletedErr as HttpError).status).toBe(404);

    const missingErr = await captureRejection(moderation.getUserDetail("00000000-0000-0000-0000-000000000000"));
    expect(missingErr).toBeInstanceOf(HttpError);
    expect((missingErr as HttpError).status).toBe(404);
  });
});
