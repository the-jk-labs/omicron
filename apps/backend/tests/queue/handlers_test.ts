// SPDX-License-Identifier: AGPL-3.0-or-later
// Jobs go through the real in-process queue into the registered handlers; the
// federation and mail functions at the far end are the stubbed boundary.
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock(import("@/federation/deliver.ts"));
vi.mock(import("@/federation/outbound.ts"));
vi.mock(import("@/federation/lists.ts"));
vi.mock(import("@/services/email.ts"));
vi.mock(import("@/services/indexNow.ts"));

import * as deliver from "@/federation/deliver.ts";
import * as lists from "@/federation/lists.ts";
import * as outbound from "@/federation/outbound.ts";
import { registerJobHandlers } from "@/queue/handlers.ts";
import { type JobName, type JobPayloads, queue } from "@/queue/queue.ts";
import * as email from "@/services/email.ts";
import { seedFederationRunning } from "@/services/federationState.ts";
import * as indexNow from "@/services/indexNow.ts";

beforeAll(() => {
  registerJobHandlers();
});

afterEach(() => {
  seedFederationRunning(false);
});

// queue.add runs the handler in a microtask; let it (and its dynamic import) settle.
async function run<N extends JobName>(name: N, payload: JobPayloads[N]) {
  queue.add(name, payload);
  await vi.waitFor(() => {});
  await new Promise((r) => setTimeout(r, 0));
}

const vars = { to: "a@x.test", username: "ada", appName: "Blog", origin: "https://blog.example" };

const federationJobs: [JobName, unknown, () => unknown, unknown[]][] = [
  ["federate_post", { postId: "p" }, () => deliver.deliverPost, ["p", "create"]],
  ["federate_post", { postId: "p", action: "update" }, () => deliver.deliverPost, ["p", "update"]],
  ["federate_post_delete", { postId: "p", authorId: "a" }, () => deliver.deliverPostDelete, ["p", "a"]],
  ["federate_comment", { commentId: "c" }, () => deliver.deliverComment, ["c", "create"]],
  [
    "federate_comment_delete",
    { commentId: "c", authorId: "a", postId: "p" },
    () => deliver.deliverCommentDelete,
    ["c", "a", "p"],
  ],
  ["federate_actor_update", { userId: "u" }, () => deliver.deliverActorUpdate, ["u"]],
  ["federate_list_item", { listId: "l", postId: "p", action: "add" }, () => lists.deliverListItem, ["l", "p", "add"]],
  ["send_follow", { followerId: "u", targetActor: "t" }, () => outbound.sendFollow, ["u", "t"]],
  ["send_unfollow", { followerId: "u", targetActor: "t" }, () => outbound.sendUnfollow, ["u", "t"]],
  ["send_block", { blockerId: "u", targetActor: "t" }, () => outbound.sendBlock, ["u", "t"]],
  ["send_unblock", { blockerId: "u", targetActor: "t" }, () => outbound.sendUndoBlock, ["u", "t"]],
  ["send_reject_follow", { userId: "u", targetActor: "t" }, () => outbound.sendRejectFollow, ["u", "t"]],
  [
    "send_accept_follow",
    { userId: "u", targetActor: "t", followActivityId: "f" },
    () => outbound.sendAcceptFollow,
    ["u", "t", "f"],
  ],
  ["send_recommend", { userId: "u", postId: "p" }, () => outbound.sendRecommend, ["u", "p"]],
  ["send_unrecommend", { userId: "u", postId: "p" }, () => outbound.sendUnrecommend, ["u", "p"]],
];

