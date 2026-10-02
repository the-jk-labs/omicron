// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userRow, uuid } from "../fixtures.ts";

vi.mock(import("@/db/repositories/readingLists.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/posts.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import * as listsRepo from "@/db/repositories/readingLists.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import type { ReadingList } from "@/db/schema.ts";
import { notFound } from "@/lib/http.ts";
import { DEFAULT_PAGE_SIZE, decodeCursor } from "@/lib/pagination.ts";
import { queue } from "@/queue/queue.ts";
import * as postsService from "@/services/posts.ts";
import {
  addItem,
  createList,
  deleteList,
  getList,
  listItems,
  listsForPost,
  listsForProfile,
  myLists,
  readLater,
  removeItem,
  updateList,
} from "@/services/readingLists.ts";

function list(overrides: Partial<ReadingList> = {}): ReadingList {
  return {
    id: "l1",
    userId: "me",
    title: "Favourites",
    description: "",
    visibility: "public",
    isReadLater: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as ReadingList;
}

const readLaterList = list({ id: "rl", title: "Read later", visibility: "private", isReadLater: true });

beforeEach(() => {
  vi.mocked(listsRepo.itemCountsFor).mockResolvedValue(new Map([["l1", 4]]));
  vi.mocked(listsRepo.ensureReadLater).mockResolvedValue(readLaterList);
  vi.mocked(listsRepo.create).mockImplementation(async (data) => list({ id: "new", ...data }));
  vi.mocked(listsRepo.update).mockImplementation(async (id, patch) => list({ id, ...patch }));
  vi.mocked(postsService.getPost).mockResolvedValue({} as never);
});

describe("myLists / readLater", () => {
  test("guarantees the read-later list exists and counts items", async () => {
    vi.mocked(listsRepo.listForUser).mockResolvedValue([readLaterList, list()]);
    const lists = await myLists("me");
    expect(listsRepo.ensureReadLater).toHaveBeenCalledWith("me");
    expect(listsRepo.listForUser).toHaveBeenCalledWith("me", false);
    expect(lists.map((l) => [l.id, l.itemCount])).toEqual([
      ["rl", 0],
      ["l1", 4],
    ]);
  });

  test("readLater returns the list with its count", async () => {
    vi.mocked(listsRepo.itemCountsFor).mockResolvedValue(new Map([["rl", 2]]));
    expect(await readLater("me")).toMatchObject({ id: "rl", isReadLater: true, itemCount: 2 });
  });
});

describe("listsForProfile", () => {
  test("the owner sees every list and their read-later is created", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ id: "me" }));
    vi.mocked(listsRepo.listForUser).mockResolvedValue([]);
    await listsForProfile("ada", "me");
    expect(listsRepo.ensureReadLater).toHaveBeenCalledWith("me");
    expect(listsRepo.listForUser).toHaveBeenCalledWith("me", false);
  });

  test("anyone else sees only public lists and creates nothing", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ id: "owner" }));
    vi.mocked(listsRepo.listForUser).mockResolvedValue([]);
    await listsForProfile("ada", "visitor");
    expect(listsRepo.ensureReadLater).not.toHaveBeenCalled();
    expect(listsRepo.listForUser).toHaveBeenCalledWith("owner", true);
    await listsForProfile("ada", null);
    expect(listsRepo.listForUser).toHaveBeenLastCalledWith("owner", true);
  });

  test("404s on an unknown user", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(undefined);
    await expect(listsForProfile("ghost", null)).rejects.toMatchObject({ status: 404 });
  });

  test("a deleted account's lists are not found", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ id: "owner", deletedAt: new Date() }));
    vi.mocked(listsRepo.listForUser).mockResolvedValue([list({ userId: "owner" })]);
    await expect(listsForProfile("ada", null)).rejects.toMatchObject({ status: 404 });
  });
});

