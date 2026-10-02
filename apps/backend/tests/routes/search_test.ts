// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
import { postWithAuthor } from "../fixtures.ts";
import { mount } from "./harness.ts";

vi.mock(import("@/services/search.ts"));
vi.mock(import("@/services/engagement.ts"));

import { searchRoutes } from "@/routes/search.ts";
import { enrichPosts } from "@/services/engagement.ts";
import * as searchService from "@/services/search.ts";

const api = mount("/api/search", searchRoutes);

beforeEach(() => {
  api.signOut();
  vi.mocked(searchService.searchPosts).mockResolvedValue([postWithAuthor({ id: "p1" })] as never);
  vi.mocked(searchService.searchPeople).mockResolvedValue([{ username: "ada" }] as never);
  vi.mocked(searchService.searchTags).mockResolvedValue([{ slug: "deno", name: "Deno" }] as never);
  vi.mocked(enrichPosts).mockImplementation(async (rows) => rows.map((r) => ({ id: r.post.id })) as never);
});

test.for(["", "?q=", "?q=%20%20"])("an empty query %j returns empty results without searching", async (q) => {
  expect(await (await api.request(`/api/search${q}`)).json()).toEqual({ posts: [], people: [], tags: [] });
  expect(searchService.searchPosts).not.toHaveBeenCalled();
});

test("searches every kind by default", async () => {
  expect(await (await api.request("/api/search?q=deno")).json()).toEqual({
    posts: [{ id: "p1" }],
    people: [{ username: "ada" }],
    tags: [{ slug: "deno", name: "Deno" }],
  });
  expect(searchService.searchPosts).toHaveBeenCalledWith(null, "deno", { tag: undefined, author: undefined });
});

test.for([
  ["posts", true, false, false],
  ["people", false, true, false],
  ["tags", false, false, true],
] as const)("scope=%s searches only that kind", async ([scope, posts, people, tags]) => {
  const body = await (await api.request(`/api/search?q=x&scope=${scope}`)).json();
  expect(searchService.searchPosts).toHaveBeenCalledTimes(posts ? 1 : 0);
  expect(searchService.searchPeople).toHaveBeenCalledTimes(people ? 1 : 0);
  expect(searchService.searchTags).toHaveBeenCalledTimes(tags ? 1 : 0);
  expect(body.posts.length > 0).toBe(posts);
});

test("passes trimmed tag/author filters and the viewer", async () => {
  api.signIn();
  await api.request("/api/search?q=%20x%20&scope=posts&tag=%20deno%20&author=%20ada%20");
  expect(searchService.searchPosts).toHaveBeenCalledWith("me", "x", { tag: "deno", author: "ada" });
});

test("an unknown scope searches nothing", async () => {
  expect(await (await api.request("/api/search?q=x&scope=everything")).json()).toEqual({
    posts: [],
    people: [],
    tags: [],
  });
});
