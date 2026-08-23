import { sql } from "@/db/client.ts";
// SPDX-License-Identifier: AGPL-3.0-or-later
// One-time backfill: typeset the maths in posts written before `$…$` was
// rendered, which still show their TeX as literal text in the reader.
//
//   deno task backfill:math            # apply changes
//   deno task backfill:math --dry-run  # preview without writing
//
// Safe to run more than once: only posts whose HTML actually changes are
// updated. See src/lib/legacyMath.ts for the (conservative, idempotent)
// transform. New posts need none of this — they are rendered on write.
import * as postsRepo from "@/db/repositories/posts.ts";
import { upgradeLegacyMath } from "@/lib/legacyMath.ts";

const dryRun = Deno.args.includes("--dry-run");

const posts = await postsRepo.listAllLocal();
console.log(`Scanning ${posts.length} local post(s)${dryRun ? " (dry run)" : ""}…`);

let changed = 0;
for (const post of posts) {
  const upgraded = upgradeLegacyMath(post.contentHtml);
  if (upgraded === post.contentHtml) continue;

  changed++;
  console.log(`• ${post.id} would be updated`);
  if (!dryRun) await postsRepo.update(post.id, { contentHtml: upgraded });
}

console.log(
  dryRun
    ? `Done. ${changed} post(s) would change. Re-run without --dry-run to apply.`
    : `Done. Updated ${changed} post(s).`,
);

await sql.end();
