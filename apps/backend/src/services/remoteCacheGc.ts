// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";

// Age-based pruning of the remote actor/post cache.
//
// Browsing /@user@host resolves and caches the remote actor, and fetching their
// posts persists up to 20 Articles per outbox. Nothing ever evicts those rows:
// every handle someone once looked at stays in `remote_actors`/`posts` forever.
// A hostile instance can exploit that — serve many distinct, valid actors and
// outboxes, and the anonymous browsing path (rate-limited but still allowed)
// grows those tables without bound. This sweeper is the counterweight: it
// forgets cached actors that are no longer referenced by any of a local user's
// durable edges and have not been re-fetched within a retention window.
//
// Deleting an actor cascades its posts, tags, and every join row that hung off
// that actor (follows, mutes, blocks, recommendations, notifications — all
// FK-cascade), so pruning an actor also reclaims its posts. "Referenced" means
// the actor is still meaningful to some local user: they follow it, have it
// muted or blocked, received a recommendation or notification from it — see
// remoteActorsRepo.listPrunable for the exact predicate.
//
// Database-backed and timer-driven like the upload GC and scheduled-post
// sweepers: it must simply happen every day forever, and the job queue is
// one-shot. Safe to run on every backend process — deleting an already-deleted
// row is a no-op.

// Daily, matching the upload GC. The retention window absorbs sweep latency.
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Most a single sweep will forget. Like the upload reaper, this cap only matters
// the first time GC lands on an instance with a large stale cache; the rest
// follow on later sweeps.
const PRUNE_BATCH = 200;

let started = false;

/** Start the remote-cache GC sweeper. Call once at boot. */
export function startRemoteCacheGcSweeper(): void {
  if (started) return;
  started = true;
  void sweep();
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  console.log("✔ Remote-cache GC sweeper started.");
}

/**
 * One pass: forget cached remote actors that have not been re-fetched within
 * the retention window and are no longer referenced by any local edge. Returns
 * the number of actors removed. Failures are logged and dropped — the next
 * sweep retries wholesale, so there is no retry ladder to maintain.
 */
export async function sweep(): Promise<number> {
  // 0 disables pruning entirely.
  if (config.REMOTE_CACHE_RETENTION_DAYS <= 0) return 0;
  const cutoff = new Date(Date.now() - config.REMOTE_CACHE_RETENTION_DAYS * 86_400_000);

  let victims: { id: string }[];
  try {
    victims = await remoteActorsRepo.listPrunable(cutoff, PRUNE_BATCH);
  } catch (err) {
    console.error("remote-cache-gc: failed to list prunable actors:", err);
    return 0;
  }

  let pruned = 0;
  for (const victim of victims) {
    try {
      await remoteActorsRepo.removeById(victim.id);
    } catch (err) {
      console.warn("remote-cache-gc: could not forget actor:", err);
      continue;
    }
    pruned++;
  }
  if (pruned > 0) console.log(`remote-cache-gc: pruned ${pruned} unreferenced remote actor(s).`);
  return pruned;
}
