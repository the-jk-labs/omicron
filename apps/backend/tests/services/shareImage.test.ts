// SPDX-License-Identifier: AGPL-3.0-or-later
// Real files in a temp UPLOADS_DIR; the transcode is covered by
// tests/lib/shareImage.test.ts, so it is stubbed here.
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("@/lib/shareImage.ts"));

import { config } from "@/config.ts";
import { toShareJpeg } from "@/lib/shareImage.ts";
import { cachePath, findSource, shareJpeg } from "@/services/shareImage.ts";

const ID = "0b0e7c4e-5d2a-4e0f-9f53-5f5a4f0d3a11";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 7]);
let tmp: string;
const originalUploads = config.UPLOADS_DIR;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "omicron-share-"));
  config.UPLOADS_DIR = tmp;
  vi.mocked(toShareJpeg).mockResolvedValue(JPEG);
});

afterEach(() => {
  config.UPLOADS_DIR = originalUploads;
  rmSync(tmp, { recursive: true, force: true });
});

test("cachePath lives under og/", () => {
  expect(cachePath(ID)).toBe(`${tmp}/og/${ID}.jpg`);
});

test.for(["png", "jpg", "webp", "gif"])("findSource recovers a .%s upload by id", async (ext) => {
  writeFileSync(join(tmp, `${ID}.${ext}`), ext);
  expect(new TextDecoder().decode((await findSource(ID))!)).toBe(ext);
});

test("findSource is null when no upload has that id", async () => {
  expect(await findSource(ID)).toBe(null);
});

test("transcodes once, caches, and serves the cache afterwards", async () => {
  writeFileSync(join(tmp, `${ID}.webp`), "webp-bytes");
  expect(await shareJpeg(ID)).toEqual(JPEG);
  expect(new TextDecoder().decode(vi.mocked(toShareJpeg).mock.calls[0][0])).toBe("webp-bytes");
  expect(existsSync(cachePath(ID))).toBe(true);
  vi.mocked(toShareJpeg).mockClear();
  expect(new Uint8Array((await shareJpeg(ID))!)).toEqual(JPEG);
  expect(toShareJpeg).not.toHaveBeenCalled();
  expect(readdirSync(join(tmp, "og"))).toEqual([`${ID}.jpg`]);
});

test("returns null for an unknown upload without creating anything", async () => {
  expect(await shareJpeg(ID)).toBe(null);
  expect(existsSync(join(tmp, "og"))).toBe(false);
});

// BUG: as in services/ogCard.ts — the cache directory is created outside the
// best-effort try, so a volume that cannot take it fails the share image.
test.fails("BUG: a cache directory that cannot be created still returns the image", async () => {
  writeFileSync(join(tmp, `${ID}.png`), "png");
  writeFileSync(join(tmp, "og"), "not a directory");
  expect(await shareJpeg(ID)).toEqual(JPEG);
});
