// SPDX-License-Identifier: AGPL-3.0-or-later

// Shared Redis wiring. Redis is optional: when `REDIS_URL` is set the rate
// limiter, Fedify's KV + message queue, and the app job queue all persist their
// state here (surviving restarts and shareable across processes); when it's
// unset every one of them falls back to in-process memory, so local dev needs
// nothing. This module is the single place that touches the client, so the
// choice is made once and read everywhere via `redisEnabled()`.

import { Redis } from "ioredis";
import { config } from "@/config.ts";

/** Whether a Redis backend is configured (i.e. `REDIS_URL` is set). */
export function redisEnabled(): boolean {
  return !!config.REDIS_URL;
}

let client: Redis | null = null;

/**
 * The shared, memoized Redis client, or `null` when Redis isn't configured.
 * Safe to call from anywhere: it lazily connects on first use. Consumers that
 * need their own dedicated connection (e.g. a blocking subscriber) should use
 * `redisFactory()` instead of sharing this one.
 */
export function getRedis(): Redis | null {
  if (!config.REDIS_URL) return null;
  if (client) return client;
  client = newRedis();
  return client;
}

/**
 * Builds a fresh Redis connection from `REDIS_URL`. Used where a single shared
 * client won't do — Fedify's message queue needs a separate connection for its
 * blocking subscribe loop, and the job worker blocks on its own connection so
 * it never stalls unrelated commands.
 */
export function newRedis(): Redis {
  if (!config.REDIS_URL) {
    throw new Error("newRedis() called without REDIS_URL configured");
  }
  const r = new Redis(config.REDIS_URL, {
    // Never buffer commands forever against a down server; fail fast and retry.
    maxRetriesPerRequest: null,
    // Quiet, bounded reconnect backoff so a Redis blip doesn't spam logs.
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  });
  r.on("error", (err) => console.error("redis: connection error:", err.message));
  return r;
}

/** A factory that mints new connections, for APIs that manage their own. */
export function redisFactory(): () => Redis {
  return () => newRedis();
}
