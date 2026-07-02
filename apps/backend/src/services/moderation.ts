// SPDX-License-Identifier: AGPL-3.0-or-later
import * as usersRepo from "@/db/repositories/users.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as reportsRepo from "@/db/repositories/reports.ts";
import * as sessionsRepo from "@/db/repositories/sessions.ts";
import { badRequest, forbidden, notFound } from "@/lib/http.ts";
import type { ReportRow } from "@/db/repositories/reports.ts";

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

export async function resolveReport(
  adminId: string,
  reportId: string,
  resolution: string,
): Promise<void> {
  const report = await reportsRepo.findById(reportId);
  if (!report) throw notFound("Report not found.");
  if (report.status === "resolved") return;
  await reportsRepo.resolve(reportId, adminId, (resolution ?? "").trim().slice(0, MAX_REASON));
}

// ── Users (admin) ──────────────────────────────────────────────────────────

export function listUsers(query = ""): Promise<Awaited<ReturnType<typeof usersRepo.listForAdmin>>> {
  return usersRepo.listForAdmin(query);
}

// Suspends or reinstates a local account. Admins cannot suspend themselves or
// other admins (protects the moderator team from lock-out and abuse). Suspending
// clears the target's sessions so the block takes effect immediately.
export async function setSuspended(
  adminId: string,
  targetId: string,
  suspend: boolean,
): Promise<void> {
  const target = await usersRepo.findById(targetId);
  if (!target) throw notFound("Account not found.");
  if (target.id === adminId) throw forbidden("You can't suspend your own account.");
  if (target.isAdmin) throw forbidden("You can't suspend another admin.");

  await usersRepo.setSuspended(targetId, suspend ? new Date() : null);
  if (suspend) await sessionsRepo.removeAllForUser(targetId);
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
