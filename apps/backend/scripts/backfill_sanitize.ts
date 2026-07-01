// SPDX-License-Identifier: AGPL-3.0-or-later
// One-time backfill: re-sanitize every stored post body through the allowlist
// sanitizer. Existing rows predate server-side sanitization, so a body ingested
// from a hostile remote actor (or authored before this change) may still carry
// script/style/event-handler payloads that the reader renders with {@html}.
//
//   deno task backfill:sanitize            # apply changes
//   deno task backfill:sanitize --dry-run  # preview without writing
//
// Safe to run more than once: sanitizePostHtml is idempotent, so only rows whose
// HTML actually changes are updated. Covers local AND remote posts.
import * as postsRepo from "@/db/repositories/posts.ts";
import { sanitizePostHtml } from "@/lib/sanitize.ts";
import { sql } from "@/db/client.ts";

const dryRun = Deno.args.includes("--dry-run");

const posts = await postsRepo.listAllContent();
console.log(`Scanning ${posts.length} post(s)${dryRun ? " (dry run)" : ""}…`);

let changed = 0;
for (const post of posts) {
  const clean = sanitizePostHtml(post.contentHtml);
  if (clean === post.contentHtml) continue;

  changed++;
  console.log(`• ${post.id} would be sanitized`);
  if (!dryRun) await postsRepo.update(post.id, { contentHtml: clean });
}

console.log(
  dryRun
    ? `Done. ${changed} post(s) would change. Re-run without --dry-run to apply.`
    : `Done. Sanitized ${changed} post(s).`,
);

await sql.end();
