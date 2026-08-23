// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CoverCredit } from "@/lib/cover.ts";
import { badRequest } from "@/lib/http.ts";
import * as openverse from "@/services/openverse.ts";
import * as unsplash from "@/services/unsplash.ts";

// Free-photo search for the editor's banner picker, so a writer can put a
// decent, properly-licensed photo at the top of a post without leaving the page
// or working out for themselves whether they are allowed to use it.
//
// Two providers, deliberately:
//
//   Openverse  needs no credentials and is therefore always on. It is the
//              reason this feature works on a fresh instance with nothing
//              configured, which is the whole point — an operator should not
//              have to register with a third party to get a working editor.
//
//   Unsplash   has better-curated photography but issues a per-application key
//              and has no anonymous mode, so it can only ever be an opt-in an
//              operator enables (see services/unsplash.ts). No key, no tab.
//
// Both normalize to `StockPhoto` below, so the picker renders one grid and the
// post stores one credit shape whichever tab the author used.

/** One photo, reduced to what the picker and the post actually need. */
export type StockPhoto = {
  /** Unique within a provider's results; used as the grid's key. */
  id: string;
  /** The provider's own description, for the grid's alt text. */
  alt: string;
  /** Small, for the results grid. */
  thumbUrl: string;
  /** Full-width, what gets stored as the post's banner. */
  bannerUrl: string;
  /** Attribution to store alongside the banner, already assembled. */
  credit: CoverCredit;
  /**
   * Provider-specific token identifying this photo for `recordUse`, or null
   * when the provider asks for nothing. Opaque to the client, which passes it
   * back untouched.
   */
  useToken: string | null;
};

export const PROVIDERS = ["openverse", "unsplash"] as const;
export type Provider = (typeof PROVIDERS)[number];

export function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

/**
 * The providers this instance can actually search right now, in the order the
 * picker should offer them. Openverse is always present, so the list is never
 * empty and the picker is never offered with nothing behind it.
 */
export async function available(): Promise<Provider[]> {
  return (await unsplash.configured()) ? ["openverse", "unsplash"] : ["openverse"];
}

export async function search(provider: Provider, query: string, page = 1): Promise<StockPhoto[]> {
  const q = query.trim();
  if (!q) return [];
  // Clamped here rather than in each provider: they agree on 1-based paging,
  // and a caller walking to page 10,000 is spending someone else's quota.
  const p = Math.min(Math.max(Math.trunc(page) || 1, 1), 20);
  return provider === "unsplash" ? await unsplash.search(q, p) : await openverse.search(q, p);
}

/**
 * Tell a provider one of its photos was actually used.
 *
 * Unsplash's API terms require this — it is how a photographer's download count
 * stays honest when we hotlink their image. Openverse asks for nothing, so this
 * is a no-op there. Best-effort in both cases: choosing a banner must not fail
 * because a third party's counter was unreachable.
 */
export async function recordUse(provider: Provider, token: string): Promise<void> {
  if (provider === "unsplash") await unsplash.trackDownload(token);
}

/** Rejects an unknown provider before it reaches a service. */
export function requireProvider(value: unknown): Provider {
  if (!isProvider(value)) throw badRequest("Unknown photo provider.");
  return value;
}
