// SPDX-License-Identifier: AGPL-3.0-or-later
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { type ProfileLink, profileLinks } from "@/db/schema.ts";

// Profile-link DB access. A user's links are edited as a whole ordered set, so
// the write path replaces them transactionally (delete-then-insert) — far
// simpler than diffing individual rows, and ordering stays authoritative.

export async function listForUser(userId: string): Promise<ProfileLink[]> {
  return await db
    .select()
    .from(profileLinks)
    .where(eq(profileLinks.userId, userId))
    .orderBy(asc(profileLinks.position));
}

// Batched lookup for rendering many profiles at once (kept for parity with other
// repos; the profile page only needs one user).
export async function replaceForUser(
  userId: string,
  links: { platform: string; url: string; label: string }[],
): Promise<ProfileLink[]> {
  return await db.transaction(async (tx) => {
    await tx.delete(profileLinks).where(eq(profileLinks.userId, userId));
    if (links.length > 0) {
      await tx.insert(profileLinks).values(
        links.map((l, i) => ({ userId, platform: l.platform, url: l.url, label: l.label, position: i })),
      );
    }
    return await tx
      .select()
      .from(profileLinks)
      .where(eq(profileLinks.userId, userId))
      .orderBy(asc(profileLinks.position));
  });
}
