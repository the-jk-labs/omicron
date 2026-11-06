// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, desc, eq, gt, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type Invite, invites } from "@/db/schema.ts";

export const INVITES_PAGE_SIZE = 100;

export async function create(tokenHash: string, createdBy: string, expiresAt: Date): Promise<Invite> {
  const [row] = await db.insert(invites).values({ tokenHash, createdBy, expiresAt }).returning();
  return row;
}

// Unexpired invites plus used ones, newest first; an expired invite has nothing left to manage.
export function list(now: Date): Promise<Invite[]> {
  return db
    .select()
    .from(invites)
    .where(or(gt(invites.expiresAt, now), isNotNull(invites.usedAt)))
    .orderBy(desc(invites.createdAt))
    .limit(INVITES_PAGE_SIZE);
}

export async function isUsable(tokenHash: string, now: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.tokenHash, tokenHash), isNull(invites.usedAt), gt(invites.expiresAt, now)));
  return row !== undefined;
}

// Atomic, so two sign-ups racing on one invite can't both win.
export async function claim(tokenHash: string, username: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(invites)
    .set({ usedAt: now, usedByUsername: username })
    .where(and(eq(invites.tokenHash, tokenHash), isNull(invites.usedAt), gt(invites.expiresAt, now)))
    .returning({ id: invites.id });
  return rows.length > 0;
}

export async function remove(id: string): Promise<boolean> {
  const rows = await db.delete(invites).where(eq(invites.id, id)).returning({ id: invites.id });
  return rows.length > 0;
}
