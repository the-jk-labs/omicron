// SPDX-License-Identifier: AGPL-3.0-or-later
// The resize itself is mocked (tests/lib/resizeImage.test.ts covers it); this is
// about when it runs, what's cached where, and what falls back to the original.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("@/lib/resizeImage.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
  resizeToWebp: vi.fn<typeof resizeToWebp>(),
}));

import { config } from "@/config.ts";
import { resizeToWebp } from "@/lib/resizeImage.ts";
import { clearVariantCaches, remoteVariant, uploadVariant, variantPath } from "@/services/imageVariants.ts";

const FILE = "0b0e7c4e-5d2a-4e0f-9f53-5f5a4f0d3a11.webp";
const SMALL = new Uint8Array([7, 7, 7]);
let tmp: string;
const originalUploads = config.UPLOADS_DIR;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "omicron-variants-"));
  config.UPLOADS_DIR = tmp;
  clearVariantCaches();
});
afterEach(() => {
  config.UPLOADS_DIR = originalUploads;
  rmSync(tmp, { recursive: true, force: true });
});

const source = () => vi.fn<() => Promise<Uint8Array>>(async () => new Uint8Array([1, 2, 3]));

test("an upload is resized once per width and then served from disk", async () => {
  vi.mocked(resizeToWebp).mockResolvedValue(SMALL);
  const read = source();
  expect(await uploadVariant(FILE, read, "image/webp", 256)).toEqual({ bytes: SMALL, contentType: "image/webp" });
  expect(readFileSync(variantPath(FILE, 256))).toEqual(Buffer.from(SMALL));
  expect(await uploadVariant(FILE, read, "image/webp", 256)).toMatchObject({ contentType: "image/webp" });
  expect(resizeToWebp).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledTimes(1);
  expect(resizeToWebp).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), "image/webp", 256);
});

test("a feed full of one avatar asks for one resize", async () => {
  vi.mocked(resizeToWebp).mockResolvedValue(SMALL);
  const read = source();
  await Promise.all(Array.from({ length: 10 }, () => uploadVariant(FILE, read, "image/webp", 128)));
  expect(resizeToWebp).toHaveBeenCalledTimes(1);
});

test("'serve the original' is remembered, so the image isn't decoded on every request", async () => {
  vi.mocked(resizeToWebp).mockResolvedValue(null);
  const read = source();
  expect(await uploadVariant(FILE, read, "image/webp", 1280)).toBe(null);
  expect(await uploadVariant(FILE, read, "image/webp", 1280)).toBe(null);
  expect(resizeToWebp).toHaveBeenCalledTimes(1);
  expect(existsSync(variantPath(FILE, 1280))).toBe(false);
});

test("an image the decoder rejects is served as the original, not an error", async () => {
  vi.mocked(resizeToWebp).mockRejectedValue(new Error("corrupt image"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await uploadVariant(FILE, source(), "image/webp", 256)).toBe(null);
  expect(warn).toHaveBeenCalledOnce();
});

test("resizes run one at a time; past the queue the original is served now and not remembered", async () => {
  let active = 0;
  let peak = 0;
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  vi.mocked(resizeToWebp).mockImplementation(async () => {
    active++;
    peak = Math.max(peak, active);
    await gate;
    active--;
    return SMALL;
  });
  const files = Array.from({ length: 17 }, (_, i) => `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000.webp`);
  const results: Promise<unknown>[] = [];
  for (const f of files) {
    results.push(uploadVariant(f, source(), "image/webp", 256));
    // Past its disk-cache miss, so it is in the queue before the next one asks.
    await new Promise((r) => setTimeout(r, 1));
  }
  // The 17th doesn't wait behind the other 16.
  expect(await results[16]).toBe(null);
  open();
  const settled = (await Promise.all(results.slice(0, 16))) as ({ contentType: string } | null)[];
  expect(settled.every((r) => r?.contentType === "image/webp")).toBe(true);
  expect(peak).toBe(1);
  // Busy was not an answer about the image: once the queue drains it is resized.
  expect(await uploadVariant(files[16], source(), "image/webp", 256)).toMatchObject({ contentType: "image/webp" });
});

test("remote variants are cached in memory per url and width", async () => {
  vi.mocked(resizeToWebp).mockResolvedValue(SMALL);
  const image = { bytes: new Uint8Array([9]), contentType: "image/png" };
  expect(await remoteVariant("https://x.example/a.png", image, 256)).toEqual({
    bytes: SMALL,
    contentType: "image/webp",
  });
  await remoteVariant("https://x.example/a.png", image, 256);
  await remoteVariant("https://x.example/a.png", image, 640);
  expect(resizeToWebp).toHaveBeenCalledTimes(2);
  expect(existsSync(join(tmp, "w"))).toBe(false);
});

test("the remote cache is capped: the least recently used go first", async () => {
  vi.mocked(resizeToWebp).mockImplementation(async () => new Uint8Array(1024 * 1024));
  const image = { bytes: new Uint8Array([9]), contentType: "image/png" };
  for (let i = 0; i < 30; i++) await remoteVariant(`https://x.example/${i}`, image, 256);
  expect(resizeToWebp).toHaveBeenCalledTimes(30);
  // 24 MB holds the last 24; the first ones are gone and are resized again.
  await remoteVariant("https://x.example/29", image, 256);
  expect(resizeToWebp).toHaveBeenCalledTimes(30);
  await remoteVariant("https://x.example/0", image, 256);
  expect(resizeToWebp).toHaveBeenCalledTimes(31);
});
