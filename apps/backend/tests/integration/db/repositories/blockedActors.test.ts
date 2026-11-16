// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeAll, expect, test } from "vitest";
import * as blockedActorsRepo from "@/db/repositories/blockedActors.ts";
import { closeDb, resetDb } from "../../harness.ts";

// Like the domain blocklist the sets are cached in-process and busted on the
// repository's own writes, so these run in order against one database.
beforeAll(resetDb);
afterAll(closeDb);

const EVE = "https://bad.example/users/eve";

test("nothing is blocked on an empty list", async () => {
  expect(await blockedActorsRepo.isBlocked(EVE)).toBe(false);
  expect(await blockedActorsRepo.isHandleBlocked("eve@bad.example")).toBe(false);
});

test("a block names the actor by id and by handle, and busts the cache", async () => {
  const row = await blockedActorsRepo.upsert(EVE, "eve@bad.example", "spam");
  expect(row).toMatchObject({ apId: EVE, handle: "eve@bad.example", reason: "spam" });
  expect(await blockedActorsRepo.isBlocked(EVE)).toBe(true);
  expect(await blockedActorsRepo.isHandleBlocked("@Eve@Bad.Example")).toBe(true);
  expect(await blockedActorsRepo.isBlocked("https://bad.example/users/adam")).toBe(false);
});

test("re-blocking updates in place, keyed by the id", async () => {
  await blockedActorsRepo.upsert(EVE, "eve2@bad.example", "renamed");
  expect((await blockedActorsRepo.list()).map((r) => [r.apId, r.handle, r.reason])).toEqual([
    [EVE, "eve2@bad.example", "renamed"],
  ]);
  expect(await blockedActorsRepo.isHandleBlocked("eve@bad.example")).toBe(false);
});

test("unblocking takes effect at once and reports whether anything was removed", async () => {
  expect(await blockedActorsRepo.remove(EVE)).toBe(true);
  expect(await blockedActorsRepo.isBlocked(EVE)).toBe(false);
  expect(await blockedActorsRepo.remove(EVE)).toBe(false);
});
