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

/** Admin-granted notice after a moderator promotes the account. */
export async function notifyAdminGranted(email: string, username: string): Promise<void> {
  try {
    queue.add("send_admin_granted", { to: email, username, ...(await instanceVars()) });
  } catch (err) {
    console.error("accountNotices: failed to queue admin-granted notice (continuing):", err);
  }
}

/** Admin-revoked notice after a moderator demotes the account. */
export async function notifyAdminRevoked(email: string, username: string): Promise<void> {
  try {
    queue.add("send_admin_revoked", { to: email, username, ...(await instanceVars()) });
  } catch (err) {
    console.error("accountNotices: failed to queue admin-revoked notice (continuing):", err);
  }
}

/** Moderator-granted notice after an admin promotes the account. */
export async function notifyModeratorGranted(email: string, username: string): Promise<void> {
  try {
    queue.add("send_moderator_granted", { to: email, username, ...(await instanceVars()) });
  } catch (err) {
    console.error("accountNotices: failed to queue moderator-granted notice (continuing):", err);
  }
}

/** Moderator-revoked notice after an admin demotes the account. */
export async function notifyModeratorRevoked(email: string, username: string): Promise<void> {
  try {
    queue.add("send_moderator_revoked", { to: email, username, ...(await instanceVars()) });
  } catch (err) {
    console.error("accountNotices: failed to queue moderator-revoked notice (continuing):", err);
  }
}

/** Post-removed notice after a moderator takes down one of the account's posts. */
export async function notifyPostRemoved(email: string, username: string, postTitle: string): Promise<void> {
  try {
    queue.add("send_post_removed", { to: email, username, postTitle, ...(await instanceVars()) });
  } catch (err) {
    console.error("accountNotices: failed to queue post-removed notice (continuing):", err);
  }
}

/** Opt-in variant: tells the author their post was removed, unless they
 * removed it themselves or are gone. The checkbox lives in the moderation
 * dialogs; the default is silence. */
export async function notifyPostAuthorRemoved(
  authorId: string | null,
  deleterId: string,
  postTitle: string | null,
): Promise<void> {
  if (!authorId || authorId === deleterId) return;
  const author = await usersRepo.findById(authorId);
  if (!author || author.deletedAt) return;
  await notifyPostRemoved(author.email, author.username, postTitle ?? "Untitled");
}

/** Verified notice after an admin manually confirms the address. */
export async function notifyVerified(email: string, username: string): Promise<void> {
  try {
    queue.add("send_account_verified", { to: email, username, ...(await instanceVars()) });
  } catch (err) {
    console.error("accountNotices: failed to queue verified notice (continuing):", err);
  }
}

/** Login-email-changed notice to the previous address. Best-effort. */
export async function notifyEmailChanged(oldEmail: string, username: string, newEmail: string): Promise<void> {
  try {
    queue.add("send_account_email_changed", { to: oldEmail, username, newEmail, ...(await instanceVars()) });
  } catch (err) {
    console.error("accountNotices: failed to queue email-changed notice (continuing):", err);
  }
}
