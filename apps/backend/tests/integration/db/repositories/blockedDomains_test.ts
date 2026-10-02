// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeAll, expect, test } from "vitest";
import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import { closeDb, resetDb } from "../../harness.ts";

// The repository caches the domain set in-process and busts it on its own
// writes, so these tests go through the repository only and run in order.
beforeAll(resetDb);
afterAll(closeDb);

test("nothing is blocked on an empty list", async () => {
  expect(await blockedDomainsRepo.isBlocked("anything.example")).toBe(false);
});

test("a block covers the domain and its subdomains, and a write busts the cache", async () => {
  await blockedDomainsRepo.add("bad.example", "spam");
  expect(await blockedDomainsRepo.isBlocked("bad.example")).toBe(true);
  expect(await blockedDomainsRepo.isBlocked("Social.Bad.Example")).toBe(true);
  expect(await blockedDomainsRepo.isBlocked("notbad.example")).toBe(false);
  expect(await blockedDomainsRepo.isBlocked("bad.example.org")).toBe(false);
});

test("re-blocking is a no-op that keeps the original reason", async () => {
  await blockedDomainsRepo.add("bad.example", "changed");
  await blockedDomainsRepo.add("alpha.example", "");
  expect((await blockedDomainsRepo.list()).map((d) => [d.domain, d.reason])).toEqual([
    ["alpha.example", ""],
    ["bad.example", "spam"],
  ]);
});

test("unblocking takes effect at once", async () => {
  await blockedDomainsRepo.remove("bad.example");
  expect(await blockedDomainsRepo.isBlocked("bad.example")).toBe(false);
  expect(await blockedDomainsRepo.isBlocked("alpha.example")).toBe(true);
});
