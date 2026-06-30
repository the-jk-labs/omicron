// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { instanceSettings } from "@/db/schema.ts";

// Key/value store for runtime, moderator-tunable instance config (see
// services/settings.ts for typed accessors). Values are arbitrary JSON.

export async function get<T = unknown>(key: string): Promise<T | undefined> {
  const [row] = await db
    .select({ value: instanceSettings.value })
    .from(instanceSettings)
    .where(eq(instanceSettings.key, key));
  return row?.value as T | undefined;
}

export async function set(key: string, value: unknown) {
  await db
    .insert(instanceSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: instanceSettings.key,
      set: { value, updatedAt: new Date() },
    });
}
