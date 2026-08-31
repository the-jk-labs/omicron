// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { sessions } from "@/db/schema.ts";

// Drops every Better Auth session for a user — used when an admin suspends an
// account so the block takes effect immediately (sessions are validated against
// the DB on each request, so no cookie cache can outlive this).
export async function removeAllForUser(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
