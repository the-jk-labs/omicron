// SPDX-License-Identifier: AGPL-3.0-or-later
import * as postsRepo from "@/db/repositories/posts.ts";
import * as notificationsService from "@/services/notifications.ts";
import { queue } from "@/queue/queue.ts";

// Publishes posts whose scheduled moment has arrived.
//
// This is deliberately a database poll rather than a delayed job. The job queue
// (queue/queue.ts) has no delay support and, without Redis, no durability at
// all — a schedule set for next Tuesday cannot live in a fire-and-forget
// microtask. Postgres is the one thing every deployment has, so the due time
// lives in the row and the sweep is an index lookup against
// `posts_due_idx`. Nothing new has to be installed to schedule a post.

// How often to look. A post is at most this late, which is the right trade at
// the resolution people actually schedule things: nobody picks 09:00:15, and a
// tighter loop would buy nothing for a query that is a partial-index probe
// returning no rows almost every time.
const SWEEP_INTERVAL_MS = 30_000;

// Most a single tick will publish. A cap only matters after downtime, when a
// backlog comes due at once; the rest follow on the next tick rather than one
// transaction holding locks on hundreds of rows.
const SWEEP_BATCH = 50;

let started = false;

/**
 * Start the scheduling sweeper. Call once at boot.
 *
 * Safe to run on every backend process: `claimDue` takes its rows with
 * `for update skip locked`, so each post is claimed by exactly one process and
 * the work spreads rather than duplicating. Two nodes will never both federate
 * the same article.
 */
export function startScheduleSweeper(): void {
  if (started) return;
  started = true;
  // Run once immediately as well as on the interval. This is what catches up
  // after downtime: anything that came due while the instance was off is
  // already past its time, so the first sweep takes it. Because publishing
  // stamps `created_at` to now, a post that missed its slot by six hours still
  // arrives at the top of the timeline instead of six hours down it.
  void sweep();
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  console.log("✔ Scheduled-post sweeper started.");
}

/**
 * One pass. Exported for the tests, which drive it directly rather than
 * waiting on a timer.
 *
 * A failure here is logged and dropped: the posts this tick did not reach are
 * still `scheduled`, so the next tick sees them again. There is no failed
 * state and no retry ladder, because the write path already rejects everything
 * that could fail at publish time — a scheduled post is guaranteed to have a
 * title, a non-empty body and an allocated slug. What is left is the database
 * being unreachable, which retrying in thirty seconds is the correct response
 * to.
 */
export async function sweep(): Promise<number> {
  let claimed: { id: string; authorId: string | null }[];
  try {
    claimed = await postsRepo.claimDue(SWEEP_BATCH);
  } catch (err) {
    console.error("scheduler: failed to claim due posts:", err);
    return 0;
  }
  if (claimed.length === 0) return 0;

  console.log(`scheduler: published ${claimed.length} scheduled post(s).`);
  for (const post of claimed) {
    // The row is already published and committed. Everything below is a side
    // effect of that fact, so each is isolated: a mail-shaped failure in one
    // must not stop the next post's fan-out.
    queue.add("federate_post", { postId: post.id, action: "create" });
    queue.add("indexnow_submit", { postId: post.id });
    if (post.authorId) {
      // Told rather than left to notice. The author was not at the keyboard
      // when this happened, which is the entire point of having scheduled it.
      await notificationsService.notify({
        recipientId: post.authorId,
        type: "post_published",
        postId: post.id,
      });
    }
  }
  return claimed.length;
}
