// SPDX-License-Identifier: AGPL-3.0-or-later
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "@/config.ts";
import * as schema from "@/db/schema.ts";

// Single shared connection pool + Drizzle instance for the whole app.
// `sql` is exported for the migrator; everything else goes through `db`.
export const sql = postgres(config.DATABASE_URL, { max: 10 });
export const db = drizzle(sql, { schema });

export type Database = typeof db;
