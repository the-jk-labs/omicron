// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";

// Outbound federation guards shared by the read-side resolution paths (remote
// profile / posts / recommendations browsing). Those paths make requests that
// anonymous callers trigger just by fetching a URL, so unlike inbox-delivered
// federation (which is self-throttling), they need explicit limits on how much
// outbound work, how much concurrent network, and how long each lookup may run.

// A counting semaphore: `acquire()` resolves once a permit is free and returns a
// release function. FIFO under contention — waiters resume in queued order — so
// a single slow host cannot starve others sharing the global budget.
class Semaphore {
  #permits: number;
  #waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.#permits = permits;
  }

  get available(): number {
    return this.#permits;
  }

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (this.#permits > 0) {
        this.#permits--;
        resolve(this.#makeRelease());
        return;
      }
      this.#waiters.push(() => {
        this.#permits--;
        resolve(this.#makeRelease());
      });
    });
  }

  #makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      // Wake the next waiter, or return the permit to the pool if none wait.
      const next = this.#waiters.shift();
      if (next) next();
      else this.#permits++;
    };
  }
}

// A global ceiling on how many outbound federation requests may be in flight at
// once, across every handle and origin. Prevents one wave of anonymous requests
// from exhausting the process's outbound sockets/file descriptors.
const GLOBAL_SEMAPHORE = new Semaphore(config.RL_REMOTE_MAX_OUTBOUND);

// Per-origin ceilings so a single slow host cannot occupy the whole global
// budget. Keyed on the normalized host of the handle being resolved.
const perOrigin = new Map<string, Semaphore>();

function originSemaphore(host: string): Semaphore {
  let s = perOrigin.get(host);
  if (!s) {
    s = new Semaphore(config.RL_REMOTE_MAX_PER_ORIGIN);
    perOrigin.set(host, s);
  }
  return s;
}

// Best-effort sweep of idle per-origin semaphores so the map cannot grow
// unbounded under a churn of distinct hostile hosts. Runs at most once a minute.
let lastSweep = 0;
function sweepOrigins(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [host, s] of perOrigin) {
    if (s.available === config.RL_REMOTE_MAX_PER_ORIGIN) perOrigin.delete(host);
  }
}

// Runs an outbound action under the global and per-origin semaphores, returning
// its result or null on abort/timeout. `host` keys the per-origin budget.
export async function runOutbound<T>(host: string, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
  sweepOrigins(Date.now());
  const deadline = AbortSignal.timeout(config.REMOTE_LOOKUP_TIMEOUT_MS);
  const releaseGlobal = await GLOBAL_SEMAPHORE.acquire();
  try {
    const releaseOrigin = await originSemaphore(host).acquire();
    try {
      return await action(deadline);
    } finally {
      releaseOrigin();
    }
  } finally {
    releaseGlobal();
  }
}

// Keying/coalescing + negative-cache state for actor resolution. Lives apart
// from `runOutbound` so it can be tested independently of the network path.
type CacheEntry<T> = { value: T; expiresAt: number };

const NEGATIVE_TTL_MS = config.REMOTE_NEGATIVE_CACHE_TTL_MS;

// Negative cache: normalized handle -> a marker recording a failed/not-found
// resolution, so repeated requests for a missing handle don't re-do the same
// outbound work.
const negativeCache = new Map<string, CacheEntry<null>>();

// Single-flight: normalized handle -> the in-progress resolution promise.
const inflight = new Map<string, Promise<unknown>>();

// Opportunistic expiry, throttled to at most once a minute so a hot negative
// cache (the exact situation under abuse) doesn't rescan the whole map per hit.
let lastNegativeSweep = 0;
function sweepNegative(now: number) {
  if (now - lastNegativeSweep < 60_000) return;
  lastNegativeSweep = now;
  for (const [k, v] of negativeCache) {
    if (v.expiresAt <= now) negativeCache.delete(k);
  }
}

// Normalize a handle for keying so `@user@host` and `user@host` coalesce.
export function normalizeHandle(handle: string): string {
  const bare = handle.trim().replace(/^@/, "");
  return bare.toLowerCase();
}

export function negativeCached(handle: string): boolean {
  sweepNegative(Date.now());
  const entry = negativeCache.get(normalizeHandle(handle));
  return !!entry && entry.expiresAt > Date.now();
}

export function setNegativeCached(handle: string): void {
  negativeCache.set(normalizeHandle(handle), { value: null, expiresAt: Date.now() + NEGATIVE_TTL_MS });
}

// Coalesces concurrent resolutions of the same normalized handle into a single
// call. `fn` runs once; every caller awaiting the same handle receives the same
// settled value. Cleared from the in-flight map once settled so a later request
// re-resolves (the positive actor cache is the source of truth for staleness).
export async function singleFlight<T>(handle: string, fn: () => Promise<T>): Promise<T> {
  const key = normalizeHandle(handle);
  const existing = inflight.get(key);
  if (existing) return await (existing as Promise<T>);
  const promise = fn().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return await promise;
}