describe("createList", () => {
  test("trims fields and defaults to public", async () => {
    const created = await createList("me", { title: "  Reads  ", description: "  good ones " });
    expect(listsRepo.create).toHaveBeenCalledWith({
      userId: "me",
      title: "Reads",
      description: "good ones",
      visibility: "public",
    });
    expect(created.itemCount).toBe(0);
  });

  test.for([
    ["private", "private"],
    ["public", "public"],
    ["PRIVATE", "public"],
    ["secret", "public"],
    [undefined, "public"],
  ])("visibility %j -> %j", async ([visibility, expected]) => {
    await createList("me", { title: "x", visibility });
    expect(listsRepo.create).toHaveBeenCalledWith(expect.objectContaining({ visibility: expected }));
  });

  test("requires a title", async () => {
    await expect(createList("me", {})).rejects.toMatchObject({ status: 400, message: "A list needs a title." });
    await expect(createList("me", { title: "   " })).rejects.toMatchObject({ status: 400 });
  });

  test("bounds the title at 100 and the description at 500 characters", async () => {
    await expect(createList("me", { title: "x".repeat(100), description: "d".repeat(500) })).resolves.toBeDefined();
    await expect(createList("me", { title: "x".repeat(101) })).rejects.toMatchObject({ status: 400 });
    await expect(createList("me", { title: "x", description: "d".repeat(501) })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("getList", () => {
  test("a public list is readable by anyone, with its owner", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list({ userId: "owner" }));
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "owner", username: "bob", displayName: "Bob" }));
    expect(await getList("l1", null)).toEqual({
      list: expect.objectContaining({ id: "l1", itemCount: 4 }),
      isOwner: false,
      owner: { username: "bob", displayName: "Bob" },
    });
  });

  test("a private list is not found for anyone but its owner", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list({ userId: "owner", visibility: "private" }));
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "owner" }));
    await expect(getList("l1", "visitor")).rejects.toMatchObject({ status: 404, message: "List not found." });
    await expect(getList("l1", null)).rejects.toMatchObject({ status: 404 });
    expect((await getList("l1", "owner")).isOwner).toBe(true);
  });

  test("a missing owner row degrades to empty names rather than crashing", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list());
    vi.mocked(usersRepo.findById).mockResolvedValue(undefined);
    expect((await getList("l1", null)).owner).toEqual({ username: "", displayName: "" });
  });

  test("404s on an unknown list", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(undefined);
    await expect(getList("nope", null)).rejects.toMatchObject({ status: 404 });
  });
});

describe("listItems", () => {
  test("queries by the resolved full id and pages on the item's own clock", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list({ id: "full-uuid" }));
    const rows = Array.from({ length: DEFAULT_PAGE_SIZE + 1 }, (_, i) => ({
      itemId: uuid(i),
      itemCreatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 59 - i)),
    }));
    vi.mocked(listsRepo.listItems).mockResolvedValue(rows as never);
    const page = await listItems("full", "me", null);
    expect(listsRepo.listItems).toHaveBeenCalledWith("full-uuid", "me", null, DEFAULT_PAGE_SIZE);
    expect(page.items).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(decodeCursor(page.nextCursor)).toEqual({
      createdAt: rows[DEFAULT_PAGE_SIZE - 1].itemCreatedAt.toISOString(),
      id: uuid(DEFAULT_PAGE_SIZE - 1),
    });
  });

  test("a private list's items are hidden from others", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list({ userId: "owner", visibility: "private" }));
    await expect(listItems("l1", "visitor", null)).rejects.toMatchObject({ status: 404 });
    expect(listsRepo.listItems).not.toHaveBeenCalled();
  });

  test("the last page has no cursor", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list());
    vi.mocked(listsRepo.listItems).mockResolvedValue([]);
    expect(await listItems("l1", null, null)).toEqual({ items: [], nextCursor: null });
  });
});

