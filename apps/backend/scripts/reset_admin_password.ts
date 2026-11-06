// SPDX-License-Identifier: AGPL-3.0-or-later
// Prints a one-time password reset link for an admin who can't get the email.
//
//   docker compose exec backend deno task reset-admin-password <username>
//
// Locally: `pnpm reset-admin-password <username>`. The link works once, for an
// hour, and using it signs the account out everywhere.
import process from "node:process";
import { sql } from "@/db/client.ts";
import { createAdminResetLink } from "@/services/ownerReset.ts";

const username = process.argv[2];
if (!username) {
  console.error("Usage: reset-admin-password <username>");
  process.exit(1);
}

try {
  console.log(`Open this link within an hour to set a new password:\n\n${await createAdminResetLink(username)}\n`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
  // Importing auth starts timers (rate limits, queue) that would otherwise keep the process alive.
  process.exit();
}
