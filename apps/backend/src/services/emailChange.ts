// SPDX-License-Identifier: AGPL-3.0-or-later
import * as accountsRepo from "@/db/repositories/accounts.ts";
import * as undoRepo from "@/db/repositories/emailChangeUndo.ts";
import * as passkeysRepo from "@/db/repositories/passkeys.ts";
import * as sessionsRepo from "@/db/repositories/sessions.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { badRequest, conflict } from "@/lib/http.ts";
import { hashToken } from "@/lib/tokens.ts";
import { getOrigin } from "@/services/instanceSetup.ts";

// The self-service email change runs on Better Auth's email-OTP plugin (see
// auth/auth.ts). This is the part it has no answer for: a link in the notice
// to the old address that takes the account back if the change wasn't the owner.

const UNDO_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EXPIRED = "This link has expired or was already used.";

/** A one-time link, valid for 7 days, that reverses this email change. */
export async function createUndoLink(userId: string, oldEmail: string, newEmail: string): Promise<string> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  await undoRepo.create(await hashToken(token), { userId, oldEmail, newEmail }, new Date(Date.now() + UNDO_TTL_MS));
  return `${await getOrigin()}/undo-email-change?token=${token}`;
}

/**
 * Puts the old address back and locks the account down as if it were stolen:
 * every session ends, passkeys are removed and the password is cleared, so
 * whoever made the change is shut out. A password-reset link goes to the
 * restored address. Returns that address.
 */
export async function undoEmailChange(token: string): Promise<string> {
  const tokenHash = await hashToken(token);
  const undo = await undoRepo.find(tokenHash);
  if (!undo) throw badRequest(EXPIRED);
  const user = await usersRepo.findById(undo.userId);
  if (!user || user.deletedAt) throw badRequest(EXPIRED);
  const holder = await usersRepo.findByEmail(undo.oldEmail);
  if (holder && holder.id !== user.id) {
    throw conflict("Your old address now belongs to another account. Contact the instance administrator.");
  }

  await usersRepo.update(user.id, { email: undo.oldEmail, emailVerified: true });
  await Promise.all([
    sessionsRepo.removeAllForUser(user.id),
    passkeysRepo.deleteAllForUser(user.id),
    accountsRepo.clearCredentialPassword(user.id),
    undoRepo.remove(tokenHash),
  ]);

  try {
    const { auth } = await import("@/auth/auth.ts");
    await auth.api.requestPasswordReset({ body: { email: undo.oldEmail, redirectTo: "/reset-password" } });
  } catch (err) {
    // The page also points at /forgot-password, so a mail hiccup isn't a dead end.
    console.error("emailChange: could not send the password reset after an undo (continuing):", err);
  }
  return undo.oldEmail;
}
