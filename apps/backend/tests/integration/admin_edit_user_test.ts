// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Admin user editing: profile patch plus the login-email change flow.
//
// Covers the moderation service end to end against real Postgres: a profile
// patch persists and queues a federated actor update, a login-email change is
// normalized, stored unverified, and mails both addresses (the standard
// verification link to the new one, a security notice to the previous one),
// and the guards (in-use / malformed / deleted target, case-only fix).
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { db } from "@/db/client.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { accounts } from "@/db/schema.ts";
import { HttpError } from "@/lib/http.ts";
import { registerHandler } from "@/queue/queue.ts";
import { accountEmailChangedEmail } from "@/services/email.ts";
import * as moderation from "@/services/moderation.ts";
import { closeDb, mkUser, resetDb } from "./harness.ts";

// A Better Auth credential row carrying a real bcrypt hash (cost 4 keeps the
// suite fast), so the credential-identifier sync runs for real.
async function mkCredential(userId: string, email: string) {
  await db.insert(accounts).values({
    userId,
    accountId: email,
    providerId: "credential",
    issuer: "local:credential",
    password: await bcrypt.hash("correct-horse-battery-staple-12", 4),
  });
}

type Verification = { to: string; url: string };
type ChangeNotice = { to: string; username: string; appName: string; origin: string; newEmail: string };

const verifications: Verification[] = [];
const changeNotices: ChangeNotice[] = [];
const actorUpdates: { userId: string }[] = [];

// The queue delivers off the request path; flush before asserting.
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

async function credentialAccountId(userId: string): Promise<string | null> {
  const rows = await db.select().from(accounts).where(eq(accounts.userId, userId));
  return rows.find((r) => r.providerId === "credential")?.accountId ?? null;
}

afterAll(async () => {
  await closeDb();
});

describe("admin edit user", () => {
  let memberId: string;

  beforeAll(async () => {
    await resetDb();

    registerHandler("federate_actor_update", async (payload) => {
      actorUpdates.push(payload);
    });
    registerHandler("send_email_verification", async (payload) => {
      verifications.push(payload);
    });
    registerHandler("send_account_email_changed", async (payload) => {
      changeNotices.push(payload);
    });

    memberId = (await mkUser("member")).id;
    await mkCredential(memberId, "member@example.test");
  });

  test("profile patch persists, shows in the detail, and federates", async () => {
    await moderation.updateUserDetails(memberId, {
      displayName: "New Name",
      bio: "Edited by a moderator.",
      publicEmail: "contact@example.com",
      customSection: "# Hello",
      tags: ["alpha", "beta"],
      links: [{ platform: "website", url: "https://example.com", label: "Site" }],
    });
    await flush();

    const row = await usersRepo.findById(memberId);
    expect(row?.displayName).toBe("New Name");
    expect(row?.bio).toBe("Edited by a moderator.");
    expect(row?.publicEmail).toBe("contact@example.com");
    expect(row?.customSection).toBe("# Hello");
    expect(row?.customSectionHtml).toContain("Hello");

    const detail = await moderation.getUserDetail(memberId);
    expect(detail.tags.map((t) => t.slug).toSorted()).toEqual(["alpha", "beta"]);
    // Stored canonicalised (trailing slash), exactly as the editor round-trips it.
    expect(detail.links).toEqual([{ platform: "website", url: "https://example.com/", label: "Site" }]);

    expect(actorUpdates.some((u) => u.userId === memberId)).toBe(true);
  });

  test("email change normalizes, unverifies, and mails both addresses", async () => {
    await moderation.updateUserDetails(memberId, { email: "  New-Address@Example.Test " });
    await flush();

    const row = await usersRepo.findById(memberId);
    expect(row?.email).toBe("new-address@example.test");
    expect(row?.emailVerified).toBe(false);
    // The credential identifier follows the login email.
    expect(await credentialAccountId(memberId)).toBe("new-address@example.test");

    // The new address gets the standard verification link…
    expect(verifications).toHaveLength(1);
    expect(verifications[0].to).toBe("new-address@example.test");
    expect(verifications[0].url).toContain("/verify-email?token=");

    // …and the previous address gets a security notice naming the new one.
    expect(changeNotices).toHaveLength(1);
    expect(changeNotices[0].to).toBe("member@example.test");
    expect(changeNotices[0].username).toBe("member");
    expect(changeNotices[0].newEmail).toBe("new-address@example.test");
    expect(changeNotices[0].appName).toBeTruthy();
    expect(changeNotices[0].origin).toMatch(/^https?:\/\//);
  });

  test("email change to an in-use address is rejected and changes nothing", async () => {
    const holderId = (await mkUser("holder")).id;
    await moderation.updateUserDetails(holderId, { email: "taken@example.test" });
    await flush();
    const noticesBefore = changeNotices.length;

    const otherId = (await mkUser("other")).id;
    const err = await captureRejection(moderation.updateUserDetails(otherId, { email: "Taken@Example.Test" }));
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
    expect((await usersRepo.findById(otherId))?.email).toBe("other@example.test");
    await flush();
    expect(changeNotices).toHaveLength(noticesBefore);
  });

  test("malformed email is rejected", async () => {
    const err = await captureRejection(moderation.updateUserDetails(memberId, { email: "not-an-email" }));
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
    expect((await usersRepo.findById(memberId))?.email).toBe("new-address@example.test");
  });

  test("case-only change canonicalises without any mail", async () => {
    const caseyId = (await mkUser("Casey")).id;
    const verificationsBefore = verifications.length;
    const noticesBefore = changeNotices.length;

    await moderation.updateUserDetails(caseyId, { email: "casey@example.test" });
    await flush();

    expect((await usersRepo.findById(caseyId))?.email).toBe("casey@example.test");
    expect(verifications).toHaveLength(verificationsBefore);
    expect(changeNotices).toHaveLength(noticesBefore);
  });

  test("editing a deleted account 404s", async () => {
    const goneId = (await mkUser("gone")).id;
    await usersRepo.setDeleted(goneId, new Date(), memberId);
    const err = await captureRejection(moderation.updateUserDetails(goneId, { displayName: "Ghost" }));
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
  });

  test("the old-address notice names the account and the new address", () => {
    const mail = accountEmailChangedEmail({
      username: "member",
      appName: "Example",
      origin: "https://example.test",
      newEmail: "new@example.test",
    });
    expect(mail.subject).toContain("Example");
    expect(mail.text).toContain("@member");
    expect(mail.text).toContain("new@example.test");
    expect(mail.html).toContain("new@example.test");
  });
});
