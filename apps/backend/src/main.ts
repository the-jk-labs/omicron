import { buildApp } from "@/app.ts";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";
import { runMigrations } from "@/db/migrate.ts";
import { startJobWorker } from "@/queue/queue.ts";
import { reconcileAnubisInBackground } from "@/services/anubisProtection.ts";
import { seedFederationOrigin, seedFederationRunning } from "@/services/federationState.ts";
import { getFederationEnabled, getOrigin } from "@/services/instanceSetup.ts";
import { backfillSlugs } from "@/services/postSlugs.ts";
import { startScheduleSweeper } from "@/services/scheduledPosts.ts";
import { startUploadGcSweeper } from "@/services/uploadGc.ts";
import { APP_VERSION } from "@/version.ts";

// Entry point: migrate → build app → serve. Stateless; all data in Postgres.
async function main() {
  await runMigrations();
  // Posts written before permalinks were readable have no slug yet, and one
  // cannot be derived in SQL — see services/postSlugs.ts. Idempotent, and a
  // single indexed query once every post has one.
  await backfillSlugs();
  // Resolve the effective federation state (admin toggle → env → default) before
  // the app binds its ActivityPub routes; the value is fixed for this process.
  seedFederationRunning(await getFederationEnabled());
  // Resolve the effective federation origin (wizard-persisted domain → env →
  // default) the same way before the app binds, so ActivityPub actor/activity
  // identities and outbound deliveries use the domain configured by the setup
  // wizard instead of the boot-time APP_DOMAIN default (#122).
  seedFederationOrigin(await getOrigin());
  const app = await buildApp();

  // Drain durable jobs when Redis is configured; no-op in-process otherwise.
  // Handlers are registered inside buildApp(), so start the worker after it.
  startJobWorker();

  // Publish posts whose scheduled time has arrived. Database-backed rather than
  // queue-backed, so it behaves the same with and without Redis, and safe to
  // run on every node — see services/scheduledPosts.ts. Started after the
  // worker so its first sweep has somewhere to enqueue federation.
  startScheduleSweeper();

  // Reap uploaded files nothing references anymore, once they have been
  // unreferenced for a full grace period (long enough for federated copies
  // that cached the URL to move on). Same database-backed pattern as the
  // schedule sweeper — see services/uploadGc.ts.
  startUploadGcSweeper();

  // `onListen` overrides Deno's own "Listening on http://0.0.0.0:8000/" banner,
  // which otherwise prints alongside ours and announces the same thing twice —
  // once with a localhost URL that is meaningless inside a container.
  Deno.serve(
    {
      port: config.PORT,
      onListen: () => console.log(`✔ Omicron backend v${APP_VERSION} listening on :${config.PORT}`),
    },
    app.fetch,
  );

  // Re-assert the persisted AI-scraper-shield state onto Caddy once it's up
  // (Caddy starts after us and boots protection-off). Non-blocking, fail-open.
  reconcileAnubisInBackground();
}

await main();
