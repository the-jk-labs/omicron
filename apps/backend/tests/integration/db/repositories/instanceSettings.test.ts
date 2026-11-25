// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { db } from "@/db/client.ts";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { instanceSettings } from "@/db/schema.ts";
import { closeDb, resetDb } from "../../harness.ts";

// The table is cached in-process and busted by the repository's own writes, so
// these run in order against one database. `resetDb` leaves this table alone,
// so the test cleans up its own keys.
const clean = () => db.delete(instanceSettings).where(like(instanceSettings.key, "test.%"));
beforeAll(async () => {
  await resetDb();
  await clean();
});
afterAll(async () => {
  await clean();
  await closeDb();
});

test("a missing key reads as undefined", async () => {
  expect(await settingsRepo.get("test.missing")).toBeUndefined();
});

test("a write is read back at once, through the cache", async () => {
  await settingsRepo.get("test.name");
  await settingsRepo.set("test.name", "Omicron");
  expect(await settingsRepo.get("test.name")).toBe("Omicron");
  await settingsRepo.set("test.name", "Renamed");
  expect(await settingsRepo.get("test.name")).toBe("Renamed");
  await settingsRepo.remove("test.name");
  expect(await settingsRepo.get("test.name")).toBeUndefined();
});

test("object values come back as copies the caller can't corrupt", async () => {
  await settingsRepo.set("test.obj", { list: ["a"] });
  const first = await settingsRepo.get<{ list: string[] }>("test.obj");
  first?.list.push("mutated");
  expect(await settingsRepo.get("test.obj")).toEqual({ list: ["a"] });
});

test("reads share one cached copy; a write from outside shows after the TTL", async () => {
  await settingsRepo.set("test.outside", "before");
  expect(await settingsRepo.get("test.outside")).toBe("before");
  // Another process (a script, a second backend) writing the table directly.
  await db.update(instanceSettings).set({ value: "after" }).where(eq(instanceSettings.key, "test.outside"));
  expect(await settingsRepo.get("test.outside")).toBe("before");
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 31_000 });
  try {
    expect(await settingsRepo.get("test.outside")).toBe("after");
  } finally {
    vi.useRealTimers();
  }
});

test("concurrent reads on a cold cache cost one query", async () => {
  await settingsRepo.set("test.a", 1);
  const spy = vi.spyOn(db, "select");
  try {
    const values = await Promise.all(["test.a", "test.a", "test.missing"].map((k) => settingsRepo.get(k)));
    expect(values).toEqual([1, 1, undefined]);
    expect(spy).toHaveBeenCalledTimes(1);
  } finally {
    spy.mockRestore();
  }
});
