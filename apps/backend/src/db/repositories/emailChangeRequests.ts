// SPDX-License-Identifier: AGPL-3.0-or-later
import { aliasedTable, desc, eq } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type EmailChangeRequest, emailChangeRequests, users } from "@/db/schema.ts";

// Moderators' pending login-email changes, waiting for an admin.

// Files a request, replacing any pending one for the same account.
export async function upsert(userId: string, requestedBy: string, newEmail: string): Promise<EmailChangeRequest> {
  const [row] = await db
    .insert(emailChangeRequests)
    .values({ userId, requestedBy, newEmail })
    .onConflictDoUpdate({
      target: emailChangeRequests.userId,
      set: { requestedBy, newEmail, createdAt: new Date() },
    })
    .returning();
  return row;
}

export async function findById(id: string): Promise<EmailChangeRequest | undefined> {
  const [row] = await db.select().from(emailChangeRequests).where(eq(emailChangeRequests.id, id));
  return row;
}

export async function deleteById(id: string): Promise<void> {
  await db.delete(emailChangeRequests).where(eq(emailChangeRequests.id, id));
}

const requester = aliasedTable(users, "requester");

export type PendingEmailChange = {
  request: EmailChangeRequest;
  user: { id: string; username: string; displayName: string; email: string };
  requester: { id: string; username: string; displayName: string } | null;
};

// Every pending request with the account it changes and who asked, newest first.
export function listPending(): Promise<PendingEmailChange[]> {
  return db
    .select({
      request: emailChangeRequests,
      user: { id: users.id, username: users.username, displayName: users.displayName, email: users.email },
      requester: { id: requester.id, username: requester.username, displayName: requester.displayName },
    })
    .from(emailChangeRequests)
    .innerJoin(users, eq(emailChangeRequests.userId, users.id))
    .leftJoin(requester, eq(emailChangeRequests.requestedBy, requester.id))
    .orderBy(desc(emailChangeRequests.createdAt));
}
