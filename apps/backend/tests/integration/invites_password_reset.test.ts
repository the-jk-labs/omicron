// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Invite-only sign-up and the password reset paths, against real Postgres and
// the real Better Auth instance: the gate has to hold in the sign-up flow itself,
// not just in the routes around it.
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { auth } from "@/auth/auth.ts";
import { sql } from "@/db/client.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { HttpError } from "@/lib/http.ts";
import * as emailSettings from "@/services/emailSettings.ts";
import * as invites from "@/services/invites.ts";
import * as moderation from "@/services/moderation.ts";
import { nodeInfo } from "@/services/nodeInfo.ts";
import { createAdminResetLink } from "@/services/ownerReset.ts";
import * as settings from "@/services/settings.ts";
import { closeDb, mkSession, mkUser, resetDb } from "./harness.ts";

const PASSWORD = "correct-horse-battery-staple-12";

function signUp(username: string, inviteToken?: string, password = PASSWORD) {
  const body = { email: `${username}@test.dev`, password, name: username, username, inviteToken };
  return auth.api.signUpEmail({ body });
}

const tokenOf = (url: string) => new URL(url).searchParams.get("invite") ?? "";
const codeOf = async (promise: Promise<unknown>) =>
  promise.then(
    () => "accepted",
    (err: { body?: { code?: string } }) => err.body?.code ?? "other-error",
  );

async function statusOf(promise: Promise<unknown>) {
  try {
    await promise;
    return 200;
  } catch (err) {
    if (err instanceof HttpError) return err.status;
    throw err;
  }
}

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await resetDb();
  await sql`truncate invites`;
  await settings.setInviteOnly(false);
  vi.restoreAllMocks();
});

describe("invite-only sign-up", () => {
  test("an open instance takes anyone, and says so", async () => {
    await mkUser("owner");
    expect(await codeOf(signUp("visitor"))).toBe("accepted");
    expect((await nodeInfo()).openRegistrations).toBe(true);
  });

  test("the setup wizard's first account never needs an invite", async () => {
    await settings.setInviteOnly(true);
    expect(await codeOf(signUp("founder"))).toBe("accepted");
    expect((await usersRepo.findByUsername("founder"))?.isAdmin).toBe(true);
  });

  test("closed: no invite and a made-up invite are both refused, and nothing is created", async () => {
    await mkUser("owner");
    await settings.setInviteOnly(true);
    expect(await codeOf(signUp("visitor"))).toBe("INVITE_REQUIRED");
    expect(await codeOf(signUp("visitor", "made-up"))).toBe("INVITE_REQUIRED");
    expect(await usersRepo.findByUsername("visitor")).toBeFalsy();
    expect((await nodeInfo()).openRegistrations).toBe(false);
  });

  test("closed: a taken email gets the same answer, so it can't be used to probe accounts", async () => {
    const owner = await mkUser("owner");
    await settings.setInviteOnly(true);
    const body = { email: owner.email, password: PASSWORD, name: "x", username: "someone" };
    expect(await codeOf(auth.api.signUpEmail({ body }))).toBe("INVITE_REQUIRED");
  });

  test("an invite works once, and records who used it", async () => {
    const owner = await mkUser("owner");
    await settings.setInviteOnly(true);
    const { url } = await invites.create(owner.id);
    expect(await codeOf(signUp("first", tokenOf(url)))).toBe("accepted");
    expect(await codeOf(signUp("second", tokenOf(url)))).toBe("INVITE_REQUIRED");
    expect((await invites.list())[0]?.usedByUsername).toBe("first");
  });

  test("two sign-ups racing on one invite can't both win", async () => {
    const owner = await mkUser("owner");
    await settings.setInviteOnly(true);
    const token = tokenOf((await invites.create(owner.id)).url);
    const results = await Promise.all([codeOf(signUp("racer_a", token)), codeOf(signUp("racer_b", token))]);
    expect(results.filter((result) => result === "accepted")).toHaveLength(1);
    expect(results).toContain("INVITE_REQUIRED");
    expect(await usersRepo.countUsers()).toBe(2);
  });

  test("a rejected password doesn't cost someone their invite", async () => {
    const owner = await mkUser("owner");
    await settings.setInviteOnly(true);
    const token = tokenOf((await invites.create(owner.id)).url);
    expect(await codeOf(signUp("visitor", token, "short"))).not.toBe("accepted");
    expect(await codeOf(signUp("visitor", token))).toBe("accepted");
  });

  test("an expired or revoked invite stops working", async () => {
    const owner = await mkUser("owner");
    await settings.setInviteOnly(true);
    const expired = await invites.create(owner.id);
    await sql`update invites set expires_at = now() - interval '1 minute' where id = ${expired.invite.id}`;
    expect(await codeOf(signUp("late", tokenOf(expired.url)))).toBe("INVITE_REQUIRED");

    const revoked = await invites.create(owner.id);
    await invites.revoke(revoked.invite.id);
    expect(await codeOf(signUp("late", tokenOf(revoked.url)))).toBe("INVITE_REQUIRED");
  });

  test("the database never holds a usable token", async () => {
    const owner = await mkUser("owner");
    const { invite, url } = await invites.create(owner.id);
    expect(invite.tokenHash).not.toBe(tokenOf(url));
    expect(url).not.toContain(invite.tokenHash);
  });
});

