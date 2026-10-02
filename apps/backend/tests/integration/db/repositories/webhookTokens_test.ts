// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, expect, test } from "vitest";
import * as webhookTokensRepo from "@/db/repositories/webhookTokens.ts";
import { closeDb, mkUser, resetDb } from "../../harness.ts";

const byText = (a: unknown, b: unknown) => String(a).localeCompare(String(b));

afterAll(closeDb);
beforeEach(resetDb);

test("lists, counts and resolves only live tokens; revocation is owner-scoped", async () => {
  const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
  const first = await webhookTokensRepo.create(ada.id, "ci", "hash-1");
  const second = await webhookTokensRepo.create(ada.id, "cms", "hash-2");
  await webhookTokensRepo.create(bob.id, "bob", "hash-3");

  expect((await webhookTokensRepo.listForUser(ada.id)).map((t) => t.label).toSorted(byText)).toEqual(["ci", "cms"]);
  expect(await webhookTokensRepo.countForUser(ada.id)).toBe(2);
  expect((await webhookTokensRepo.findLive("hash-1"))?.id).toBe(first.id);
  expect(await webhookTokensRepo.findLive("nope")).toBeUndefined();

  // Someone else's id never revokes anything.
  expect(await webhookTokensRepo.revoke(bob.id, first.id)).toBe(false);
  expect(await webhookTokensRepo.revoke(ada.id, first.id)).toBe(true);
  // Already revoked.
  expect(await webhookTokensRepo.revoke(ada.id, first.id)).toBe(false);

  expect(await webhookTokensRepo.findLive("hash-1")).toBeUndefined();
  expect((await webhookTokensRepo.listForUser(ada.id)).map((t) => t.id)).toEqual([second.id]);
  expect(await webhookTokensRepo.countForUser(ada.id)).toBe(1);
});

test("touchLastUsed stamps the token", async () => {
  const ada = await mkUser("ada");
  const token = await webhookTokensRepo.create(ada.id, "ci", "hash-1");
  expect(token.lastUsedAt).toBe(null);
  await webhookTokensRepo.touchLastUsed(token.id);
  expect((await webhookTokensRepo.findLive("hash-1"))?.lastUsedAt).toBeInstanceOf(Date);
});
