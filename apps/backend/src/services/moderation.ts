import bcrypt from "bcryptjs";
import { config } from "@/config.ts";
import * as accountsRepo from "@/db/repositories/accounts.ts";
import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as linksRepo from "@/db/repositories/profileLinks.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as reportsRepo from "@/db/repositories/reports.ts";
import type { ReportRow } from "@/db/repositories/reports.ts";
import * as sessionsRepo from "@/db/repositories/sessions.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
// SPDX-License-Identifier: AGPL-3.0-or-later
import * as usersRepo from "@/db/repositories/users.ts";
import type { AdminUserFilter } from "@/db/repositories/users.ts";
import type { BlockedDomain } from "@/db/schema.ts";
import { hostMatchesDomain, normalizeDomain } from "@/lib/domain.ts";
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/http.ts";
import { queue } from "@/queue/queue.ts";
import {
  notifyAdminGranted,
  notifyAdminRevoked,
  notifyEmailChanged,
  notifyModeratorDeleted,
  notifyReinstated,
  notifyRestored,
  notifySuspended,
  notifyVerified,
} from "@/services/accountNotices.ts";
import { federationRunning } from "@/services/federationState.ts";
import type { ProfileLinkInput } from "@/services/users.ts";
import * as usersService from "@/services/users.ts";

// Business logic for moderation. Admin authorization is enforced at the route
// layer (requireAdmin); these functions assume the caller is a moderator except
// `report`, which any signed-in user may call.

const MAX_REASON = 1000;

// ── Reports (user-facing) ──────────────────────────────────────────────────

// Files a report against a post or an account. Silently succeeds on a duplicate
// open report from the same reporter so the queue isn't floodable and the client
// needs no special-casing.
export async function report(
  reporterId: string,
  input: { subjectType: "post" | "user"; subjectId: string; reason?: string },
): Promise<void> {
  const { subjectType, subjectId } = input;
  if (subjectType !== "post" && subjectType !== "user") {
    throw badRequest("Unknown report subject.");
  }
  const reason = (input.reason ?? "").trim().slice(0, MAX_REASON);

  if (subjectType === "post") {
    const row = await postsRepo.findById(subjectId);
    if (!row) throw notFound("Post not found.");
  } else {
    const target = await usersRepo.findById(subjectId);
    if (!target) throw notFound("Account not found.");
    if (target.id === reporterId) throw badRequest("You can't report yourself.");
  }

  if (await reportsRepo.hasOpenDuplicate(reporterId, subjectType, subjectId)) return;

  await reportsRepo.create({
    reporterId,
    subjectType,
    postId: subjectType === "post" ? subjectId : null,
    userId: subjectType === "user" ? subjectId : null,
    reason,
  });
}

// ── Moderation queue (admin) ───────────────────────────────────────────────

export function listReports(status?: "open" | "resolved"): Promise<ReportRow[]> {
  return reportsRepo.list(status);
}

export function openReportCount(): Promise<number> {
  return reportsRepo.countOpen();
}

export async function resolveReport(adminId: string, reportId: string, resolution: string): Promise<void> {
  const fetchedReport = await reportsRepo.findById(reportId);
  if (!fetchedReport) throw notFound("Report not found.");
  if (fetchedReport.status === "resolved") return;
  await reportsRepo.resolve(reportId, adminId, (resolution ?? "").trim().slice(0, MAX_REASON));
}

// ── Users (admin) ──────────────────────────────────────────────────────────

export function listUsers(
  query = "",
  filter: AdminUserFilter = {},
): Promise<Awaited<ReturnType<typeof usersRepo.listForAdmin>>> {
  return usersRepo.listForAdmin(query, filter);
}

// Total local accounts, unfiltered — the admin user table's header count.
// Returned alongside the (possibly filtered / capped) list so the UI can show
// "N accounts" even while searching.
export function countUsers(): Promise<number> {
  return usersRepo.countUsers();
}

