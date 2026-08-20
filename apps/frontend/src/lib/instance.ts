// SPDX-License-Identifier: AGPL-3.0-or-later
// The instance's own identity, cached for the server-side request path.
//
// A single row that changes only when an admin edits it, and something
// hooks.server.ts needs on every page load — so it is held for a minute rather
// than putting a backend round-trip in front of each request. A failed lookup is
// cached as null/false for the same minute, so every reader degrades to "do
// nothing" rather than to an error.

import { endpoints } from "$lib/api";

const TTL_MS = 60_000;

export type InstanceSnapshot = {
  domain: string | null;
  // The federation state the backend is actually running with, not the admin's
  // saved preference — the two differ until a restart. Anything routing a
  // request to an ActivityPub URL has to know which one is true right now.
  federationEnabled: boolean;
};

let cached: { value: InstanceSnapshot; at: number } | null = null;

export async function instanceSnapshot(fetchFn: typeof fetch): Promise<InstanceSnapshot> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;

  const info = await endpoints(fetchFn)
    .instance()
    .catch(() => null);
  cached = {
    value: {
      domain: info?.domain ?? null,
      federationEnabled: info?.federationEnabled ?? false,
    },
    at: now,
  };
  return cached.value;
}
