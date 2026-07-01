// SPDX-License-Identifier: AGPL-3.0-or-later

// Rate limiting. A fixed-window counter keyed per caller, exposed as a Hono
// middleware factory. The store is in-process today (a single Map) but hidden
// behind the `hit()` function, so swapping to Redis/Memcached later is one file
// — the same pattern as the queue abstraction.
//
// Fixed-window is intentionally simple: each key gets `max` requests per
// `windowMs`; the window resets wholesale when it expires. This is coarser than
// a sliding window but cheap and more than adequate for abuse throttling.

import { createMiddleware } from "hono/factory";
import { getConnInfo } from "hono/deno";
import type { Context } from "hono";
import type { AppEnv } from "@/routes/types.ts";

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

// Records one hit against `key` and reports whether it is allowed, plus the
// metadata needed for RateLimit / Retry-After headers.
function hit(key: string, windowMs: number, max: number) {
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

// Resolves the caller's IP. Behind our SvelteKit proxy (the normal path) the
// real client address arrives in `x-forwarded-for`; direct-to-backend traffic
// (e.g. the federation inbox) has no such header, so fall back to the actual
// connection address.
export function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = c.req.header("x-real-ip");
  if (real) return real.trim();
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

export type RateLimitOptions = {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed per key per window. */
  max: number;
  /** Namespace so limiters with the same key don't share a bucket. */
  name: string;
  /** Derives the bucket key from the request. Defaults to the client IP. */
  key?: (c: Context) => string;
};

/**
 * Low-level check: records a hit and reports whether it is allowed plus the
 * seconds until the window resets. For call sites that produce their own
 * Response (e.g. delegating to Fedify's fetch handler) and so can't use the
 * middleware form.
 */
export function checkRateLimit(
  c: Context,
  opts: RateLimitOptions,
): { allowed: boolean; retryAfter: number } {
  const keyOf = opts.key ?? clientIp;
  const { allowed, resetAt } = hit(`${opts.name}:${keyOf(c)}`, opts.windowMs, opts.max);
  return { allowed, retryAfter: Math.max(0, Math.ceil((resetAt - Date.now()) / 1000)) };
}

/**
 * Build a rate-limiting middleware. On breach it short-circuits with 429 and
 * sets `Retry-After` plus `RateLimit-*` headers; otherwise it annotates the
 * response with the remaining budget and calls the next handler.
 */
export function rateLimit(opts: RateLimitOptions) {
  const { windowMs, max, name } = opts;
  const keyOf = opts.key ?? clientIp;
  return createMiddleware<AppEnv>(async (c, next) => {
    const key = `${name}:${keyOf(c)}`;
    const { allowed, remaining, resetAt } = hit(key, windowMs, max);
    const resetSecs = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));

    c.header("RateLimit-Limit", String(max));
    c.header("RateLimit-Remaining", String(remaining));
    c.header("RateLimit-Reset", String(resetSecs));

    if (!allowed) {
      c.header("Retry-After", String(resetSecs));
      return c.json({ error: "Too many requests. Please slow down and try again." }, 429);
    }
    await next();
  });
}
