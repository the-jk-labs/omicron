// SPDX-License-Identifier: AGPL-3.0-or-later
// Turns off two-factor sign-in for an account whose owner lost their authenticator.
//
//   docker compose exec backend deno task reset-two-factor <username>
//
// Locally: `pnpm reset-two-factor <username>`. The owner then signs in with
// their password and, as a moderator or admin, sets up two-factor again.
import process from "node:process";
import { sql } from "@/db/client.ts";
import * as twoFactorsRepo from "@/db/repositories/twoFactors.ts";
import * as usersRepo from "@/db/repositories/users.ts";

const username = process.argv[2]?.trim().toLowerCase();
if (!username) {
  console.error("Usage: reset-two-factor <username>");
  process.exit(1);
}

try {
  const user = await usersRepo.findByUsername(username);
  if (!user || user.deletedAt) throw new Error(`No account named @${username}.`);
  if (!user.twoFactorEnabled) throw new Error(`@${username} doesn't use two-factor authentication.`);
  await twoFactorsRepo.resetForUser(user.id);
  console.log(`Two-factor authentication is off for @${username}. They can sign in with their password now.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
  process.exit();
}
