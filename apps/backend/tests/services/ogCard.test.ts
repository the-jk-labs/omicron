// SPDX-License-Identifier: AGPL-3.0-or-later
// Caching is exercised on real files in a temp UPLOADS_DIR; the drawing itself
// is covered by tests/lib/ogCard.test.ts, so the renderer is stubbed here.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { postWithAuthor, remotePostWithAuthor } from "../fixtures.ts";

vi.mock(import("@/lib/ogCard.ts"));
vi.mock(import("@/services/posts.ts"));
vi.mock(import("@/services/instanceSetup.ts"));

import { config } from "@/config.ts";
import { notFound } from "@/lib/http.ts";
import { renderOgCard } from "@/lib/ogCard.ts";
import { getAppDomain } from "@/services/instanceSetup.ts";
import { postCard } from "@/services/ogCard.ts";
import * as postsService from "@/services/posts.ts";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
let tmp: string;
const originalUploads = config.UPLOADS_DIR;
const cards = () => readdirSync(join(tmp, "og-cards"));

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "omicron-og-"));
  config.UPLOADS_DIR = tmp;
  vi.mocked(getAppDomain).mockResolvedValue("blog.example");
  vi.mocked(renderOgCard).mockResolvedValue(JPEG);
  vi.mocked(postsService.getPost).mockResolvedValue(
    postWithAuthor({ id: "p1", title: "Hello" }, { displayName: "Ada" }),
  );
});

afterEach(() => {
  config.UPLOADS_DIR = originalUploads;
  rmSync(tmp, { recursive: true, force: true });
});

test("renders the title, byline and site, and caches the JPEG", async () => {
  expect(await postCard("p1")).toEqual(JPEG);
  expect(renderOgCard).toHaveBeenCalledWith({ title: "Hello", byline: "Ada", site: "blog.example" });
  expect(postsService.getPost).toHaveBeenCalledWith("p1", null);
  expect(cards()).toEqual([expect.stringMatching(/^p1-[0-9a-f]{16}\.jpg$/)]);
});

test("a second request is served from disk without re-rendering", async () => {
  await postCard("p1");
  vi.mocked(renderOgCard).mockClear();
  expect(new Uint8Array((await postCard("p1"))!)).toEqual(JPEG);
  expect(renderOgCard).not.toHaveBeenCalled();
});

test("a retitle renders a new card under a new name", async () => {
  await postCard("p1");
  vi.mocked(postsService.getPost).mockResolvedValue(postWithAuthor({ id: "p1", title: "Renamed" }));
  await postCard("p1");
  expect(renderOgCard).toHaveBeenCalledTimes(2);
  expect(cards()).toHaveLength(2);
});

test.for([
  ["a remote post", remotePostWithAuthor({ title: "Theirs" })],
  ["an untitled post", postWithAuthor({ title: null })],
  ["a whitespace title", postWithAuthor({ title: "   " })],
])("draws nothing for %s", async ([, row]) => {
  vi.mocked(postsService.getPost).mockResolvedValue(row as never);
  expect(await postCard("p1")).toBe(null);
  expect(renderOgCard).not.toHaveBeenCalled();
});

test("a title the font cannot draw yields null and caches nothing", async () => {
  vi.mocked(renderOgCard).mockResolvedValue(null);
  expect(await postCard("p1")).toBe(null);
  expect(readdirSync(tmp)).toEqual([]);
});

test("a post the public may not see is a 404, so a draft's card is unreachable", async () => {
  vi.mocked(postsService.getPost).mockRejectedValue(notFound("Post not found."));
  await expect(postCard("p1")).rejects.toMatchObject({ status: 404 });
});

test("a failed cache rename still returns the card and leaves no temp file", async () => {
  await postCard("p1");
  const [name] = cards();
  // Replace the cached file with a directory: the read fails, the re-render's
  // rename onto it fails, and the caller must still get the image.
  rmSync(join(tmp, "og-cards", name));
  mkdirSync(join(tmp, "og-cards", name));
  expect(await postCard("p1")).toEqual(JPEG);
  expect(cards().filter((f) => f.endsWith(".tmp"))).toEqual([]);
});

// BUG: the cache directory is created outside the try that makes cache writes
// best-effort, so an uploads volume that cannot take the directory (read-only,
// full, a stray file in the way) turns a renderable card into a 500.
test.fails("BUG: a cache directory that cannot be created still returns the card", async () => {
  writeFileSync(join(tmp, "og-cards"), "not a directory");
  expect(await postCard("p1")).toEqual(JPEG);
});
