// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Real files in a temp UPLOADS_DIR; writeFile is a pass-through spy so a
// test can inject a disk failure.
vi.mock(import("node:fs/promises"), async (importOriginal) => {
  const fs = await importOriginal();
  return { ...fs, writeFile: vi.fn<typeof fs.writeFile>(fs.writeFile) };
});

vi.mock(import("@/db/repositories/uploads.ts"));

import { config } from "@/config.ts";
import * as uploadsRepo from "@/db/repositories/uploads.ts";
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  quotaError,
  saveImage,
  sniffMatches,
  UPLOAD_TOTAL_QUOTA_BYTES,
  UPLOAD_USER_QUOTA_BYTES,
} from "@/services/media.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const GIF87 = new TextEncoder().encode("GIF87a....");
const GIF89 = new TextEncoder().encode("GIF89a....");
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");

let tmp: string;
const originalUploads = config.UPLOADS_DIR;
const stored = () => (existsSync(config.UPLOADS_DIR) ? readdirSync(config.UPLOADS_DIR) : []);

afterEach(() => {
  config.UPLOADS_DIR = originalUploads;
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "omicron-media-"));
  config.UPLOADS_DIR = join(tmp, "uploads");
  vi.mocked(uploadsRepo.createWithinQuota).mockResolvedValue({ ok: true });
  vi.mocked(uploadsRepo.removeByFilename).mockResolvedValue(undefined);
});

describe("sniffMatches", () => {
  test.for([
    [PNG, "png"],
    [JPG, "jpg"],
    [GIF87, "gif"],
    [GIF89, "gif"],
    [WEBP, "webp"],
  ] as const)("accepts real %#", ([bytes, ext]) => {
    expect(sniffMatches(bytes, ext)).toBe(true);
  });

  test("rejects bytes that do not match the claimed format", () => {
    expect(sniffMatches(PNG, "jpg")).toBe(false);
    expect(sniffMatches(JPG, "png")).toBe(false);
    expect(sniffMatches(new TextEncoder().encode("GIF88a...."), "gif")).toBe(false);
    expect(sniffMatches(new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt "), "webp")).toBe(false);
  });

  test("rejects HTML and SVG dressed as an image", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    for (const ext of ["png", "jpg", "gif", "webp", "svg"]) {
      expect(sniffMatches(html, ext)).toBe(false);
      expect(sniffMatches(svg, ext)).toBe(false);
    }
  });

  test("rejects truncated headers", () => {
    expect(sniffMatches(PNG.slice(0, 7), "png")).toBe(false);
    expect(sniffMatches(JPG.slice(0, 2), "jpg")).toBe(false);
    expect(sniffMatches(GIF89.slice(0, 5), "gif")).toBe(false);
    expect(sniffMatches(WEBP.slice(0, 11), "webp")).toBe(false);
    expect(sniffMatches(new Uint8Array(), "png")).toBe(false);
  });
});

describe("quotaError", () => {
  test("names the per-account cap", () => {
    const err = quotaError("user");
    expect(err.status).toBe(413);
    expect(err.message).toContain(`${config.UPLOAD_QUOTA_USER_MB} MB per account`);
  });

  test("names the instance cap", () => {
    const err = quotaError("total");
    expect(err.status).toBe(413);
    expect(err.message).toContain(`(${config.UPLOAD_QUOTA_TOTAL_MB} MB)`);
  });
});

test("quota constants are the configured megabytes in bytes", () => {
  expect(UPLOAD_USER_QUOTA_BYTES).toBe(config.UPLOAD_QUOTA_USER_MB * 1024 * 1024);
  expect(UPLOAD_TOTAL_QUOTA_BYTES).toBe(config.UPLOAD_QUOTA_TOTAL_MB * 1024 * 1024);
  expect(Object.values(IMAGE_TYPES).toSorted()).toEqual(["gif", "jpg", "png", "webp"]);
});

describe("saveImage", () => {
  test("reserves quota, writes a random file name and returns its URL", async () => {
    const url = await saveImage("me", PNG, "image/png");
    expect(url).toMatch(/^\/api\/uploads\/[0-9a-f-]{36}\.png$/);
    const filename = url.split("/").at(-1)!;
    expect(uploadsRepo.createWithinQuota).toHaveBeenCalledWith(
      "me",
      filename,
      PNG.byteLength,
      UPLOAD_USER_QUOTA_BYTES,
      UPLOAD_TOTAL_QUOTA_BYTES,
    );
    expect(stored()).toEqual([filename]);
    expect(new Uint8Array(readFileSync(join(config.UPLOADS_DIR, filename)))).toEqual(PNG);
  });

  test("two uploads never share a file name", async () => {
    expect(await saveImage("me", PNG, "image/png")).not.toBe(await saveImage("me", PNG, "image/png"));
  });

  test.for(["image/svg+xml", "text/html", "application/octet-stream", "", "IMAGE/PNG"])(
    "refuses content type %j",
    async (type) => {
      await expect(saveImage("me", PNG, type)).rejects.toMatchObject({ status: 400 });
      expect(uploadsRepo.createWithinQuota).not.toHaveBeenCalled();
    },
  );

  test("refuses an empty file", async () => {
    await expect(saveImage("me", new Uint8Array(), "image/png")).rejects.toMatchObject({
      status: 400,
      message: "The uploaded file is empty.",
    });
  });

  test("accepts exactly 5 MB and refuses one byte more", async () => {
    const at = new Uint8Array(MAX_IMAGE_BYTES);
    at.set(PNG);
    await expect(saveImage("me", at, "image/png")).resolves.toBeDefined();
    const over = new Uint8Array(MAX_IMAGE_BYTES + 1);
    over.set(PNG);
    await expect(saveImage("me", over, "image/png")).rejects.toMatchObject({ status: 400 });
  });

  test("refuses bytes that are not the declared format", async () => {
    await expect(saveImage("me", JPG, "image/png")).rejects.toMatchObject({ status: 400 });
    expect(stored()).toEqual([]);
  });

  test.for(["user", "total"] as const)("a %s quota breach is a 413 and nothing is written", async (reason) => {
    vi.mocked(uploadsRepo.createWithinQuota).mockResolvedValue({ ok: false, reason });
    await expect(saveImage("me", PNG, "image/png")).rejects.toMatchObject({ status: 413 });
    expect(stored()).toEqual([]);
  });

  test("a failed disk write releases the reservation and rethrows", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC"));
    await expect(saveImage("me", PNG, "image/png")).rejects.toThrow("ENOSPC");
    const filename = vi.mocked(uploadsRepo.createWithinQuota).mock.calls[0][1];
    expect(uploadsRepo.removeByFilename).toHaveBeenCalledWith(filename);
  });

  test("a failed release does not mask the write error", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC"));
    vi.mocked(uploadsRepo.removeByFilename).mockRejectedValue(new Error("db down"));
    await expect(saveImage("me", PNG, "image/png")).rejects.toThrow("ENOSPC");
  });
});
