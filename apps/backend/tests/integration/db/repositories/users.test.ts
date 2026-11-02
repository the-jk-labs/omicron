// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import * as usersRepo from "@/db/repositories/users.ts";
import { closeDb, mkUser, resetDb } from "../../harness.ts";

afterAll(closeDb);
beforeEach(resetDb);

describe("findActiveByUsernames", () => {
  test("finds the live accounts among the names, skipping suspended, deleted and unknown ones", async () => {
    const ada = await mkUser("ada");
    const bob = await mkUser("bob");
    await mkUser("cy", { suspended: true });
    await mkUser("dee", { deleted: true });
    const found = await usersRepo.findActiveByUsernames(["ada", "bob", "cy", "dee", "nobody"]);
    expect(found.toSorted((a, b) => a.username.localeCompare(b.username))).toEqual([
      { id: ada.id, username: "ada" },
      { id: bob.id, username: "bob" },
    ]);
  });

  test("no names, no query", async () => {
    expect(await usersRepo.findActiveByUsernames([])).toEqual([]);
  });
});
