// SPDX-License-Identifier: AGPL-3.0-or-later
// One-time repair: restore post bodies that were stored as escaped HTML by the
// editor before it learned to parse an ingested body as HTML. See
// lib/unescapeBody.ts for what the damage looks like and why the rule is narrow.
//
//   deno task backfill:unescape            # apply changes
//   deno task backfill:unescape --dry-run  # preview without writing
//
// Safe to run more than once: a repaired body no longer matches the damage
// signature, so a second run finds nothing.
import * as postsRepo from "@/db/repositories/posts.ts";
import { isEscapedBody, repairEscapedBody, unexpectedTags } from "@/lib/unescapeBody.ts";
import { sql } from "@/db/client.ts";

const dryRun = Deno.args.includes("--dry-run");

const posts = await postsRepo.listAllContent();
console.log(`Scanning ${posts.length} post(s)${dryRun ? " (dry run)" : ""}…`);

let changed = 0;
let skipped = 0;
for (const post of posts) {
  if (!isEscapedBody(post.contentHtml)) continue;

  const unexpected = unexpectedTags(post.contentHtml);
  if (unexpected.length > 0) {
    skipped++;
    console.log(
      `• ${post.id} SKIPPED — carries real markup too (${
        unexpected.join(", ")
      }); repair it by hand`,
    );
    continue;
  }

  const fixed = repairEscapedBody(post.contentHtml);
  if (fixed === post.contentHtml) continue;

  changed++;
  console.log(
    `• ${post.id} ${
      dryRun ? "would be" : ""
    } repaired (${post.contentHtml.length} → ${fixed.length} chars)`,
  );
  // The stored Tiptap document is the escaped text too, so it goes with it —
  // the editor prefers it over the HTML and would show the damage again.
  if (!dryRun) await postsRepo.update(post.id, { contentHtml: fixed, contentJson: null });
}

console.log(
  dryRun
    ? `Done. ${changed} post(s) would be repaired, ${skipped} need a human. Re-run without --dry-run to apply.`
    : `Done. Repaired ${changed} post(s); ${skipped} skipped for manual repair.`,
);

await sql.end();
