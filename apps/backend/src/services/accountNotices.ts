// SPDX-License-Identifier: AGPL-3.0-or-later
import * as usersRepo from "@/db/repositories/users.ts";
import { queue } from "@/queue/queue.ts";
import { getAppName, getOrigin } from "@/services/instanceSetup.ts";

// Best-effort account lifecycle emails (password changes, suspensions,
// deletions and their reversals). Every helper resolves the instance wording,
// queues the notice off the request path, and swallows failures with a log —
// a mail problem must never fail the operation the notice describes.

async function instanceVars(): Promise<{ appName: string; origin: string }> {
  const [appName, origin] = await Promise.all([getAppName(), getOrigin()]);
  return { appName, origin };
}

/** Security notice after a credential password change (change or reset). */
export async function notifyPasswordChanged(userId: string): Promise<void> {
  try {
    const user = await usersRepo.findById(userId);
    if (!user) return;
    queue.add("send_password_changed", { to: user.email, username: user.username, ...(await instanceVars()) });
  } catch (err) {
    console.error("accountNotices: failed to queue password-changed notice (continuing):", err);
  }
}

/** Receipt after self-service account deletion (the row is already gone). */
export async function notifySelfDeleted(email: string, username: string): Promise<void> {
  try {
    queue.add("send_account_erased", { to: email, username, ...(await instanceVars()) });
  } catch (err) {
    console.error("accountNotices: failed to queue self-deletion receipt (continuing):", err);
  }
}

/** Suspension notice after a moderator suspends the account. */
export async function notifySuspended(email: string, username: string): Promise<void> {
  try {
    queue.add("send_account_suspended", { to: email, username, ...(await instanceVars()) });
  } catch (err) {
    console.error("accountNotices: failed to queue suspension notice (continuing):", err);
  }
}

/** Reinstatement notice after a moderator lifts the suspension. */
export async function notifyReinstated(email: string, username: string): Promise<void> {
  try {
    queue.add("send_account_reinstated", { to: email, username, ...(await instanceVars()) });
  } catch (err) {
    console.error("accountNotices: failed to queue reinstatement notice (continuing):", err);
  }
}

/** Restore notice after a moderator brings back a deleted account. */
export async function notifyRestored(email: string, username: string): Promise<void> {
  try {
    queue.add("send_account_restored", { to: email, username, ...(await instanceVars()) });
  } catch (err) {
    console.error("accountNotices: failed to queue restore notice (continuing):", err);
  }
}

/** Deletion notice after a moderator deletes the account. `expiresAt` is ISO. */
export async function notifyModeratorDeleted(email: string, username: string, expiresAt: string): Promise<void> {
  try {
    queue.add("send_account_deleted", { to: email, username, expiresAt, ...(await instanceVars()) });
  } catch (err) {
    console.error("accountNotices: failed to queue deletion notice (continuing):", err);
  }
}
