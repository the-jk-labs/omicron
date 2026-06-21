import { sql } from "@/db/client.ts";
import { APP_VERSION } from "@/version.ts";

// Minimal, self-contained migration runner. Replays the committed SQL in
// ./drizzle in journal order, tracking applied migrations in a table. We avoid
// drizzle-orm's `postgres-js/migrator` subpath (fragile under Deno's npm
// peer-dependency resolution) and keep full control over logging.
//
// Migrations are additive-only by convention (see README) so upgrades are
// always backward-compatible.

type JournalEntry = { idx: number; tag: string };

const drizzleDir = new URL("../../drizzle/", import.meta.url);

async function appliedTags(): Promise<Set<string>> {
  await sql`
    create table if not exists __omicron_migrations (
      tag text primary key,
      applied_at timestamptz not null default now()
    )`;
  const rows = await sql<{ tag: string }[]>`select tag from __omicron_migrations`;
  return new Set(rows.map((r) => r.tag));
}

export async function runMigrations() {
  console.log(`▶ Omicron v${APP_VERSION}: applying migrations...`);
  const start = Date.now();

  const journal = JSON.parse(
    await Deno.readTextFile(new URL("meta/_journal.json", drizzleDir)),
  ) as { entries: JournalEntry[] };

  const done = await appliedTags();
  const pending = journal.entries
    .sort((a, b) => a.idx - b.idx)
    .filter((e) => !done.has(e.tag));

  for (const entry of pending) {
    const file = await Deno.readTextFile(new URL(`${entry.tag}.sql`, drizzleDir));
    const statements = file
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    // Each migration is atomic: all statements + the bookkeeping row commit
    // together, so a failure never leaves a half-applied migration.
    await sql.begin(async (tx) => {
      for (const statement of statements) {
        await tx.unsafe(statement);
      }
      await tx`insert into __omicron_migrations (tag) values (${entry.tag})`;
    });
    console.log(`  ✔ applied ${entry.tag}`);
  }

  const msg = pending.length === 0 ? "already up to date" : `${pending.length} applied`;
  console.log(`✔ Migrations ${msg} (${Date.now() - start}ms).`);
}
