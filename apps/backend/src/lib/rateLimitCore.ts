// SPDX-License-Identifier: AGPL-3.0-or-later

// The pure counter/store half of rate limiting, split from rateLimit.ts so that
// non-HTTP layers (services metering outbound work) can record hits without
// importing Hono's Deno adapter. A fixed-window counter keyed per caller; the
// store is an in-process Map by default, or Redis when `REDIS_URL` is set —
// hidden behind `hit()` — so limits are shared across processes and survive
// restarts. The in-process path is unchanged.

import { config } from "@/config.ts";
import { getRedis } from "@/lib/redis.ts";

export type HitResult = { allowed: boolean; remaining: number; resetAt: number };

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Opportunistic sweep of expired buckets so the Map can't grow unbounded under
// a churn of unique keys. Runs at most once a minute, on request, so there is no
// background timer to leak in tests or short-lived processes.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

function hitInProcess(key: string, windowMs: number, max: number): HitResult {
  const now = Date.now();
  sweep(now);
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return {
    allowed: b.count <= max,
    remaining: Math.max(0, max - b.count),
    resetAt: b.resetAt,
  };
}

// Atomic fixed-window in Redis: INCR the counter, set the TTL on the first hit
// of a window, then read the remaining TTL for resetAt. Runs as one server-side
// EVAL so there's no check-then-set race between processes.
const HIT_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {c, ttl}
`;

async function hitRedis(key: string, windowMs: number, max: number): Promise<HitResult> {
  const redis = getRedis();
  if (!redis) return hitInProcess(key, windowMs, max);
  try {
    const [count, ttl] = (await redis.eval(HIT_LUA, 1, `rl:${key}`, windowMs)) as [number, number];
    // PTTL returns -1 (no expiry) or -2 (no key) in edge races; fall back to a
    // full window so resetAt stays sane.
    const resetAt = Date.now() + (ttl >= 0 ? ttl : windowMs);
    return { allowed: count <= max, remaining: Math.max(0, max - count), resetAt };
  } catch (err) {
    // Never let a Redis hiccup take down request handling — fail over to the
    // in-process limiter (still throttles this process) and log once.
    console.error("rateLimit: Redis error, falling back to in-process:", err);
    return hitInProcess(key, windowMs, max);
  }
}

// Records one hit against `key` and reports whether it is allowed, plus the
// metadata needed for RateLimit / Retry-After headers. Uses Redis when
// configured, otherwise the in-process Map.
export function hit(key: string, windowMs: number, max: number): Promise<HitResult> {
  return config.REDIS_URL ? hitRedis(key, windowMs, max) : Promise.resolve(hitInProcess(key, windowMs, max));
}

// Key-based rate-limit check for layers below HTTP that already hold a caller
// key (e.g. a service metering outbound work against a per-IP budget passed in
// by the route). Same counter/window semantics as `checkRateLimit`, but the
// caller supplies the key directly instead of a Hono Context.
export async function checkRateLimitKey(
  key: string,
  name: string,
  windowMs: number,
  max: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  if (!config.RATE_LIMIT_ENABLED) return { allowed: true, retryAfter: 0 };
  const { allowed, resetAt } = await hit(`${name}:${key}`, windowMs, max);
  return { allowed, retryAfter: Math.max(0, Math.ceil((resetAt - Date.now()) / 1000)) };
}
