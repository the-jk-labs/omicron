// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { instanceSettings } from "@/db/schema.ts";

// Key/value store for runtime, moderator-tunable instance config (see
// services/settings.ts for typed accessors). Values are arbitrary JSON.
//
// Read on nearly every request (`/api/instance` alone asks for ~16 keys), so the
// whole table is cached in-process: one query fills it, every write here clears
// it, and a short TTL picks up writes made from outside this process.

const TTL_MS = 30_000;
let cache: Promise<Map<string, unknown>> | null = null;
let cachedAt = 0;

function load(): Promise<Map<string, unknown>> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const loading = db
    .select({ key: instanceSettings.key, value: instanceSettings.value })
    .from(instanceSettings)
    .then((rows) => new Map(rows.map((r) => [r.key, r.value])));
  cache = loading;
  cachedAt = Date.now();
  // A failed load is retried on the next read rather than cached.
  loading.catch(() => {
    if (cache === loading) cache = null;
  });
  return loading;
}

// Runs after the write lands, so any load that raced it is thrown away too.
function bust() {
  cache = null;
}

export async function get<T = unknown>(key: string): Promise<T | undefined> {
  const value = (await load()).get(key);
  // A copy, so a caller mutating an object value can't change the cached one.
  return (value === undefined ? undefined : structuredClone(value)) as T | undefined;
}

export async function set(key: string, value: unknown) {
  try {
    await db
      .insert(instanceSettings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: instanceSettings.key,
        set: { value, updatedAt: new Date() },
      });
  } finally {
    bust();
  }
}

export async function remove(key: string) {
  try {
    await db.delete(instanceSettings).where(eq(instanceSettings.key, key));
  } finally {
    bust();
  }
}
