// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";
import { runMigrations } from "@/db/migrate.ts";
import { buildApp } from "@/app.ts";
import { getFederationEnabled } from "@/services/instanceSetup.ts";
import { seedFederationRunning } from "@/services/federationState.ts";
import { startJobWorker } from "@/queue/queue.ts";
import { APP_VERSION } from "@/version.ts";

// Entry point: migrate → build app → serve. Stateless; all data in Postgres.
async function main() {
  await runMigrations();
  // Resolve the effective federation state (admin toggle → env → default) before
  // the app binds its ActivityPub routes; the value is fixed for this process.
  seedFederationRunning(await getFederationEnabled());
  const app = await buildApp();

  // Drain durable jobs when Redis is configured; no-op in-process otherwise.
  // Handlers are registered inside buildApp(), so start the worker after it.
  startJobWorker();

  Deno.serve({ port: config.PORT }, app.fetch);
  console.log(`🚀 Omicron backend v${APP_VERSION} listening on :${config.PORT}`);
}

await main();
