// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Admin user filters and email verification control.
//
// Covers the triage filters (suspended / admin / verified, alone, combined and
// with a search query), manual verification (idempotent, notified) and the
// verification resend (sent, refused when already verified). The resend goes
// through Better Auth's own endpoint; the test captures the queued mail job.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as usersRepo from "@/db/repositories/users.ts";
import { decodeAdminCursor } from "@/db/repositories/users.ts";
import { HttpError } from "@/lib/http.ts";
import { registerHandler } from "@/queue/queue.ts";
import * as moderation from "@/services/moderation.ts";
import { closeDb, mkUser, resetDb } from "./harness.ts";

// The verification mail carries `{ to, url }` instead of the account payload,
// so everything but the recipient is optional here.
type Notice = { to: string; username?: string; appName?: string; origin?: string };

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

function usernames(rows: readonly { username: string }[]): string[] {
  return rows.map((r) => r.username).toSorted();
}

async function page(
  query = "",
  filter: Parameters<typeof moderation.listUsers>[1] = {},
  cursor: Parameters<typeof moderation.listUsers>[2] = null,
  limit: Parameters<typeof moderation.listUsers>[3] = 50,
  sort: Parameters<typeof moderation.listUsers>[4] = "newest",
) {
  const { users } = await moderation.listUsers(query, filter, cursor, limit, sort);
  return users;
}

afterAll(async () => {
  await closeDb();
});

describe("admin user filters", () => {
  beforeAll(async () => {
    await resetDb();

    // Distinct creation instants, oldest first: the time sorts then have a
    // total order to assert on, instead of racing the clock and falling back
    // to id order (see mkUser `createdAt`).
    const base = Date.now();
    await mkUser("alpha", { createdAt: new Date(base) });
    await mkUser("beta", { suspended: true, createdAt: new Date(base + 1_000) });
    await mkUser("gamma", { isAdmin: true, createdAt: new Date(base + 2_000) });
    const delta = await mkUser("delta", { createdAt: new Date(base + 3_000) });
    await usersRepo.update(delta.id, { emailVerified: true });
  });

  test("no filter lists everyone live", async () => {
    expect(usernames(await page())).toEqual(["alpha", "beta", "delta", "gamma"]);
  });

  test("suspended filter splits both ways", async () => {
    expect(usernames(await page("", { suspended: true }))).toEqual(["beta"]);
    expect(usernames(await page("", { suspended: false }))).toEqual(["alpha", "delta", "gamma"]);
  });

  test("admin filter splits both ways", async () => {
    expect(usernames(await page("", { admin: true }))).toEqual(["gamma"]);
    expect(usernames(await page("", { admin: false }))).toEqual(["alpha", "beta", "delta"]);
  });

  test("verified filter splits both ways", async () => {
    expect(usernames(await page("", { verified: true }))).toEqual(["delta"]);
    expect(usernames(await page("", { verified: false }))).toEqual(["alpha", "beta", "gamma"]);
  });

  test("filters combine with each other and with the search query", async () => {
    expect(usernames(await page("", { admin: false, verified: false }))).toEqual(["alpha", "beta"]);
    expect(usernames(await page("a", { verified: false }))).toEqual(["alpha", "beta", "gamma"]);
    expect(usernames(await page("amm", { admin: true }))).toEqual(["gamma"]);
  });

  test("search matches the login email too", async () => {
    expect(usernames(await page("beta@example.test"))).toEqual(["beta"]);
    expect(usernames(await page("ALPHA@EXAMPLE.TEST"))).toEqual(["alpha"]);
  });

  test("filtered count matches the listing", async () => {
    expect(await moderation.countFilteredUsers("", { suspended: true })).toBe(1);
    expect(await moderation.countFilteredUsers("a", { verified: false })).toBe(3);
    expect(await moderation.countUsers()).toBe(4);
  });

  test("cursor pagination walks the whole table without overlap", async () => {
    const first = await moderation.listUsers("", {}, null, 2);
    expect(first.users).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await moderation.listUsers("", {}, decodeAdminCursor(first.nextCursor), 2);
    expect(second.users).toHaveLength(2);
    expect(second.nextCursor).toBeNull();

    const seen = usernames([...first.users, ...second.users]);
    expect(seen).toEqual(["alpha", "beta", "delta", "gamma"]);
    expect(new Set([...first.users, ...second.users].map((u) => u.id)).size).toBe(4);
  });

  test("sort orders: newest is reverse-chronological, oldest its mirror, username A-Z", async () => {
    const newest = await moderation.listUsers("", {}, null, 50, "newest");
    const oldest = await moderation.listUsers("", {}, null, 50, "oldest");
    const byName = await moderation.listUsers("", {}, null, 50, "username");
    // Fixture creation order is alpha, beta, gamma, delta (distinct instants).
    expect(newest.users.map((u) => u.username)).toEqual(["delta", "gamma", "beta", "alpha"]);
    expect(oldest.users.map((u) => u.username)).toEqual(["alpha", "beta", "gamma", "delta"]);
    expect(byName.users.map((u) => u.username)).toEqual(["alpha", "beta", "delta", "gamma"]);
  });

  test("username pagination walks the whole table without overlap", async () => {
    const first = await moderation.listUsers("", {}, null, 2, "username");
    expect(first.users.map((u) => u.username)).toEqual(["alpha", "beta"]);
    expect(first.nextCursor).not.toBeNull();

    const second = await moderation.listUsers("", {}, decodeAdminCursor(first.nextCursor), 2, "username");
    expect(second.users.map((u) => u.username)).toEqual(["delta", "gamma"]);
    expect(second.nextCursor).toBeNull();
  });

  test("oldest pagination walks the whole table without overlap", async () => {
    const first = await moderation.listUsers("", {}, null, 2, "oldest");
    expect(first.users.map((u) => u.username)).toEqual(["alpha", "beta"]);
    const second = await moderation.listUsers("", {}, decodeAdminCursor(first.nextCursor), 2, "oldest");
    expect(second.users.map((u) => u.username)).toEqual(["gamma", "delta"]);
    expect(second.nextCursor).toBeNull();
  });

  test("a cursor from another sort restarts at page one", async () => {
    const newestFirst = await moderation.listUsers("", {}, null, 2, "newest");
    expect(newestFirst.nextCursor).not.toBeNull();
    // Reusing a newest cursor with the username sort must not skip rows.
    const restarted = await moderation.listUsers("", {}, decodeAdminCursor(newestFirst.nextCursor), 2, "username");
    expect(restarted.users.map((u) => u.username)).toEqual(["alpha", "beta"]);
  });
});

