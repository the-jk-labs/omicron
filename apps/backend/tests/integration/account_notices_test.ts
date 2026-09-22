// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Account lifecycle emails: password changes and self-deletion always notify
// the login address, while moderation actions (suspension, reinstatement,
// restore) notify only when the moderator opts in. The tests capture the
// queued jobs instead of delivering them and assert on recipient and payload.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as usersRepo from "@/db/repositories/users.ts";
import { registerHandler } from "@/queue/queue.ts";
import { notifyPasswordChanged, notifySelfDeleted } from "@/services/accountNotices.ts";
import * as moderation from "@/services/moderation.ts";
import * as postsService from "@/services/posts.ts";
import { closeDb, mkPost, mkUser, resetDb } from "./harness.ts";

type Notice = {
  to: string;
  username: string;
  appName: string;
  origin: string;
  expiresAt?: string;
  postTitle?: string;
};

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
      "send_post_removed",
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

  test("suspend and reinstate notify only on opt-in", async () => {
    // Silence by default: the operation applies, no mail queues.
    await moderation.setSuspended(adminId, suspendeeId, true);
    await flush();
    expect(notices("send_account_suspended")).toHaveLength(0);
    expect((await usersRepo.findById(suspendeeId))?.suspendedAt).not.toBeNull();

    await moderation.setSuspended(adminId, suspendeeId, false);
    await flush();
    expect(notices("send_account_reinstated")).toHaveLength(0);

    // Opted in: each notifies the account.
    await moderation.setSuspended(adminId, suspendeeId, true, { notify: true });
    await flush();
    const [suspended] = notices("send_account_suspended");
    expect(suspended?.to).toBe("suspendee@example.test");
    expect(suspended?.username).toBe("suspendee");

    await moderation.setSuspended(adminId, suspendeeId, false, { notify: true });
    await flush();
    const [reinstated] = notices("send_account_reinstated");
    expect(reinstated?.to).toBe("suspendee@example.test");
    expect(reinstated?.username).toBe("suspendee");
  });

  test("restore notifies only on opt-in", async () => {
    await usersRepo.setDeleted(restoreeId, new Date(), adminId);
    await moderation.restoreUser(restoreeId);
    await flush();
    expect(notices("send_account_restored")).toHaveLength(0);
    expect((await usersRepo.findById(restoreeId))?.deletedAt).toBeNull();

    await usersRepo.setDeleted(restoreeId, new Date(), adminId);
    await moderation.restoreUser(restoreeId, { notify: true });
    await flush();

    const [restored] = notices("send_account_restored");
    expect(restored?.to).toBe("restoree@example.test");
    expect(restored?.username).toBe("restoree");
  });

  test("post removal notifies the author only on opt-in", async () => {
    const silentId = (await mkPost(suspendeeId, "quiet-post")).id;
    await moderation.removePost(silentId, adminId);
    await flush();
    expect(notices("send_post_removed")).toHaveLength(0);

    const loudId = (await mkPost(suspendeeId, "loud-post")).id;
    await moderation.removePost(loudId, adminId, { notify: true });
    await flush();

    const [removed] = notices("send_post_removed");
    expect(removed?.to).toBe("suspendee@example.test");
    expect(removed?.username).toBe("suspendee");
    expect(removed?.postTitle).toBe("loud-post");
  });

  test("an author deleting their own post is never mailed, even opted in", async () => {
    const ownId = (await mkPost(suspendeeId, "own-post")).id;
    await postsService.deletePost(suspendeeId, false, ownId, { notify: true });
    await flush();
    expect(notices("send_post_removed")).toHaveLength(1);
  });
});
