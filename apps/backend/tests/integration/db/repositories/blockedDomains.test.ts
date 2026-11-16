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
  await blockedDomainsRepo.upsert("bad.example", "spam", "suspend");
  expect(await blockedDomainsRepo.isBlocked("bad.example")).toBe(true);
  expect(await blockedDomainsRepo.isBlocked("Social.Bad.Example")).toBe(true);
  expect(await blockedDomainsRepo.isBlocked("notbad.example")).toBe(false);
  expect(await blockedDomainsRepo.isBlocked("bad.example.org")).toBe(false);
});

test("re-blocking updates the reason and severity in place", async () => {
  await blockedDomainsRepo.upsert("bad.example", "changed", "suspend");
  await blockedDomainsRepo.upsert("alpha.example", "", "suspend");
  expect((await blockedDomainsRepo.list()).map((d) => [d.domain, d.reason, d.severity])).toEqual([
    ["alpha.example", "", "suspend"],
    ["bad.example", "changed", "suspend"],
  ]);
});

test("unblocking takes effect at once", async () => {
  await blockedDomainsRepo.remove("bad.example");
  expect(await blockedDomainsRepo.isBlocked("bad.example")).toBe(false);
  expect(await blockedDomainsRepo.isBlocked("alpha.example")).toBe(true);
});

test("a limit is a policy but not a block, and a suspension up the chain wins", async () => {
  await blockedDomainsRepo.upsert("noisy.example", "", "limit");
  expect(await blockedDomainsRepo.policyFor("blog.noisy.example")).toBe("limit");
  expect(await blockedDomainsRepo.isBlocked("blog.noisy.example")).toBe(false);
  await blockedDomainsRepo.upsert("blog.noisy.example", "", "suspend");
  expect(await blockedDomainsRepo.policyFor("www.blog.noisy.example")).toBe("suspend");
  expect(await blockedDomainsRepo.policyFor("fine.example")).toBe(null);
});

test("the database refuses an unknown severity", async () => {
  await expect(blockedDomainsRepo.upsert("x.example", "", "mute" as never)).rejects.toMatchObject({
    cause: { constraint_name: "blocked_domains_severity_ck" },
  });
});
