// SPDX-License-Identifier: AGPL-3.0-or-later

// Rate limiting. A fixed-window counter keyed per caller, exposed as a Hono
// middleware factory. The store is in-process by default (a single Map), but
// when Redis is configured (`REDIS_URL`) the counters live in Redis instead —
// hidden behind the `hit()` function — so limits are shared across backend
// processes and survive restarts. The in-process path is unchanged.
//
// Fixed-window is intentionally simple: each key gets `max` requests per
// `windowMs`; the window resets wholesale when it expires. This is coarser than
// a sliding window but cheap and more than adequate for abuse throttling.

import type { Context } from "hono";
import { getConnInfo } from "hono/deno";
import { createMiddleware } from "hono/factory";
import { config } from "@/config.ts";
import { hit } from "@/lib/rateLimitCore.ts";
import type { AppEnv } from "@/routes/types.ts";

// Resolves the caller's IP from `x-forwarded-for`, trusting only the value added
// by the immediate upstream proxy.
//
// `x-forwarded-for` is a client-appendable chain: each hop appends the address
// it saw, so the LEFTMOST entries are whatever the original caller sent and are
// fully spoofable. Our trusted proxy (Caddy for the direct-to-backend federation
// paths; the SvelteKit proxy, which *sets* a single value, for the JSON API) is
// always the last hop, so the RIGHTMOST entry is the only trustworthy one. Using
// the leftmost would let a peer rotate a forged IP to evade per-IP rate limits.
export function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
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
export async function checkRateLimit(
  c: Context,
  opts: RateLimitOptions,
): Promise<{ allowed: boolean; retryAfter: number }> {
  if (!config.RATE_LIMIT_ENABLED) return { allowed: true, retryAfter: 0 };
  const keyOf = opts.key ?? clientIp;
  const { allowed, resetAt } = await hit(`${opts.name}:${keyOf(c)}`, opts.windowMs, opts.max);
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
    if (!config.RATE_LIMIT_ENABLED) return await next();
    const key = `${name}:${keyOf(c)}`;
    const { allowed, remaining, resetAt } = await hit(key, windowMs, max);
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
