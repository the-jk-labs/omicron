// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userRow } from "../fixtures.ts";

vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/instanceSetup.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import * as usersRepo from "@/db/repositories/users.ts";
import { queue } from "@/queue/queue.ts";
import * as notices from "@/services/accountNotices.ts";
import * as instanceSetup from "@/services/instanceSetup.ts";

const vars = { appName: "Omicron", origin: "https://blog.example" };

beforeEach(() => {
  vi.mocked(instanceSetup.getAppName).mockResolvedValue(vars.appName);
  vi.mocked(instanceSetup.getOrigin).mockResolvedValue(vars.origin);
});

describe("simple notices", () => {
  test.for([
    ["notifySelfDeleted", "send_account_erased"],
    ["notifySuspended", "send_account_suspended"],
    ["notifyReinstated", "send_account_reinstated"],
    ["notifyRestored", "send_account_restored"],
    ["notifyAdminGranted", "send_admin_granted"],
    ["notifyAdminRevoked", "send_admin_revoked"],
    ["notifyModeratorGranted", "send_moderator_granted"],
    ["notifyModeratorRevoked", "send_moderator_revoked"],
    ["notifyVerified", "send_account_verified"],
  ] as const)("%s queues %s with the instance wording", async ([fn, job]) => {
    await notices[fn]("ada@example.test", "ada");
    expect(queue.add).toHaveBeenCalledWith(job, { to: "ada@example.test", username: "ada", ...vars });
  });

  test("notifyModeratorDeleted carries the restore deadline", async () => {
    await notices.notifyModeratorDeleted("a@x.test", "ada", "2026-07-01T00:00:00.000Z");
    expect(queue.add).toHaveBeenCalledWith("send_account_deleted", {
      to: "a@x.test",
      username: "ada",
      expiresAt: "2026-07-01T00:00:00.000Z",
      ...vars,
    });
  });

  test("notifyEmailChanged writes to the old address and names the new one", async () => {
    await notices.notifyEmailChanged("old@x.test", "ada", "new@x.test");
    expect(queue.add).toHaveBeenCalledWith("send_account_email_changed", {
      to: "old@x.test",
      username: "ada",
      newEmail: "new@x.test",
      ...vars,
    });
  });

  test("notifyPostRemoved names the post", async () => {
    await notices.notifyPostRemoved("a@x.test", "ada", "My post");
    expect(queue.add).toHaveBeenCalledWith("send_post_removed", {
      to: "a@x.test",
      username: "ada",
      postTitle: "My post",
      ...vars,
    });
  });

  test("a failure resolving the instance wording is logged, never thrown", async () => {
    vi.mocked(instanceSetup.getAppName).mockRejectedValue(new Error("db down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notices.notifySuspended("a@x.test", "ada")).resolves.toBeUndefined();
    expect(queue.add).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  test("a failure in the queue is logged, never thrown", async () => {
    vi.mocked(queue.add).mockImplementationOnce(() => {
      throw new Error("redis down");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notices.notifyRestored("a@x.test", "ada")).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});

describe("notifyPasswordChanged", () => {
  test("looks the account up and mails its login address", async () => {
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "u1", email: "ada@x.test", username: "ada" }));
    await notices.notifyPasswordChanged("u1");
    expect(queue.add).toHaveBeenCalledWith("send_password_changed", { to: "ada@x.test", username: "ada", ...vars });
  });

  test("does nothing for an unknown account", async () => {
    vi.mocked(usersRepo.findById).mockResolvedValue(undefined);
    await notices.notifyPasswordChanged("ghost");
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("swallows a lookup failure", async () => {
    vi.mocked(usersRepo.findById).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notices.notifyPasswordChanged("u1")).resolves.toBeUndefined();
  });
});

describe("notifyPasskeyChanged", () => {
  test.for([
    ["added", "send_passkey_added"],
    ["removed", "send_passkey_removed"],
  ] as const)("%s mails the owner, naming the passkey", async ([change, job]) => {
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "u1", email: "ada@x.test", username: "ada" }));
    await notices.notifyPasskeyChanged(change, "u1", " Laptop ");
    expect(queue.add).toHaveBeenCalledWith(job, { to: "ada@x.test", username: "ada", passkeyName: "Laptop", ...vars });
  });

  test("an unnamed passkey is sent without a name", async () => {
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "u1", email: "ada@x.test", username: "ada" }));
    await notices.notifyPasskeyChanged("added", "u1", undefined);
    expect(queue.add).toHaveBeenCalledWith("send_passkey_added", expect.objectContaining({ passkeyName: null }));
  });

  test("does nothing for an unknown account and swallows failures", async () => {
    vi.mocked(usersRepo.findById).mockResolvedValue(undefined);
    await notices.notifyPasskeyChanged("removed", "ghost", "Laptop");
    expect(queue.add).not.toHaveBeenCalled();

    vi.mocked(usersRepo.findById).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notices.notifyPasskeyChanged("added", "u1", "Laptop")).resolves.toBeUndefined();
  });
});

describe("email change", () => {
  test("notifyEmailChangeCode sends the code to the new address", async () => {
    await notices.notifyEmailChangeCode("new@x.test", "482913");
    expect(queue.add).toHaveBeenCalledWith("send_email_change_code", { to: "new@x.test", code: "482913", ...vars });
  });

  test("notifyEmailChangedBySelf writes to the old address with the undo link", async () => {
    await notices.notifyEmailChangedBySelf("old@x.test", "ada", "new@x.test", "https://blog.example/u");
    expect(queue.add).toHaveBeenCalledWith("send_email_changed", {
      to: "old@x.test",
      username: "ada",
      newEmail: "new@x.test",
      undoUrl: "https://blog.example/u",
      ...vars,
    });
  });
});

describe("notifyPostAuthorRemoved", () => {
  test("tells the author whose post a moderator removed", async () => {
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "author", email: "a@x.test", username: "ada" }));
    await notices.notifyPostAuthorRemoved("author", "mod", "Title");
    expect(queue.add).toHaveBeenCalledWith("send_post_removed", expect.objectContaining({ postTitle: "Title" }));
  });

  test("an untitled post is named 'Untitled'", async () => {
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "author" }));
    await notices.notifyPostAuthorRemoved("author", "mod", null);
    expect(queue.add).toHaveBeenCalledWith("send_post_removed", expect.objectContaining({ postTitle: "Untitled" }));
  });

  test("stays silent for a self-removal, a remote post, or a gone author", async () => {
    await notices.notifyPostAuthorRemoved("author", "author", "T");
    await notices.notifyPostAuthorRemoved(null, "mod", "T");
    vi.mocked(usersRepo.findById).mockResolvedValue(undefined);
    await notices.notifyPostAuthorRemoved("author", "mod", "T");
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ deletedAt: new Date() }));
    await notices.notifyPostAuthorRemoved("author", "mod", "T");
    expect(queue.add).not.toHaveBeenCalled();
  });
});