const mailJobs: [JobName, unknown, () => unknown, unknown[]][] = [
  ["send_password_reset", { to: "a@x.test", url: "u" }, () => email.sendPasswordReset, ["a@x.test", "u"]],
  ["send_email_verification", { to: "a@x.test", url: "u" }, () => email.sendEmailVerification, ["a@x.test", "u"]],
  [
    "send_account_deleted",
    { ...vars, expiresAt: "e" },
    () => email.sendAccountDeleted,
    ["a@x.test", { username: "ada", appName: "Blog", origin: "https://blog.example", expiresAt: "e" }],
  ],
  [
    "send_password_changed",
    vars,
    () => email.sendPasswordChanged,
    ["a@x.test", { username: "ada", appName: "Blog", origin: "https://blog.example" }],
  ],
  [
    "send_account_erased",
    vars,
    () => email.sendAccountErased,
    ["a@x.test", expect.objectContaining({ username: "ada" })],
  ],
  [
    "send_account_suspended",
    vars,
    () => email.sendAccountSuspended,
    ["a@x.test", expect.objectContaining({ username: "ada" })],
  ],
  [
    "send_account_reinstated",
    vars,
    () => email.sendAccountReinstated,
    ["a@x.test", expect.objectContaining({ username: "ada" })],
  ],
  [
    "send_account_restored",
    vars,
    () => email.sendAccountRestored,
    ["a@x.test", expect.objectContaining({ username: "ada" })],
  ],
  [
    "send_admin_granted",
    vars,
    () => email.sendAdminGranted,
    ["a@x.test", expect.objectContaining({ username: "ada" })],
  ],
  [
    "send_admin_revoked",
    vars,
    () => email.sendAdminRevoked,
    ["a@x.test", expect.objectContaining({ username: "ada" })],
  ],
  [
    "send_moderator_granted",
    vars,
    () => email.sendModeratorGranted,
    ["a@x.test", expect.objectContaining({ username: "ada" })],
  ],
  [
    "send_moderator_revoked",
    vars,
    () => email.sendModeratorRevoked,
    ["a@x.test", expect.objectContaining({ username: "ada" })],
  ],
  [
    "send_post_removed",
    { ...vars, postTitle: "T" },
    () => email.sendPostRemoved,
    ["a@x.test", expect.objectContaining({ postTitle: "T" })],
  ],
  [
    "send_account_verified",
    vars,
    () => email.sendAccountVerified,
    ["a@x.test", expect.objectContaining({ username: "ada" })],
  ],
  [
    "send_account_email_changed",
    { ...vars, newEmail: "n@x.test" },
    () => email.sendAccountEmailChanged,
    ["a@x.test", expect.objectContaining({ newEmail: "n@x.test" })],
  ],
];

describe("federation jobs", () => {
  test.for(federationJobs)("%s reaches its delivery function", async ([name, payload, fn, args]) => {
    seedFederationRunning(true);
    await run(name, payload as never);
    expect(fn()).toHaveBeenCalledWith(...args);
  });

  test.for(federationJobs)("%s is dropped while federation is off", async ([name, payload, fn]) => {
    seedFederationRunning(false);
    await run(name, payload as never);
    expect(fn()).not.toHaveBeenCalled();
  });
});

describe("mail jobs", () => {
  test.for(mailJobs)("%s reaches its sender", async ([name, payload, fn, args]) => {
    await run(name, payload as never);
    expect(fn()).toHaveBeenCalledWith(...args);
  });
});

test("IndexNow runs whether or not federation is on", async () => {
  seedFederationRunning(false);
  await run("indexnow_submit", { postId: "p" });
  expect(indexNow.submitPost).toHaveBeenCalledWith("p");
});

test("every job name has a handler (none is silently dropped)", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const all = [...federationJobs, ...mailJobs, ["indexnow_submit", { postId: "p" }, () => null, []] as const];
  for (const [name, payload] of all) queue.add(name, payload as never);
  await new Promise((r) => setTimeout(r, 0));
  expect(warn).not.toHaveBeenCalled();
  // Every member of JobName is exercised above.
  expect(new Set(all.map(([n]) => n)).size).toBe(30);
});

test("a failing handler is logged, never thrown into the caller", async () => {
  seedFederationRunning(true);
  vi.mocked(deliver.deliverPost).mockRejectedValue(new Error("remote down"));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => queue.add("federate_post", { postId: "p" })).not.toThrow();
  await vi.waitFor(() => expect(error).toHaveBeenCalledWith('queue: job "federate_post" failed:', expect.any(Error)));
});
