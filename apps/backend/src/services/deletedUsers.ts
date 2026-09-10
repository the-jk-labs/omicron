// SPDX-License-Identifier: AGPL-3.0-or-later
import { purgeExpiredDeletedUsers } from "@/services/moderation.ts";

// Hard-deletes soft-deleted accounts once their retention window ends.
//
// Database-backed and timer-driven like the scheduled-post sweeper
// (services/scheduledPosts.ts): the job queue is one-shot and, without Redis,
// not durable, while expiry must simply happen every day forever. The sweep is
// idempotent — purging an already-purged account is a no-op — so it is safe to
// run on every backend process without coordination.

// Daily. The retention window absorbs sweep latency, so a tighter loop would
// buy nothing for a scan that returns no rows almost every time.
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Most a single sweep will purge. A cap only matters after long downtime, when
// a backlog of expiries comes due at once; the rest follow on later sweeps
// rather than one pass holding locks on hundreds of cascades.
const SWEEP_BATCH = 100;

let started = false;

/** Start the deleted-account expiry sweeper. Call once at boot. */
export function startDeletedUserSweeper(): void {
  if (started) return;
  started = true;
  void sweep();
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  console.log("✔ Deleted-account sweeper started.");
}

/**
 * One pass. Exported for the tests, which drive it directly rather than
 * waiting on a timer. Failures are logged and dropped — expired rows are still
 * expired, so the next sweep sees them again.
 */
export async function sweep(): Promise<number> {
  try {
    const purged = await purgeExpiredDeletedUsers(new Date(), SWEEP_BATCH);
    if (purged > 0) console.log(`deleted-users: purged ${purged} expired deleted account(s).`);
    return purged;
  } catch (err) {
    console.error("deleted-users: expiry sweep failed:", err);
    return 0;
  }
}
