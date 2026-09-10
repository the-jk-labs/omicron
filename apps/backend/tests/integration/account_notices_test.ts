// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Account lifecycle emails: every operation that changes what an account can
// do — password change, self-deletion, suspension, reinstatement, restore —
// notifies its login address. The tests capture the queued jobs instead of
// delivering them and assert on recipient and payload.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as usersRepo from "@/db/repositories/users.ts";
import { registerHandler } from "@/queue/queue.ts";
import { notifyPasswordChanged, notifySelfDeleted } from "@/services/accountNotices.ts";
import * as moderation from "@/services/moderation.ts";
import { closeDb, mkUser, resetDb } from "./harness.ts";

type Notice = { to: string; username: string; appName: string; origin: string; expiresAt?: string };

const captured = new Map<string, Notice[]>();

function notices(job: string): Notice[] {
  return captured.get(job) ?? [];
}

// The queue delivers off the request path; flush before asserting.
async function flush() {
  await new Promise((r) => setTimeout(r, 10));
}

afterAll(async () => {
  await closeDb();
});

describe("account notice emails", () => {
  let adminId: string;
  let userId: string;
  let suspendeeId: string;
  let restoreeId: string;

  beforeAll(async () => {
    await resetDb();

    for (const job of [
      "send_password_changed",
      "send_account_erased",
      "send_account_suspended",
      "send_account_reinstated",
      "send_account_restored",
    ] as const) {
      registerHandler(job, async (payload) => {
        captured.set(job, [...(captured.get(job) ?? []), payload]);
      });
    }

    adminId = (await mkUser("root", { isAdmin: true })).id;
    userId = (await mkUser("notable")).id;
    suspendeeId = (await mkUser("suspendee")).id;
    restoreeId = (await mkUser("restoree")).id;
  });

  test("password change notifies the login address", async () => {
    await notifyPasswordChanged(userId);
    await flush();

    const [notice] = notices("send_password_changed");
    expect(notice?.to).toBe("notable@example.test");
    expect(notice?.username).toBe("notable");
    expect(notice?.appName).toBeTruthy();
    expect(notice?.origin).toMatch(/^https?:\/\//);
  });

  test("password change for a gone account notifies nobody", async () => {
    await notifyPasswordChanged("00000000-0000-0000-0000-000000000000");
    await flush();

    expect(notices("send_password_changed")).toHaveLength(1);
  });

  test("self-deletion sends a receipt to the former address", async () => {
    await notifySelfDeleted("gone@example.test", "gone");
    await flush();

    const [notice] = notices("send_account_erased");
    expect(notice?.to).toBe("gone@example.test");
    expect(notice?.username).toBe("gone");
  });

  test("suspend and reinstate each notify the account", async () => {
    await moderation.setSuspended(adminId, suspendeeId, true);
    await flush();
    const [suspended] = notices("send_account_suspended");
    expect(suspended?.to).toBe("suspendee@example.test");
    expect(suspended?.username).toBe("suspendee");

    await moderation.setSuspended(adminId, suspendeeId, false);
    await flush();
    const [reinstated] = notices("send_account_reinstated");
    expect(reinstated?.to).toBe("suspendee@example.test");
    expect(reinstated?.username).toBe("suspendee");
  });

  test("restore notifies the account it is back", async () => {
    await usersRepo.setDeleted(restoreeId, new Date(), adminId);
    await moderation.restoreUser(restoreeId);
    await flush();

    const [restored] = notices("send_account_restored");
    expect(restored?.to).toBe("restoree@example.test");
    expect(restored?.username).toBe("restoree");
  });
});
