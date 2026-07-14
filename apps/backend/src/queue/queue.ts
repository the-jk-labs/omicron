// SPDX-License-Identifier: AGPL-3.0-or-later
// Job queue. The call-site API (`queue.add(name, payload)` +
// `registerHandler`) is fixed; the backend behind it is chosen at boot. Without
// Redis, jobs run in-process, fire-and-forget (lost on restart — fine for local
// dev / single-node MVP). With `REDIS_URL` set, jobs are persisted to a Redis
// list and drained by a worker loop, so a queued job survives a restart and
// multiple backends share the work. Delivery is at-least-once: a job may run
// again if a worker crashes mid-flight (see `startJobWorker`).

import { newRedis, redisEnabled } from "@/lib/redis.ts";

export type JobName =
  | "federate_post"
  | "federate_post_delete"
  | "federate_actor_update"
  | "federate_list_item"
  | "send_follow"
  | "send_unfollow"
  | "send_block"
  | "send_unblock"
  | "send_reject_follow"
  | "delete_actor"
  | "send_password_reset"
  | "send_email_verification";

export type JobPayloads = {
  federate_post: { postId: string; action?: "create" | "update" };
  federate_post_delete: { postId: string; authorId: string };
  federate_actor_update: { userId: string };
  federate_list_item: { listId: string; postId: string; action: "add" | "remove" };
  send_follow: { followerId: string; targetActor: string };
  send_unfollow: { followerId: string; targetActor: string };
  send_block: { blockerId: string; targetActor: string };
  send_unblock: { blockerId: string; targetActor: string };
  send_reject_follow: { userId: string; targetActor: string };
  delete_actor: { userId: string };
  send_password_reset: { to: string; token: string };
  send_email_verification: { to: string; token: string };
};

type Handler<N extends JobName> = (payload: JobPayloads[N]) => Promise<void>;

const handlers = new Map<JobName, Handler<JobName>>();

export function registerHandler<N extends JobName>(name: N, handler: Handler<N>) {
  handlers.set(name, handler as Handler<JobName>);
}

// Redis key names. `JOBS` is the ready queue; `PROCESSING` holds a job while a
// worker runs it (so a crash can be recovered); `DEAD` collects jobs that
// exhausted their retries.
const JOBS = "omicron:jobs";
const PROCESSING = "omicron:jobs:processing";
const DEAD = "omicron:jobs:dead";

// A job as it travels through Redis: the discriminated name + payload, plus the
// number of times it has been attempted.
type Envelope = { name: JobName; payload: unknown; attempts: number };

const MAX_ATTEMPTS = 5;

function runHandler(name: JobName, payload: unknown): Promise<void> {
  const handler = handlers.get(name);
  if (!handler) {
    console.warn(`queue: no handler registered for "${name}" (dropping job)`);
    return Promise.resolve();
  }
  return handler(payload as JobPayloads[JobName]);
}

export const queue = {
  // Enqueue a job. Returns immediately. Without Redis, execution is a detached
  // microtask (fire-and-forget). With Redis, the job is pushed onto the durable
  // list for the worker to drain — the push itself is fire-and-forget so request
  // latency is unaffected, but a failed push is logged loudly.
  add<N extends JobName>(name: N, payload: JobPayloads[N]): void {
    if (redisEnabled()) {
      const raw = JSON.stringify({ name, payload, attempts: 0 } satisfies Envelope);
      // Reuse the shared client for the non-blocking push; the worker keeps its
      // own blocking connection.
      newRedisShared().lpush(JOBS, raw).catch((err) => {
        console.error(`queue: failed to enqueue "${name}" to Redis:`, err);
      });
      return;
    }
    if (!handlers.has(name)) {
      console.warn(`queue: no handler registered for "${name}" (dropping job)`);
      return;
    }
    queueMicrotask(async () => {
      try {
        await runHandler(name, payload);
      } catch (err) {
        console.error(`queue: job "${name}" failed:`, err);
      }
    });
  },
};

// A lazily-created shared client for enqueues, distinct from the worker's
// blocking connection (a connection blocked on BRPOPLPUSH can't also serve
// LPUSH). Only constructed when Redis is enabled.
let sharedEnqueueClient: ReturnType<typeof newRedis> | null = null;
function newRedisShared() {
  return sharedEnqueueClient ??= newRedis();
}

let workerStarted = false;

/**
 * Start the durable job worker. No-op unless Redis is configured. Runs a single
 * blocking loop that atomically moves a job from the ready queue into a
 * processing list, runs its handler, and removes it on success. On failure the
 * job is re-queued with an incremented attempt count and a bounded backoff,
 * then dead-lettered once it exhausts `MAX_ATTEMPTS`. Call once at boot; each
 * backend process that calls it becomes a worker and Redis load-balances jobs
 * across them.
 */
export function startJobWorker(): void {
  if (!redisEnabled() || workerStarted) return;
  workerStarted = true;
  const redis = newRedis();
  void (async () => {
    // Recover anything a previous worker left mid-flight (e.g. a crash) by
    // moving it back onto the ready queue before we start draining.
    try {
      while ((await redis.rpoplpush(PROCESSING, JOBS)) !== null) { /* re-queued */ }
    } catch (err) {
      console.error("queue: worker recovery scan failed:", err);
    }
    console.log("✔ Job queue worker started (Redis-backed, durable).");
    while (true) {
      let raw: string | null = null;
      try {
        // Block up to 5s for a job; atomically stash it in PROCESSING so a crash
        // mid-handler leaves it recoverable rather than lost.
        raw = await redis.brpoplpush(JOBS, PROCESSING, 5);
        if (raw === null) continue;
        const job = JSON.parse(raw) as Envelope;
        try {
          await runHandler(job.name, job.payload);
        } catch (err) {
          await onJobFailure(redis, raw, job, err);
        }
      } catch (err) {
        // A Redis-level error (connection blip, bad payload). Back off briefly so
        // we don't hot-loop, then retry the loop.
        console.error("queue: worker loop error:", err);
        await delay(1_000);
      } finally {
        // Clear the successfully-handled job from the processing list. On failure
        // onJobFailure has already removed it, so this LREM is a harmless no-op.
        if (raw !== null) {
          try {
            await redis.lrem(PROCESSING, 1, raw);
          } catch { /* best-effort cleanup */ }
        }
      }
    }
  })();
}

async function onJobFailure(
  redis: ReturnType<typeof newRedis>,
  raw: string,
  job: Envelope,
  err: unknown,
): Promise<void> {
  // Remove the in-flight copy from PROCESSING before deciding its fate.
  try {
    await redis.lrem(PROCESSING, 1, raw);
  } catch { /* best-effort */ }
  const attempts = job.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    console.error(
      `queue: job "${job.name}" failed ${attempts}x, dead-lettering:`,
      err,
    );
    await redis.lpush(DEAD, JSON.stringify({ ...job, attempts })).catch(() => {});
    return;
  }
  console.error(`queue: job "${job.name}" failed (attempt ${attempts}), retrying:`, err);
  // Bounded backoff so a persistently-failing job doesn't hot-loop the worker.
  await delay(Math.min(attempts * 1_000, 30_000));
  await redis.lpush(JOBS, JSON.stringify({ ...job, attempts })).catch((e) => {
    console.error(`queue: failed to re-enqueue "${job.name}":`, e);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Re-export so callers don't need a separate import to know the backend choice.
export { redisEnabled };
