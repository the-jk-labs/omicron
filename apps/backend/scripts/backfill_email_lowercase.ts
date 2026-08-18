// SPDX-License-Identifier: AGPL-3.0-or-later
// One-time backfill: canonicalise stored login emails to lowercase.
//
// Registration now lowercases the email before storing it (services/auth.ts), so
// one mailbox maps to one account and sign-in — which lowercases the identifier
// before the lookup — matches what was stored. Rows created before that change
// may still hold a mixed-case address, which is unreachable at sign-in and can
// sit alongside a lowercase twin. This script lowercases those older rows.
//
//   deno task backfill:email-lowercase            # apply changes
//   deno task backfill:email-lowercase --dry-run  # preview without writing
//
// Safe to run more than once: a row already lowercase is skipped.
//
// COLLISIONS ARE NOT MERGED. If lowercasing one row would collide with another
// account's address (e.g. both `Alice@x` and `alice@x` exist), both are left
// untouched and reported, because merging two accounts is a destructive decision
// a human must make — deciding which account's posts, follows and sessions
// survive is not something a backfill should guess. Resolve those by hand (e.g.
// suspend or delete the duplicate) and re-run.
import * as usersRepo from "@/db/repositories/users.ts";
import { sql } from "@/db/client.ts";

const dryRun = Deno.args.includes("--dry-run");

const rows = await usersRepo.listEmails();
console.log(`Scanning ${rows.length} account(s)${dryRun ? " (dry run)" : ""}…`);

// Group by the canonical (lowercased) address so a collision is visible before
// any write. `listEmails` is ordered oldest-first, so index 0 in each bucket is
// the original account and later entries are the case-variant twins.
const byCanonical = new Map<string, { id: string; email: string }[]>();
for (const row of rows) {
  const canonical = row.email.trim().toLowerCase();
  (byCanonical.get(canonical) ?? byCanonical.set(canonical, []).get(canonical)!).push(row);
}

let changed = 0;
let collisions = 0;

for (const [canonical, bucket] of byCanonical) {
  // A single account under this address: lowercase it if it isn't already.
  if (bucket.length === 1) {
    const row = bucket[0];
    if (row.email === canonical) continue; // already canonical
    changed++;
    console.log(`• ${row.id}: ${row.email} → ${canonical}`);
    if (!dryRun) await usersRepo.update(row.id, { email: canonical });
    continue;
  }

  // More than one account canonicalises to the same address — a genuine
  // duplicate mailbox. Never merge; report every row and touch none of them.
  collisions++;
  console.warn(
    `! COLLISION on ${canonical}: ${bucket.length} accounts share this mailbox — ` +
      `left unchanged, resolve by hand:`,
  );
  for (const row of bucket) console.warn(`    ${row.id}  (stored as ${row.email})`);
}

console.log(
  dryRun
    ? `Done (dry run). ${changed} account(s) would be lowercased; ${collisions} collision group(s) need manual resolution.`
    : `Done. Lowercased ${changed} account(s); ${collisions} collision group(s) left for manual resolution.`,
);

await sql.end();
