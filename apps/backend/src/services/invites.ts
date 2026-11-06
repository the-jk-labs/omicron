// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash, randomBytes } from "node:crypto";
import * as invitesRepo from "@/db/repositories/invites.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { notFound } from "@/lib/http.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { inviteOnlyEnabled } from "@/services/settings.ts";

// Invite-only sign-up. With no invites out, this is simply a closed instance,
// which is what someone running a personal blog wants.

export const INVITE_TTL_MS = 7 * 24 * 3_600_000;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** The plaintext token exists only in this one response. */
export async function create(adminId: string) {
  const token = randomBytes(24).toString("base64url");
  const invite = await invitesRepo.create(hash(token), adminId, new Date(Date.now() + INVITE_TTL_MS));
  return { invite, url: `${await getOrigin()}/register?invite=${token}` };
}

export const list = () => invitesRepo.list(new Date());

export async function revoke(id: string) {
  if (!(await invitesRepo.remove(id))) throw notFound("Invite not found.");
}

// The first account is the owner made by the setup wizard, who can't have been invited.
async function inviteRequired(): Promise<boolean> {
  return (await inviteOnlyEnabled()) && (await usersRepo.countUsers()) > 0;
}

/** Checked first, so a closed instance says nothing about which emails or usernames it holds. */
export async function mayAttemptSignUp(token: unknown): Promise<boolean> {
  if (!(await inviteRequired())) return true;
  return typeof token === "string" && invitesRepo.isUsable(hash(token), new Date());
}

/**
 * The gate itself, run just before the account is written: every other check has
 * passed by then, so a mistyped password never costs someone their invite.
 */
export async function claimForSignUp(token: unknown, username: string): Promise<boolean> {
  if (!(await inviteRequired())) return true;
  return typeof token === "string" && invitesRepo.claim(hash(token), username, new Date());
}
