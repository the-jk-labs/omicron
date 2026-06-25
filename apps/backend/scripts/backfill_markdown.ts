// SPDX-License-Identifier: AGPL-3.0-or-later
// One-time backfill: re-render posts whose Markdown was stored as literal text
// by the pre-Markdown editor (headings, lists and quotes showing their raw
// `## ` / `- ` / `> ` markers in the reader).
//
//   deno task backfill:markdown            # apply changes
//   deno task backfill:markdown --dry-run  # preview without writing
//
// Safe to run more than once: only posts whose HTML actually changes are
// updated. See src/lib/legacyMarkdown.ts for the (conservative, idempotent)
// transform.
import * as postsRepo from "@/db/repositories/posts.ts";
import { upgradeLegacyMarkdown } from "@/lib/legacyMarkdown.ts";
import { sql } from "@/db/client.ts";

const dryRun = Deno.args.includes("--dry-run");

const posts = await postsRepo.listAllLocal();
console.log(`Scanning ${posts.length} local post(s)${dryRun ? " (dry run)" : ""}…`);

let changed = 0;
for (const post of posts) {
  const upgraded = upgradeLegacyMarkdown(post.contentHtml);
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
