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

afterAll(async () => {
  await closeDb();
});

describe("admin user filters", () => {
  beforeAll(async () => {
    await resetDb();

    await mkUser("alpha");
    await mkUser("beta", { suspended: true });
    await mkUser("gamma", { isAdmin: true });
    const delta = await mkUser("delta");
    await usersRepo.update(delta.id, { emailVerified: true });
  });

  test("no filter lists everyone live", async () => {
    expect(usernames(await moderation.listUsers())).toEqual(["alpha", "beta", "delta", "gamma"]);
  });

  test("suspended filter splits both ways", async () => {
    expect(usernames(await moderation.listUsers("", { suspended: true }))).toEqual(["beta"]);
    expect(usernames(await moderation.listUsers("", { suspended: false }))).toEqual(["alpha", "delta", "gamma"]);
  });

  test("admin filter splits both ways", async () => {
    expect(usernames(await moderation.listUsers("", { admin: true }))).toEqual(["gamma"]);
    expect(usernames(await moderation.listUsers("", { admin: false }))).toEqual(["alpha", "beta", "delta"]);
  });

  test("verified filter splits both ways", async () => {
    expect(usernames(await moderation.listUsers("", { verified: true }))).toEqual(["delta"]);
    expect(usernames(await moderation.listUsers("", { verified: false }))).toEqual(["alpha", "beta", "gamma"]);
  });

  test("filters combine with each other and with the search query", async () => {
    expect(usernames(await moderation.listUsers("", { admin: false, verified: false }))).toEqual(["alpha", "beta"]);
    expect(usernames(await moderation.listUsers("a", { verified: false }))).toEqual(["alpha", "beta", "gamma"]);
    expect(usernames(await moderation.listUsers("amm", { admin: true }))).toEqual(["gamma"]);
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