// Suspends or reinstates a local account. Admins cannot suspend themselves or
// other admins (protects the moderator team from lock-out and abuse). Suspending
// clears the target's sessions so the block takes effect immediately.
export async function setSuspended(adminId: string, targetId: string, suspend: boolean): Promise<void> {
  const target = await usersRepo.findById(targetId);
  if (!target) throw notFound("Account not found.");
  if (target.id === adminId) throw forbidden("You can't suspend your own account.");
  if (target.isAdmin) throw forbidden("You can't suspend another admin.");

  await usersRepo.setSuspended(targetId, suspend ? new Date() : null);
  if (suspend) {
    await sessionsRepo.removeAllForUser(targetId);
    await notifySuspended(target.email, target.username);
  } else {
    await notifyReinstated(target.email, target.username);
  }
}

// ── Admin role (promote / demote) ──────────────────────────────────────────

// Grants or revokes the admin role. A stolen admin session must not be enough
// to mint new admins, so the acting admin's own password is re-verified — the
// same bar as deletion, minus the username typing (the target is already
// picked, and the action is reversible). Guards: never self, never the last
// admin. The affected account is notified either way.
export async function setAdminRole(
  adminId: string,
  targetId: string,
  input: { makeAdmin: boolean; password: string },
): Promise<void> {
  const target = await usersRepo.findById(targetId);
  if (!target || target.deletedAt) throw notFound("Account not found.");
  if (target.id === adminId) throw forbidden("You can't change your own role.");
  const hash = await accountsRepo.findCredentialHashByUserId(adminId);
  if (!hash || !(await bcrypt.compare(input.password, hash))) {
    throw unauthorized("Incorrect password.");
  }
  if (target.isAdmin === input.makeAdmin) return;
  if (!input.makeAdmin && (await usersRepo.countAdmins()) <= 1) {
    throw forbidden("You can't remove the last admin.");
  }
  await usersRepo.setAdmin(targetId, input.makeAdmin);
  if (input.makeAdmin) {
    await notifyAdminGranted(target.email, target.username);
  } else {
    await notifyAdminRevoked(target.email, target.username);
  }
}

// ── User detail (admin) ────────────────────────────────────────────────────

// Everything the admin user detail shows: the table row plus post/follow
// counts, the latest posts, the profile tags/links backing the edit form, and
// every report filed against the account or its posts — the context behind a
// suspend/delete decision.
export async function getUserDetail(targetId: string) {
  const user = await usersRepo.findById(targetId);
  if (!user || user.deletedAt) throw notFound("Account not found.");
  const [postCounts, followCounts, recentPosts, reports] = await Promise.all([
    postsRepo.countsByAuthor(user.id),
    followsRepo.counts(user.id),
    postsRepo.listRecentByAuthor(user.id),
    reportsRepo.listAgainstUser(user.id),
  ]);
  const [tags, linkRows] = await Promise.all([tagsRepo.tagsForUser(user.id), linksRepo.listForUser(user.id)]);
  return {
    user,
    postCounts,
    followCounts,
    recentPosts,
    reports,
    tags,
    links: linkRows.map((l) => ({ platform: l.platform, url: l.url, label: l.label })),
  };
}

// How long a deleted account is kept restorable before the sweeper erases it
// for good. The admin UI shows the exact expiry per account.
export const DELETED_USER_RETENTION_DAYS = 30;

export function deletionExpiresAt(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + DELETED_USER_RETENTION_DAYS * 86_400_000);
}

// Deletes a local account. GitHub-style safety: the caller must supply the
// target's exact username plus the acting admin's own password, re-verified
// against the credential hash (a stolen admin session alone cannot wipe
// accounts). Like self-deletion, this federates Delete(actor) first, then
// soft-deletes: the row — posts, follows and all — is kept for the retention
// window so the deletion can be reverted, while the account itself cannot sign
// in and vanishes from every listing, profile, feed and actor lookup.
// Admins cannot delete themselves or other admins.
export async function deleteUser(
  adminId: string,
  targetId: string,
  input: { username: string; password: string },
): Promise<void> {
  const target = await usersRepo.findById(targetId);
  if (!target || target.deletedAt) throw notFound("Account not found.");
  if (target.id === adminId) throw forbidden("You can't delete your own account.");
  if (target.isAdmin) throw forbidden("You can't delete another admin.");
  if (input.username.trim() !== target.username) {
    throw badRequest("The typed username does not match this account.");
  }
  const hash = await accountsRepo.findCredentialHashByUserId(adminId);
  if (!hash || !(await bcrypt.compare(input.password, hash))) {
    throw unauthorized("Incorrect password.");
  }

  if (federationRunning()) {
    try {
      const { sendActorDelete } = await import("@/federation/outbound.ts");
      await sendActorDelete(target.id);
    } catch (err) {
      console.error("deleteUser: federated Delete failed (continuing):", err);
    }
  }
  const deletedAt = new Date();
  await usersRepo.setDeleted(targetId, deletedAt, adminId);
  await sessionsRepo.removeAllForUser(targetId);
  // Tell the account what happened and until when restoration is possible.
  await notifyModeratorDeleted(target.email, target.username, deletionExpiresAt(deletedAt).toISOString());
}

