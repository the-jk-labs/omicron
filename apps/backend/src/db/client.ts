// SPDX-License-Identifier: AGPL-3.0-or-later
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "@/config.ts";
import * as schema from "@/db/schema.ts";

// Postgres NOTICEs that our own idempotent DDL provokes on every boot. The
// migrations are written `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT
// EXISTS` on purpose (see db/migrate.ts), so on an up-to-date instance Postgres
// dutifully announces that it skipped each one. That is a correct system
// working as designed, not information — and postgres-js prints the whole
// notice object, which reads like an error in the startup log. Drop these and
// let every other notice through.
const EXPECTED_NOTICES = new Set([
  "42P07", // duplicate_table    — CREATE TABLE IF NOT EXISTS
  "42P06", // duplicate_schema
  "42710", // duplicate_object   — CREATE INDEX / ADD CONSTRAINT IF NOT EXISTS
  "42701", // duplicate_column   — ADD COLUMN IF NOT EXISTS
]);

// Single shared connection pool + Drizzle instance for the whole app.
// `sql` is exported for the migrator; everything else goes through `db`.
export const sql = postgres(config.DATABASE_URL, {
  max: 10,
  onnotice: (notice) => {
    if (EXPECTED_NOTICES.has(notice.code ?? "")) return;
    console.log(`postgres: ${notice.message}`);
  },
});
export const db = drizzle(sql, { schema });

export type Database = typeof db;