describe("updateList", () => {
  test("only the owner may update", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list({ userId: "owner" }));
    await expect(updateList("me", "l1", { title: "x" })).rejects.toMatchObject({ status: 403 });
    expect(listsRepo.update).not.toHaveBeenCalled();
  });

  test("404s on an unknown list", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(undefined);
    await expect(updateList("me", "x", {})).rejects.toMatchObject({ status: 404 });
  });

  test("patches only the provided fields, trimmed", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list());
    await updateList("me", "l1", { title: " New ", description: " d ", visibility: "private" });
    expect(listsRepo.update).toHaveBeenCalledWith("l1", { title: "New", description: "d", visibility: "private" });
  });

  test("an empty patch writes nothing and returns the list", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list());
    expect(await updateList("me", "l1", {})).toMatchObject({ id: "l1", itemCount: 4 });
    expect(listsRepo.update).not.toHaveBeenCalled();
  });

  test("allows clearing the description", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list({ description: "old" }));
    await updateList("me", "l1", { description: "   " });
    expect(listsRepo.update).toHaveBeenCalledWith("l1", { description: "" });
  });

  test("validates the title and description", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list());
    await expect(updateList("me", "l1", { title: "" })).rejects.toMatchObject({ status: 400 });
    await expect(updateList("me", "l1", { title: "x".repeat(101) })).rejects.toMatchObject({ status: 400 });
    await expect(updateList("me", "l1", { description: "x".repeat(501) })).rejects.toMatchObject({ status: 400 });
  });

  test("read-later can change visibility but never its name", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(readLaterList);
    await expect(updateList("me", "rl", { title: "Mine" })).rejects.toMatchObject({
      status: 400,
      message: "The Read later list can't be renamed.",
    });
    await updateList("me", "rl", { visibility: "public" });
    expect(listsRepo.update).toHaveBeenCalledWith("rl", { visibility: "public" });
  });
});

describe("deleteList", () => {
  test("the owner deletes a normal list", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list());
    await deleteList("me", "l1");
    expect(listsRepo.remove).toHaveBeenCalledWith("l1");
  });

  test("read-later can't be deleted", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(readLaterList);
    await expect(deleteList("me", "rl")).rejects.toMatchObject({ status: 400 });
    expect(listsRepo.remove).not.toHaveBeenCalled();
  });

  test("someone else's list can't be deleted", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list({ userId: "owner" }));
    await expect(deleteList("me", "l1")).rejects.toMatchObject({ status: 403 });
  });
});

describe("addItem / removeItem", () => {
  test("saves a visible post and federates the Add for a public list", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list());
    await addItem("me", "l1", "p1");
    expect(postsService.getPost).toHaveBeenCalledWith("p1", "me");
    expect(listsRepo.addItem).toHaveBeenCalledWith("l1", "p1");
    expect(queue.add).toHaveBeenCalledWith("federate_list_item", { listId: "l1", postId: "p1", action: "add" });
  });

  test("a private list saves locally only", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list({ visibility: "private" }));
    await addItem("me", "l1", "p1");
    expect(listsRepo.addItem).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("a post the saver cannot see is never saved", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list());
    vi.mocked(postsService.getPost).mockRejectedValue(notFound("Post not found."));
    await expect(addItem("me", "l1", "hidden")).rejects.toMatchObject({ status: 404 });
    expect(listsRepo.addItem).not.toHaveBeenCalled();
  });

  test("only the owner can add or remove", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list({ userId: "owner" }));
    await expect(addItem("me", "l1", "p1")).rejects.toMatchObject({ status: 403 });
    await expect(removeItem("me", "l1", "p1")).rejects.toMatchObject({ status: 403 });
  });

  test("removing federates a Remove for a public list", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list());
    await removeItem("me", "l1", "p1");
    expect(listsRepo.removeItem).toHaveBeenCalledWith("l1", "p1");
    expect(queue.add).toHaveBeenCalledWith("federate_list_item", { listId: "l1", postId: "p1", action: "remove" });
  });

  test("removing from a private list stays local", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue(list({ visibility: "private" }));
    await removeItem("me", "l1", "p1");
    expect(queue.add).not.toHaveBeenCalled();
  });
});

test("listsForPost flags which lists already contain the post", async () => {
  vi.mocked(listsRepo.listForUser).mockResolvedValue([readLaterList, list()]);
  vi.mocked(listsRepo.listIdsContaining).mockResolvedValue(new Set(["l1"]));
  const lists = await listsForPost("me", "p1");
  expect(listsRepo.ensureReadLater).toHaveBeenCalledWith("me");
  expect(lists.map((l) => [l.id, l.contains, l.itemCount])).toEqual([
    ["rl", false, 0],
    ["l1", true, 4],
  ]);
  expect(listsRepo.listIdsContaining).toHaveBeenCalledWith(["rl", "l1"], "p1");
});
