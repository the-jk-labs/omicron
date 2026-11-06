// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomBytes } from "node:crypto";
import * as usersRepo from "@/db/repositories/users.ts";
import { getOrigin } from "@/services/instanceSetup.ts";

const LINK_TTL_MS = 3_600_000;

// The way back in for an admin with no working mailbox: a personal instance may
// never have set up email. It has no HTTP route on purpose, so the web gains no
// new way in; running it needs shell access, which already controls the database.
export async function createAdminResetLink(rawUsername: string): Promise<string> {
  const user = await usersRepo.findByUsername(rawUsername.trim().replace(/^@/, "").toLowerCase());
  if (!user || user.deletedAt || !user.isAdmin) throw new Error(`No admin account named "${rawUsername}".`);
  const { auth } = await import("@/auth/auth.ts");
  const context = await auth.$context;
  const token = randomBytes(32).toString("base64url");
  // The same record Better Auth writes for an emailed link, so the normal page and rules apply.
  await context.internalAdapter.createVerificationValue({
    identifier: `reset-password:${token}`,
    value: user.id,
    expiresAt: new Date(Date.now() + LINK_TTL_MS),
  });
  return `${await getOrigin()}/reset-password?token=${token}`;
}
