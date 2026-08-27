// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { uploads } from "@/db/schema.ts";

// Upload-record DB access. Services never touch `db` directly. One row per
// accepted media upload, mirroring the file on disk (see db/schema.ts for why
// the row and the file are deliberately decoupled).

export async function create(ownerId: string, filename: string, bytes: number) {
  await db.insert(uploads).values({ ownerId, filename, bytes });
}

// Total bytes a user has uploaded. Read-only today (abuse inspection), and the
// natural hook for per-user quotas if those land later.
export async function sumBytesForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${uploads.bytes}), 0)::bigint` })
    .from(uploads)
    .where(eq(uploads.ownerId, userId));
  return row?.total ?? 0;
}