// Restores a deleted account within its retention window. The username and
// email were never freed (the row was kept), so restoration cannot conflict.
// Queues an actor update so instances that cached the Delete can refetch.
export async function restoreUser(targetId: string): Promise<void> {
  const target = await usersRepo.findById(targetId);
  if (!target || !target.deletedAt) throw notFound("Deleted account not found.");
  await usersRepo.setDeleted(targetId, null, null);
  await notifyRestored(target.email, target.username);
  queue.add("federate_actor_update", { userId: targetId });
}

// Recently deleted accounts with the deleting moderator's username, each
// account's kept post count, and when its retention window ends — the admin
// restore list.
export async function listDeletedUsers(): Promise<
  {
    user: NonNullable<Awaited<ReturnType<typeof usersRepo.findById>>>;
    deletedByUsername: string | null;
    postCount: number;
    expiresAt: Date;
  }[]
> {
  const rows = await usersRepo.listDeleted();
  const counts = await postsRepo.countLocalByAuthors(rows.map((r) => r.user.id));
  return rows.map((r) => ({
    ...r,
    postCount: counts.get(r.user.id) ?? 0,
    // `deletedAt` is non-null: listDeleted only returns deleted accounts.
    expiresAt: deletionExpiresAt(r.user.deletedAt!),
  }));
}

// Permanently erases a deleted account before its window ends. The Delete was
// already federated at delete time; this drops the row (cascades wipe the
// account's posts, follows and the rest) so the handle is freed immediately.
export async function purgeDeletedUser(targetId: string): Promise<void> {
  const target = await usersRepo.findById(targetId);
  if (!target || !target.deletedAt) throw notFound("Deleted account not found.");
  await usersRepo.hardRemove(targetId);
}

// Hard-deletes every account whose retention window ended before now. Returns
// how many were purged. Driven by the expiry sweeper (services/deletedUsers.ts).
export async function purgeExpiredDeletedUsers(now = new Date(), limit = 100): Promise<number> {
  const cutoff = new Date(now.getTime() - DELETED_USER_RETENTION_DAYS * 86_400_000);
  const expired = await usersRepo.listExpiredDeletedIds(cutoff, limit);
  for (const { id } of expired) {
    await usersRepo.hardRemove(id);
  }
  return expired.length;
}

// ── Email verification (admin) ───────────────────────────────────────────

// Manually marks an account's email verified — the escape hatch for when
// instance mail was misconfigured and the user can never receive the link.
// Idempotent; the account is notified it can sign in.
export async function verifyEmail(targetId: string): Promise<void> {
  const target = await usersRepo.findById(targetId);
  if (!target || target.deletedAt) throw notFound("Account not found.");
  if (target.emailVerified) return;
  await usersRepo.update(targetId, { emailVerified: true });
  await notifyVerified(target.email, target.username);
}

// Resends the verification email to an unverified account. Goes through
// Better Auth's own endpoint so token format and expiry stay in one place;
// already-verified is a caller error, not a silent no-op.
export async function resendVerification(targetId: string): Promise<void> {
  const target = await usersRepo.findById(targetId);
  if (!target || target.deletedAt) throw notFound("Account not found.");
  if (target.emailVerified) throw badRequest("This account's email is already verified.");
  try {
    const { auth } = await import("@/auth/auth.ts");
    await auth.api.sendVerificationEmail({ body: { email: target.email }, headers: new Headers() });
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Could not send the verification email.");
  }
}

// ── User details (admin edit) ────────────────────────────────────────────

