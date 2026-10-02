// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
import { postWithAuthor } from "../fixtures.ts";
import { mount } from "./harness.ts";

vi.mock(import("@/services/tags.ts"));
vi.mock(import("@/services/engagement.ts"));

import { notFound } from "@/lib/http.ts";
import { tagRoutes } from "@/routes/tags.ts";
import { enrichPosts } from "@/services/engagement.ts";
import * as tagsService from "@/services/tags.ts";

const api = mount("/api/tags", tagRoutes);
const tag = { slug: "deno", name: "Deno" };

beforeEach(() => {
  api.signOut();
  vi.mocked(enrichPosts).mockImplementation(async (rows) => rows.map((r) => ({ id: r.post.id })) as never);
});

test("suggest, search and trending are public", async () => {
  vi.mocked(tagsService.suggest).mockResolvedValue([tag] as never);
  vi.mocked(tagsService.search).mockResolvedValue([tag] as never);
  vi.mocked(tagsService.trending).mockResolvedValue([tag] as never);
  expect(await (await api.request("/api/tags/suggest?q=de")).json()).toEqual({ tags: [tag] });
  expect(tagsService.suggest).toHaveBeenCalledWith("de");
  expect(await (await api.request("/api/tags/search")).json()).toEqual({ tags: [tag] });
  expect(tagsService.search).toHaveBeenCalledWith("");
  expect(await (await api.request("/api/tags")).json()).toEqual({ tags: [tag] });
});

test("following needs a session; 'following' is never read as a slug", async () => {
  expect((await api.request("/api/tags/following")).status).toBe(401);
  api.signIn();
  vi.mocked(tagsService.followed).mockResolvedValue([tag] as never);
  expect(await (await api.request("/api/tags/following")).json()).toEqual({ tags: [tag] });
  expect(tagsService.getTag).not.toHaveBeenCalled();
});

test("tag detail and posts", async () => {
  vi.mocked(tagsService.getTag).mockResolvedValue({ tag, postCount: 1, followerCount: 0, isFollowing: false });
  vi.mocked(tagsService.tagPosts).mockResolvedValue({ items: [postWithAuthor({ id: "p1" })], nextCursor: null });
  expect((await (await api.request("/api/tags/deno")).json()).postCount).toBe(1);
  expect(await (await api.request("/api/tags/deno/posts")).json()).toEqual({ items: [{ id: "p1" }], nextCursor: null });
  expect(tagsService.tagPosts).toHaveBeenCalledWith("deno", null, null);
});

test("an unknown tag is a 404", async () => {
  vi.mocked(tagsService.getTag).mockRejectedValue(notFound("Tag not found."));
  expect((await api.request("/api/tags/nope")).status).toBe(404);
});

test("follow / unfollow require a session", async () => {
  expect((await api.request("/api/tags/deno/follow", { method: "POST" })).status).toBe(401);
  expect((await api.request("/api/tags/deno/follow", { method: "DELETE" })).status).toBe(401);
  api.signIn();
  vi.mocked(tagsService.follow).mockResolvedValue();
  vi.mocked(tagsService.unfollow).mockResolvedValue();
  expect(await (await api.request("/api/tags/deno/follow", { method: "POST" })).json()).toEqual({ ok: true });
  expect(await (await api.request("/api/tags/deno/follow", { method: "DELETE" })).json()).toEqual({ ok: true });
  expect(tagsService.follow).toHaveBeenCalledWith("me", "deno");
  expect(tagsService.unfollow).toHaveBeenCalledWith("me", "deno");
});
