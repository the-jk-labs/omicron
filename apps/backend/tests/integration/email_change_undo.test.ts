// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Undoing a self-service email change, end to end against real Postgres: the
// undo token is stored hashed in Better Auth's verifications table, works
// once, and puts the old address back while locking the account down.
import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, expect, test } from "vitest";
import { db } from "@/db/client.ts";
import * as undoRepo from "@/db/repositories/emailChangeUndo.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { accounts, passkeys, sessions, verifications } from "@/db/schema.ts";
import type { HttpError } from "@/lib/http.ts";
import { hashToken } from "@/lib/tokens.ts";
import { registerHandler } from "@/queue/queue.ts";
import { createUndoLink, undoEmailChange } from "@/services/emailChange.ts";
import { closeDb, mkSession, mkUser, resetDb } from "./harness.ts";

const resets: string[] = [];
registerHandler("send_password_reset", ({ to }) => {
  resets.push(to);
  return Promise.resolve();
});

// What a hijacked account looks like right after the change: a new address,
// a password, a passkey and a couple of live sessions.
async function hijacked() {
  const ada = await mkUser("ada");
  await db.insert(accounts).values({ userId: ada.id, accountId: ada.id, providerId: "credential", password: "hash" });
  await db.insert(passkeys).values({
    userId: ada.id,
    publicKey: "pk",
    credentialID: "cred-1",
    counter: 0,
    deviceType: "multiDevice",
    backedUp: true,
  });
  await mkSession(ada.id, new Date());
  await mkSession(ada.id, new Date(Date.now() - 60_000));
  await usersRepo.update(ada.id, { email: "attacker@evil.test", emailVerified: true });
  return ada;
}

async function rejection(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise;
  } catch (err) {
    return err as HttpError;
  }
  throw new Error("expected a rejection");
}

beforeEach(async () => {
  await resetDb();
  // verifications isn't one of the harness's tables; clear what this file writes.
  await db.delete(verifications).where(like(verifications.identifier, "email-change-undo:%"));
  resets.length = 0;
});

afterAll(async () => {
  await closeDb();
});

test("the link restores the old address once, and shuts the account down", async () => {
  const ada = await hijacked();
  const token = new URL(await createUndoLink(ada.id, "ada@example.test", "attacker@evil.test")).searchParams.get(
    "token",
  )!;

  const [stored] = await db.select().from(verifications).where(like(verifications.identifier, "email-change-undo:%"));
  expect(stored.identifier).toBe(`email-change-undo:${await hashToken(token)}`);
  expect(stored.identifier).not.toContain(token);

  expect(await undoEmailChange(token)).toBe("ada@example.test");

  expect(await usersRepo.findById(ada.id)).toMatchObject({ email: "ada@example.test", emailVerified: true });
  expect(await db.select().from(sessions).where(eq(sessions.userId, ada.id))).toEqual([]);
  expect(await db.select().from(passkeys).where(eq(passkeys.userId, ada.id))).toEqual([]);
  const [credential] = await db.select().from(accounts).where(eq(accounts.userId, ada.id));
  expect(credential.password).toBeNull();
  await new Promise((r) => setTimeout(r, 10));
  expect(resets).toEqual(["ada@example.test"]);

  expect((await rejection(undoEmailChange(token))).status).toBe(400);
});

test("an expired link changes nothing", async () => {
  const ada = await hijacked();
  await undoRepo.create(
    await hashToken("old-token"),
    { userId: ada.id, oldEmail: "ada@example.test", newEmail: "attacker@evil.test" },
    new Date(Date.now() - 1000),
  );
  expect((await rejection(undoEmailChange("old-token"))).message).toBe("This link has expired or was already used.");
  expect((await usersRepo.findById(ada.id))?.email).toBe("attacker@evil.test");
  expect(await db.select().from(sessions).where(eq(sessions.userId, ada.id))).toHaveLength(2);
});

test("an old address that now belongs to someone else is not taken from them", async () => {
  const ada = await hijacked();
  const token = new URL(await createUndoLink(ada.id, "bob@example.test", "attacker@evil.test")).searchParams.get(
    "token",
  )!;
  await mkUser("bob");
  expect((await rejection(undoEmailChange(token))).status).toBe(409);
  expect((await usersRepo.findById(ada.id))?.email).toBe("attacker@evil.test");
  expect(await db.select().from(passkeys).where(eq(passkeys.userId, ada.id))).toHaveLength(1);
});
