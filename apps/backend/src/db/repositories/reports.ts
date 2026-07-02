// SPDX-License-Identifier: AGPL-3.0-or-later
import { aliasedTable, and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type NewReport, posts, reports, users } from "@/db/schema.ts";

// All report (moderation-queue) DB access. Services/routes never touch `db`.

// The reporter and the reported user are both `users` rows, so the reported-user
// join needs an alias to disambiguate from the reporter join.
const reporter = aliasedTable(users, "reporter");
const subjectUser = aliasedTable(users, "subject_user");

// A queue row enriched for display: the report plus a light summary of who filed
// it and what it targets (post title / author, or the reported account handle).
export type ReportRow = {
  id: string;
  subjectType: string;
  reason: string;
  status: string;
  resolution: string;
  createdAt: Date;
  resolvedAt: Date | null;
  reporter: { username: string; displayName: string } | null;
  postId: string | null;
  postTitle: string | null;
  postAuthor: string | null;
  userId: string | null;
  userUsername: string | null;
  userDisplayName: string | null;
};

const postAuthor = aliasedTable(users, "post_author");

function baseQuery() {
  return db
    .select({
      id: reports.id,
      subjectType: reports.subjectType,
      reason: reports.reason,
      status: reports.status,
      resolution: reports.resolution,
      createdAt: reports.createdAt,
      resolvedAt: reports.resolvedAt,
      reporterUsername: reporter.username,
      reporterDisplayName: reporter.displayName,
      postId: reports.postId,
      postTitle: posts.title,
      postAuthor: postAuthor.username,
      userId: reports.userId,
      userUsername: subjectUser.username,
      userDisplayName: subjectUser.displayName,
    })
    .from(reports)
    .leftJoin(reporter, eq(reports.reporterId, reporter.id))
    .leftJoin(posts, eq(reports.postId, posts.id))
    .leftJoin(postAuthor, eq(posts.authorId, postAuthor.id))
    .leftJoin(subjectUser, eq(reports.userId, subjectUser.id));
}

function shape(r: Awaited<ReturnType<ReturnType<typeof baseQuery>["execute"]>>[number]): ReportRow {
  return {
    id: r.id,
    subjectType: r.subjectType,
    reason: r.reason,
    status: r.status,
    resolution: r.resolution,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    reporter: r.reporterUsername
      ? { username: r.reporterUsername, displayName: r.reporterDisplayName ?? "" }
      : null,
    postId: r.postId,
    postTitle: r.postTitle,
    postAuthor: r.postAuthor,
    userId: r.userId,
    userUsername: r.userUsername,
    userDisplayName: r.userDisplayName,
  };
}

// The queue: open reports first, newest first, capped.
export async function list(status?: "open" | "resolved", limit = 200): Promise<ReportRow[]> {
  const q = baseQuery();
  const rows = await (status ? q.where(eq(reports.status, status)) : q)
    .orderBy(desc(reports.createdAt))
    .limit(limit);
  return rows.map(shape);
}

export function findById(id: string) {
  return db.query.reports.findFirst({ where: eq(reports.id, id) });
}

export async function create(data: NewReport) {
  const [row] = await db.insert(reports).values(data).returning();
  return row;
}

// Whether this reporter already has an open report against the same subject —
// used to keep duplicate flags from flooding the queue.
export async function hasOpenDuplicate(
  reporterId: string,
  subjectType: "post" | "user",
  subjectId: string,
): Promise<boolean> {
  const col = subjectType === "post" ? reports.postId : reports.userId;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reports)
    .where(and(eq(reports.reporterId, reporterId), eq(reports.status, "open"), eq(col, subjectId)));
  return (row?.n ?? 0) > 0;
}

export async function countOpen(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reports)
    .where(eq(reports.status, "open"));
  return row?.n ?? 0;
}

// Marks a report resolved with an admin note and handler.
export async function resolve(id: string, handledBy: string, resolution: string) {
  const [row] = await db
    .update(reports)
    .set({ status: "resolved", resolution, handledBy, resolvedAt: new Date() })
    .where(eq(reports.id, id))
    .returning();
  return row;
}
