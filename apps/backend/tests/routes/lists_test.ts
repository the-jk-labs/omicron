// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
import { postWithAuthor } from "../fixtures.ts";
import { mount } from "./harness.ts";

vi.mock(import("@/services/readingLists.ts"));
vi.mock(import("@/services/engagement.ts"));

import { forbidden } from "@/lib/http.ts";
import { listRoutes } from "@/routes/lists.ts";
import { enrichPosts } from "@/services/engagement.ts";
import * as listsService from "@/services/readingLists.ts";

const api = mount("/api/lists", listRoutes);

const list = {
  id: "l1",
  userId: "me",
  title: "Reads",
  description: "",
  visibility: "public" as const,
  isReadLater: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  itemCount: 3,
};

beforeEach(() => {
  api.signOut();
  vi.mocked(enrichPosts).mockImplementation(async (rows) => rows.map((r) => ({ id: r.post.id })) as never);
});

test.for([
  ["GET", "/api/lists"],
  ["GET", "/api/lists/read-later"],
  ["GET", "/api/lists/for-post/p1"],
  ["DELETE", "/api/lists/l1"],
  ["DELETE", "/api/lists/l1/items/p1"],
])("%s %s requires a signed-in user", async ([method, path]) => {
  expect((await api.request(path, { method })).status).toBe(401);
});

test.for([
  ["POST", "/api/lists", { title: "x" }],
  ["PATCH", "/api/lists/l1", { title: "x" }],
  ["POST", "/api/lists/l1/items", { postId: "p1" }],
] as const)("%s %s requires a signed-in user", async ([method, path, body]) => {
  expect((await api.json(path, method, body)).status).toBe(401);
});

test("my lists are serialized without internal columns", async () => {
  api.signIn();
  vi.mocked(listsService.myLists).mockResolvedValue([list] as never);
  const { lists } = await (await api.request("/api/lists")).json();
  expect(lists).toEqual([
    {
      id: "l1",
      title: "Reads",
      description: "",
      visibility: "public",
      isReadLater: false,
      itemCount: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
});

test("create answers 201 and validates visibility", async () => {
  api.signIn();
  vi.mocked(listsService.createList).mockResolvedValue({ ...list, itemCount: 0 });
  const res = await api.json("/api/lists", "POST", { title: "Reads", visibility: "private" });
  expect(res.status).toBe(201);
  expect(listsService.createList).toHaveBeenCalledWith("me", { title: "Reads", visibility: "private" });
  expect((await api.json("/api/lists", "POST", { title: "x", visibility: "secret" })).status).toBe(400);
});

test("read-later, profile lists and the save menu", async () => {
  api.signIn();
  vi.mocked(listsService.readLater).mockResolvedValue({ ...list, isReadLater: true });
  vi.mocked(listsService.listsForProfile).mockResolvedValue([]);
  vi.mocked(listsService.listsForPost).mockResolvedValue([{ ...list, contains: true }] as never);
  expect((await (await api.request("/api/lists/read-later")).json()).list.isReadLater).toBe(true);
  await api.request("/api/lists/user/bob");
  expect(listsService.listsForProfile).toHaveBeenCalledWith("bob", "me");
  expect((await (await api.request("/api/lists/for-post/p1")).json()).lists[0].contains).toBe(true);
  expect(listsService.listsForPost).toHaveBeenCalledWith("me", "p1");
});

test("a profile's lists are public", async () => {
  vi.mocked(listsService.listsForProfile).mockResolvedValue([list] as never);
  expect((await api.request("/api/lists/user/bob")).status).toBe(200);
  expect(listsService.listsForProfile).toHaveBeenCalledWith("bob", null);
});

test("a list and its items are public reads", async () => {
  vi.mocked(listsService.getList).mockResolvedValue({
    list,
    isOwner: false,
    owner: { username: "bob", displayName: "Bob" },
  });
  vi.mocked(listsService.listItems).mockResolvedValue({ items: [postWithAuthor({ id: "p1" })], nextCursor: null });
  const detail = await (await api.request("/api/lists/l1")).json();
  expect(detail).toMatchObject({ list: { id: "l1" }, isOwner: false, owner: { username: "bob" } });
  expect(await (await api.request("/api/lists/l1/items")).json()).toEqual({ items: [{ id: "p1" }], nextCursor: null });
});

test("update, delete and item add/remove go to the owner checks in the service", async () => {
  api.signIn();
  vi.mocked(listsService.updateList).mockResolvedValue(list);
  vi.mocked(listsService.deleteList).mockResolvedValue();
  vi.mocked(listsService.addItem).mockResolvedValue();
  vi.mocked(listsService.removeItem).mockResolvedValue();
  await api.json("/api/lists/l1", "PATCH", { description: "d" });
  expect(listsService.updateList).toHaveBeenCalledWith("me", "l1", { description: "d" });
  expect(await (await api.request("/api/lists/l1", { method: "DELETE" })).json()).toEqual({ ok: true });
  expect(await (await api.json("/api/lists/l1/items", "POST", { postId: "p1" })).json()).toEqual({ ok: true });
  expect(listsService.addItem).toHaveBeenCalledWith("me", "l1", "p1");
  await api.request("/api/lists/l1/items/p1", { method: "DELETE" });
  expect(listsService.removeItem).toHaveBeenCalledWith("me", "l1", "p1");
});

test("adding requires a postId", async () => {
  api.signIn();
  expect((await api.json("/api/lists/l1/items", "POST", {})).status).toBe(400);
});

test("a service refusal surfaces with its status", async () => {
  api.signIn();
  vi.mocked(listsService.deleteList).mockRejectedValue(forbidden("This list isn't yours."));
  const res = await api.request("/api/lists/l1", { method: "DELETE" });
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "This list isn't yours." });
});
