// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";
import { runMigrations } from "@/db/migrate.ts";
import { buildApp } from "@/app.ts";
import { APP_VERSION } from "@/version.ts";

// Entry point: migrate → build app → serve. Stateless; all data in Postgres.
async function main() {
  await runMigrations();
  const app = await buildApp();

  Deno.serve({ port: config.PORT }, app.fetch);
  console.log(`🚀 Omicron backend v${APP_VERSION} listening on :${config.PORT}`);
}

await main();