describe("admin email verification control", () => {
  let unverifiedId: string;

  beforeAll(async () => {
    await resetDb();

    for (const job of ["send_account_verified", "send_email_verification"] as const) {
      registerHandler(job, async (payload) => {
        captured.set(job, [...(captured.get(job) ?? []), payload]);
      });
    }

    unverifiedId = (await mkUser("pending")).id;
  });

  test("manual verify marks the address and notifies the account", async () => {
    await moderation.verifyEmail(unverifiedId);
    await flush();

    expect((await usersRepo.findById(unverifiedId))?.emailVerified).toBe(true);
    const [notice] = notices("send_account_verified");
    expect(notice?.to).toBe("pending@example.test");
    expect(notice?.username).toBe("pending");
  });

  test("manual verify is idempotent (no second notice)", async () => {
    await moderation.verifyEmail(unverifiedId);
    await flush();

    expect(notices("send_account_verified")).toHaveLength(1);
  });

  test("resend delivers a fresh verification email", async () => {
    const freshId = (await mkUser("fresh")).id;
    await moderation.resendVerification(freshId);
    await flush();

    const [notice] = notices("send_email_verification");
    expect(notice?.to).toBe("fresh@example.test");
  });

  test("resend refuses an already-verified address", async () => {
    const err = await captureRejection(moderation.resendVerification(unverifiedId));
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
  });

  test("verify and resend on a missing account 404", async () => {
    const missing = "00000000-0000-0000-0000-000000000000";
    const verifyErr = await captureRejection(moderation.verifyEmail(missing));
    expect((verifyErr as HttpError).status).toBe(404);
    const resendErr = await captureRejection(moderation.resendVerification(missing));
    expect((resendErr as HttpError).status).toBe(404);
  });

  test("verify on a deleted account 404s", async () => {
    const goneId = (await mkUser("gone2")).id;
    await usersRepo.setDeleted(goneId, new Date(), unverifiedId);
    const err = await captureRejection(moderation.verifyEmail(goneId));
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
  });
});
