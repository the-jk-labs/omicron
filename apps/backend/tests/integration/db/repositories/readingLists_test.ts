// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import {
  addToList,
  closeDb,
  follow,
  mkList,
  mkPost,
  mkRemoteActor,
  mkRemotePost,
  mkUser,
  resetDb,
} from "../../harness.ts";

const byText = (a: unknown, b: unknown) => String(a).localeCompare(String(b));

afterAll(closeDb);
beforeEach(resetDb);

describe("lists", () => {
  test("the read-later list is created once, private, even under concurrent first use", async () => {
    const ada = await mkUser("ada");
    const results = await Promise.all([1, 2, 3, 4].map(() => listsRepo.ensureReadLater(ada.id)));
    expect(new Set(results.map((l) => l.id)).size).toBe(1);
    expect(results[0]).toMatchObject({ visibility: "private", isReadLater: true, title: "Read later" });
  });

  test("by full id or by hex prefix", async () => {
    const ada = await mkUser("ada");
    const list = await mkList(ada.id, "Reads", "public");
    expect((await listsRepo.findById(list.id))?.id).toBe(list.id);
    expect((await listsRepo.findById(list.id.slice(0, 8).toUpperCase()))?.id).toBe(list.id);
    expect(await listsRepo.findById("ffffffff-ffff-ffff-ffff-ffffffffffff")).toBeUndefined();
  });

  test("a user's lists: read-later pinned first, then newest; strangers see public only", async () => {
    const ada = await mkUser("ada");
    await mkList(ada.id, "Public", "public");
    await mkList(ada.id, "Private", "private");
    await listsRepo.ensureReadLater(ada.id);
    expect((await listsRepo.listForUser(ada.id, false)).map((l) => l.title)).toEqual([
      "Read later",
      "Private",
      "Public",
    ]);
    expect((await listsRepo.listForUser(ada.id, true)).map((l) => l.title)).toEqual(["Public"]);
  });

  test("update and remove (items go with the list)", async () => {
    const ada = await mkUser("ada");
    const list = await mkList(ada.id, "Reads", "public");
    await addToList(list.id, (await mkPost(ada.id, "p")).id);
    expect(await listsRepo.update(list.id, { title: "Renamed", visibility: "private" })).toMatchObject({
      title: "Renamed",
      visibility: "private",
    });
    await listsRepo.remove(list.id);
    expect(await listsRepo.findById(list.id)).toBeUndefined();
  });

  test("the sitemap lists public, non-empty, non-read-later lists of live owners", async () => {
    const [ada, sus] = [await mkUser("ada"), await mkUser("sus", { suspended: true })];
    const post = await mkPost(ada.id, "p");
    const shown = await mkList(ada.id, "Shown", "public");
    await mkList(ada.id, "Empty", "public");
    const priv = await mkList(ada.id, "Private", "private");
    const susList = await mkList(sus.id, "Sus", "public");
    const later = await listsRepo.ensureReadLater(ada.id);
    await listsRepo.update(later.id, { visibility: "public" });
    for (const l of [shown, priv, susList, later]) await addToList(l.id, post.id);
    expect((await listsRepo.listSitemapLists()).map((l) => l.title)).toEqual(["Shown"]);
  });
});

describe("items", () => {
  test("add is idempotent; containment and removal", async () => {
    const ada = await mkUser("ada");
    const [a, b] = [await mkList(ada.id, "A", "public"), await mkList(ada.id, "B", "public")];
    const post = await mkPost(ada.id, "p");
    await listsRepo.addItem(a.id, post.id);
    await listsRepo.addItem(a.id, post.id);
    expect([...(await listsRepo.listIdsContaining([a.id, b.id], post.id))]).toEqual([a.id]);
    expect((await listsRepo.listIdsContaining([], post.id)).size).toBe(0);
    await listsRepo.removeItem(a.id, post.id);
    expect((await listsRepo.listIdsContaining([a.id], post.id)).size).toBe(0);
  });

  test("items and counts carry every visibility rule, for each viewer", async () => {
    const [owner, viewer] = [await mkUser("owner"), await mkUser("viewer")];
    const [pub, priv, sus, muted] = [
      await mkUser("pub"),
      await mkUser("priv", { isPrivate: true }),
      await mkUser("sus", { suspended: true }),
      await mkUser("muted"),
    ];
    const eve = await mkRemoteActor("eve@remote.example");
    const list = await mkList(owner.id, "L", "public");
    const ok = await mkPost(pub.id, "ok");
    const remote = await mkRemotePost(eve.id, "https://remote.example/posts/1");
    const mutedPost = await mkPost(muted.id, "muted");
    for (const p of [
      ok,
      remote,
      mutedPost,
      await mkPost(pub.id, "draft", { status: "draft" }),
      await mkPost(priv.id, "priv"),
      await mkPost(sus.id, "sus"),
    ]) {
      await addToList(list.id, p.id);
    }
    await relationsRepo.addLocal("mute", viewer.id, muted.id);

    const slugsFor = async (v: string | null) =>
      (await listsRepo.listItems(list.id, v, null)).map((r) => r.post.title).toSorted(byText);
    expect(await slugsFor(null)).toEqual(["https://remote.example/posts/1", "muted", "ok"]);
    expect(await slugsFor(viewer.id)).toEqual(["https://remote.example/posts/1", "ok"]);
    expect((await listsRepo.itemCountsFor([list.id], null)).get(list.id)).toBe(3);
    expect((await listsRepo.itemCountsFor([list.id], viewer.id)).get(list.id)).toBe(2);
    expect((await listsRepo.itemCountsFor([], null)).size).toBe(0);

    await follow(viewer.id, priv.id);
    expect(await slugsFor(viewer.id)).toContain("priv");

    // The federated collection is what an anonymous stranger may see.
    const refs = await listsRepo.itemRefs(list.id);
    expect(refs.map((r) => r.id).toSorted(byText)).toEqual([ok.id, remote.id, mutedPost.id].toSorted(byText));
    expect(refs.find((r) => r.id === remote.id)).toEqual({
      id: remote.id,
      apId: "https://remote.example/posts/1",
      remote: true,
    });
  });

  test("items page newest-added first on the item's own clock", async () => {
    const ada = await mkUser("ada");
    const list = await mkList(ada.id, "L", "public");
    const [p1, p2, p3] = [await mkPost(ada.id, "p1"), await mkPost(ada.id, "p2"), await mkPost(ada.id, "p3")];
    for (const p of [p1, p2, p3]) await addToList(list.id, p.id);
    const page = await listsRepo.listItems(list.id, null, null, 2);
    expect(page).toHaveLength(3);
    const next = await listsRepo.listItems(
      list.id,
      null,
      { createdAt: page[1].itemCreatedAt.toISOString(), id: page[1].itemId },
      2,
    );
    expect(next.map((r) => r.itemId)).toEqual([page[2].itemId]);
  });
});
