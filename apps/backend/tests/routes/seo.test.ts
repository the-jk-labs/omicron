// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "./harness.ts";

vi.mock(import("@/services/seo.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/readingLists.ts"));
vi.mock(import("@/db/repositories/tags.ts"));

import * as postsRepo from "@/db/repositories/posts.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import { seoRoutes } from "@/routes/seo.ts";
import * as seo from "@/services/seo.ts";

const api = mount("/api/seo", seoRoutes);
const KEY = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  vi.mocked(seo.getSeoSettings).mockResolvedValue({
    indexingEnabled: true,
    verification: { google: "g" },
    indexNowEnabled: true,
    indexNowKey: KEY,
  });
});

test("the public settings withhold the IndexNow key", async () => {
  const body = await (await api.request("/api/seo")).json();
  expect(body).toEqual({ indexingEnabled: true, verification: { google: "g" }, indexNowEnabled: true });
  expect(JSON.stringify(body)).not.toContain(KEY);
});

test("the key check confirms only the exact live key", async () => {
  expect(await (await api.request(`/api/seo/indexnow-key/${KEY}`)).json()).toEqual({ ok: true });
  expect(await (await api.request("/api/seo/indexnow-key/guess")).json()).toEqual({ ok: false });
  vi.mocked(seo.getSeoSettings).mockResolvedValue({
    indexingEnabled: true,
    verification: {},
    indexNowEnabled: false,
    indexNowKey: KEY,
  });
  expect(await (await api.request(`/api/seo/indexnow-key/${KEY}`)).json()).toEqual({ ok: false });
});

test("sitemap entries", async () => {
  vi.mocked(postsRepo.listSitemapProfiles).mockResolvedValue([{ username: "ada" }] as never);
  vi.mocked(tagsRepo.listSitemapTags).mockResolvedValue([{ slug: "deno" }] as never);
  vi.mocked(listsRepo.listSitemapLists).mockResolvedValue([] as never);
  vi.mocked(postsRepo.countSitemapEntries).mockResolvedValue(123);
  expect(await (await api.request("/api/seo/sitemap-entries")).json()).toEqual({
    profiles: [{ username: "ada" }],
    tags: [{ slug: "deno" }],
    lists: [],
    postCount: 123,
    postsPerPage: postsRepo.SITEMAP_PAGE_SIZE,
  });
});

test.for([
  ["", 1],
  ["?page=3", 3],
  ["?page=abc", 1],
  ["?page=2.9", 2],
])("sitemap posts %s reads page %d", async ([query, page]) => {
  vi.mocked(postsRepo.listSitemapEntries).mockResolvedValue([] as never);
  await api.request(`/api/seo/sitemap-posts${query}`);
  expect(postsRepo.listSitemapEntries).toHaveBeenCalledWith(page);
});