describe("sending a password reset", () => {
  const sendsMail = () => vi.spyOn(emailSettings, "getEmailMode").mockResolvedValue("smtp");

  test("a moderator can send one to a regular account", async () => {
    sendsMail();
    const reset = vi.spyOn(auth.api, "requestPasswordReset").mockResolvedValue({ status: true } as never);
    const [moderator, member] = [await mkUser("mod", { isModerator: true }), await mkUser("member")];
    await moderation.sendPasswordReset(moderator.id, member.id);
    expect(reset).toHaveBeenCalledExactlyOnceWith({
      body: { email: member.email, redirectTo: "/reset-password" },
    });
  });

  test("a moderator can't send one to an admin or another moderator", async () => {
    sendsMail();
    const [moderator, peer, admin] = [
      await mkUser("mod", { isModerator: true }),
      await mkUser("peer", { isModerator: true }),
      await mkUser("boss", { isAdmin: true }),
    ];
    expect(await statusOf(moderation.sendPasswordReset(moderator.id, peer.id))).toBe(403);
    expect(await statusOf(moderation.sendPasswordReset(moderator.id, admin.id))).toBe(403);
  });

  test("an admin can send one to another admin, but not to themselves", async () => {
    sendsMail();
    vi.spyOn(auth.api, "requestPasswordReset").mockResolvedValue({ status: true } as never);
    const [admin, other] = [await mkUser("boss", { isAdmin: true }), await mkUser("cofounder", { isAdmin: true })];
    expect(await statusOf(moderation.sendPasswordReset(admin.id, other.id))).toBe(200);
    expect(await statusOf(moderation.sendPasswordReset(admin.id, admin.id))).toBe(403);
  });

  test("with no email set up it says so, rather than claiming a mail went out", async () => {
    vi.spyOn(emailSettings, "getEmailMode").mockResolvedValue("console");
    const [admin, member] = [await mkUser("boss", { isAdmin: true }), await mkUser("member")];
    expect(await statusOf(moderation.sendPasswordReset(admin.id, member.id))).toBe(409);
  });
});

describe("the admin's own recovery link", () => {
  test("only admins can get one", async () => {
    await mkUser("member");
    await expect(createAdminResetLink("member")).rejects.toThrow(/No admin account/);
    await expect(createAdminResetLink("nobody")).rejects.toThrow(/No admin account/);
  });

  test("it sets the password once and ends every existing session", async () => {
    const admin = await mkUser("boss", { isAdmin: true });
    await mkSession(admin.id, new Date());
    const token = new URL(await createAdminResetLink("@Boss")).searchParams.get("token") ?? "";

    await auth.api.resetPassword({ body: { token, newPassword: PASSWORD } });

    expect(await sql`select id from sessions where user_id = ${admin.id}`).toHaveLength(0);
    await expect(auth.api.resetPassword({ body: { token, newPassword: PASSWORD } })).rejects.toThrow("Invalid token");
  });
});