export type AdminUpdateUserInput = {
  displayName?: string;
  bio?: string;
  publicEmail?: string;
  customSection?: string;
  tags?: string[];
  links?: ProfileLinkInput[];
  email?: string;
};

// Edits another account's profile + login email. Profile fields reuse the
// user's own update path (services/users.ts) so validation, tag/link caps and
// federation stay in one place; the login email has its own flow: it is
// normalized, checked for uniqueness, stored unverified, and the owner must
// prove the new address via the standard verification link while the previous
// address gets a security notice. Best-effort mail never fails the edit
// itself, except the verification send, which the admin can retry via the
// existing resend endpoint.
export async function updateUserDetails(targetId: string, input: AdminUpdateUserInput) {
  const target = await usersRepo.findById(targetId);
  if (!target || target.deletedAt) throw notFound("Account not found.");

  const { email, ...profileInput } = input;
  if (Object.keys(profileInput).length > 0) {
    await usersService.updateProfile(targetId, profileInput);
  }

  if (email !== undefined) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) throw badRequest("Enter a valid email address.");
    if (normalized.length > 254) throw badRequest("Email must be 254 characters or fewer.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw badRequest("Enter a valid email address.");
    }
    // Case-only canonicalisation needs no verification round-trip.
    if (normalized !== target.email) {
      if (normalized === target.email.toLowerCase()) {
        await usersRepo.update(targetId, { email: normalized });
        await accountsRepo.setCredentialAccountId(targetId, normalized);
      } else {
        const existing = await usersRepo.findByEmail(normalized);
        if (existing && existing.id !== targetId) throw badRequest("That email is already in use.");
        const oldEmail = (await usersRepo.findById(targetId))?.email ?? target.email;
        await usersRepo.update(targetId, { email: normalized, emailVerified: false });
        await accountsRepo.setCredentialAccountId(targetId, normalized);
        await notifyEmailChanged(oldEmail, target.username, normalized);
        try {
          const { auth } = await import("@/auth/auth.ts");
          await auth.api.sendVerificationEmail({ body: { email: normalized }, headers: new Headers() });
        } catch (err) {
          throw badRequest(
            `Email updated, but the verification email could not be sent: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  const updated = await usersRepo.findById(targetId);
  if (!updated) throw notFound("Account not found.");
  return updated;
}

// ── Posts (admin) ──────────────────────────────────────────────────────────

// Removes any local post (a moderator override — the author check in
// services/posts.ts is bypassed here). Remote/cached posts cannot be deleted.
export async function removePost(id: string): Promise<void> {
  const row = await postsRepo.findById(id);
  if (!row) throw notFound("Post not found.");
  if (row.post.remote) throw forbidden("Federated posts cannot be removed here.");
  await postsRepo.remove(id);
}

// ── Defederation (admin) ─────────────────────────────────────────────────

export function listBlockedDomains(): Promise<BlockedDomain[]> {
  return blockedDomainsRepo.list();
}

// Whether a hostname is defederated. On the federation hot path (cached).
export function isDomainBlocked(host: string): Promise<boolean> {
  return blockedDomainsRepo.isBlocked(host);
}

// Defederates a domain: refuses future federation with it and purges any content
// already cached from it (actors + their posts cascade). Returns the normalized
// domain and how many cached actors were removed.
export async function blockDomain(input: string, reason: string): Promise<{ domain: string; purged: number }> {
  const domain = normalizeDomain(input);
  if (!domain) throw badRequest("Enter a valid domain, e.g. example.social.");
  // Guard against locking ourselves out of our own instance.
  if (hostMatchesDomain(config.APP_DOMAIN, domain)) {
    throw badRequest("You can't block your own instance.");
  }
  await blockedDomainsRepo.add(domain, (reason ?? "").trim().slice(0, 1000));
  const purged = await remoteActorsRepo.removeByDomain(domain);
  return { domain, purged };
}

// Re-federates a domain. Existing cached content isn't restored — it re-populates
// on demand as users browse or the domain's servers deliver to us again.
export async function unblockDomain(input: string): Promise<void> {
  const domain = normalizeDomain(input) ?? input.trim().toLowerCase();
  await blockedDomainsRepo.remove(domain);
}
