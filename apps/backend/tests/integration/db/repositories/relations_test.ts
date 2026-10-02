// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import * as relationsRepo from "@/db/repositories/relations.ts";
import { closeDb, mkRemoteActor, mkUser, resetDb } from "../../harness.ts";

afterAll(closeDb);
beforeEach(resetDb);

describe.for(["mute", "block"] as const)("%s edges", (kind) => {
  test("local targets: idempotent add, has, list, remove", async () => {
    const [ada, bob, cy] = [await mkUser("ada"), await mkUser("bob"), await mkUser("cy")];
    await relationsRepo.addLocal(kind, ada.id, bob.id);
    await relationsRepo.addLocal(kind, ada.id, bob.id);
    await relationsRepo.addLocal(kind, ada.id, cy.id);
    expect(await relationsRepo.hasLocal(kind, ada.id, bob.id)).toBe(true);
    expect(await relationsRepo.hasLocal(kind, bob.id, ada.id)).toBe(false);
    expect((await relationsRepo.listLocalTargets(kind, ada.id)).map((u) => u.username)).toEqual(["bob", "cy"]);

    await relationsRepo.removeLocal(kind, ada.id, bob.id);
    expect(await relationsRepo.hasLocal(kind, ada.id, bob.id)).toBe(false);
    expect((await relationsRepo.listLocalTargets(kind, ada.id)).map((u) => u.username)).toEqual(["cy"]);
  });

  test("remote targets: idempotent add, has, list, remove", async () => {
    const ada = await mkUser("ada");
    const eve = await mkRemoteActor("eve@remote.example");
    await relationsRepo.addRemote(kind, ada.id, eve.id);
    await relationsRepo.addRemote(kind, ada.id, eve.id);
    expect(await relationsRepo.hasRemote(kind, ada.id, eve.id)).toBe(true);
    expect(await relationsRepo.listRemoteTargets(kind, ada.id)).toEqual([
      { id: eve.id, handle: "eve@remote.example", displayName: "eve", avatarUrl: null },
    ]);
    await relationsRepo.removeRemote(kind, ada.id, eve.id);
    expect(await relationsRepo.hasRemote(kind, ada.id, eve.id)).toBe(false);
  });
});

test("mutes and blocks are separate tables", async () => {
  const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
  await relationsRepo.addLocal("mute", ada.id, bob.id);
  expect(await relationsRepo.hasLocal("block", ada.id, bob.id)).toBe(false);
});

test("a local block is seen from both sides; a mute is not a block", async () => {
  const [ada, bob, cy] = [await mkUser("ada"), await mkUser("bob"), await mkUser("cy")];
  await relationsRepo.addLocal("block", ada.id, bob.id);
  await relationsRepo.addLocal("mute", ada.id, cy.id);
  expect(await relationsRepo.localBlockExists(ada.id, bob.id)).toBe(true);
  expect(await relationsRepo.localBlockExists(bob.id, ada.id)).toBe(true);
  expect(await relationsRepo.localBlockExists(ada.id, cy.id)).toBe(false);
});
