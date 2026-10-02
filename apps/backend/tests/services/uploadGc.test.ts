// SPDX-License-Identifier: AGPL-3.0-or-later
// Real files in a temp UPLOADS_DIR. unlink is a pass-through spy so a test can
// inject a failure other than "already gone".
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("node:fs/promises"), async (importOriginal) => {
  const fs = await importOriginal();
  return { ...fs, unlink: vi.fn<typeof fs.unlink>(fs.unlink) };
});
vi.mock(import("@/db/repositories/uploads.ts"));
vi.mock(import("@/db/repositories/instanceSettings.ts"));

import { config } from "@/config.ts";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import * as uploadsRepo from "@/db/repositories/uploads.ts";
import { cachePath } from "@/services/shareImage.ts";
import { startUploadGcSweeper, sweep } from "@/services/uploadGc.ts";

const NOW = new Date("2026-06-01T00:00:00.000Z");
const A = "0b0e7c4e-5d2a-4e0f-9f53-5f5a4f0d3a11";
const B = "1c1f8d5f-6e3b-4f10-8a64-6a6b5a1e4b22";

let tmp: string;
const originalUploads = config.UPLOADS_DIR;

function upload(filename: string) {
  writeFileSync(join(config.UPLOADS_DIR, filename), "img");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  tmp = mkdtempSync(join(tmpdir(), "omicron-gc-"));
  config.UPLOADS_DIR = tmp;
  mkdirSync(join(tmp, "og"));
  vi.mocked(uploadsRepo.referencedFilenames).mockResolvedValue([`${A}.png`]);
  vi.mocked(settingsRepo.get).mockResolvedValue(undefined);
  vi.mocked(uploadsRepo.refreshReferenced).mockResolvedValue(undefined);
  vi.mocked(uploadsRepo.listReapable).mockResolvedValue([]);
  vi.mocked(uploadsRepo.remove).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  config.UPLOADS_DIR = originalUploads;
  rmSync(tmp, { recursive: true, force: true });
});

test("refreshes references including the instance banner", async () => {
  vi.mocked(settingsRepo.get).mockResolvedValue(`/api/uploads/${B}.jpg` as never);
  await sweep();
  expect(vi.mocked(uploadsRepo.refreshReferenced).mock.calls[0][0].toSorted()).toEqual([`${A}.png`, `${B}.jpg`]);
});

test("a banner that is not an upload adds nothing", async () => {
  vi.mocked(settingsRepo.get).mockResolvedValue("https://cdn.example/banner.png");
  await sweep();
  expect(uploadsRepo.refreshReferenced).toHaveBeenCalledWith([`${A}.png`]);
});

test("reaps past the grace period: the file, its share image, then the row", async () => {
  upload(`${A}.png`);
  upload(`${B}.png`);
  writeFileSync(cachePath(B), "jpeg");
  vi.mocked(uploadsRepo.listReapable).mockResolvedValue([{ id: "row-1", filename: `${B}.png` }]);
  vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await sweep()).toBe(1);
  expect(uploadsRepo.listReapable).toHaveBeenCalledWith(
    new Date(NOW.getTime() - config.UPLOAD_GC_GRACE_DAYS * 86_400_000),
    200,
  );
  expect(existsSync(join(tmp, `${B}.png`))).toBe(false);
  expect(existsSync(cachePath(B))).toBe(false);
  // Referenced uploads are never touched.
  expect(existsSync(join(tmp, `${A}.png`))).toBe(true);
  expect(uploadsRepo.remove).toHaveBeenCalledWith("row-1");
});

test("a file that is already gone still lets the row go", async () => {
  vi.mocked(uploadsRepo.listReapable).mockResolvedValue([{ id: "row-1", filename: `${B}.png` }]);
  vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await sweep()).toBe(1);
  expect(uploadsRepo.remove).toHaveBeenCalledWith("row-1");
});

test("any other unlink failure keeps the row for a later sweep", async () => {
  upload(`${A}.png`);
  upload(`${B}.png`);
  vi.mocked(uploadsRepo.listReapable).mockResolvedValue([
    { id: "row-1", filename: `${A}.png` },
    { id: "row-2", filename: `${B}.png` },
  ]);
  vi.mocked(unlink).mockRejectedValueOnce(Object.assign(new Error("EACCES"), { code: "EACCES" }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await sweep()).toBe(1);
  expect(vi.mocked(uploadsRepo.remove).mock.calls).toEqual([["row-2"]]);
  expect(existsSync(join(tmp, `${A}.png`))).toBe(true);
});

test("a failure to forget the row is counted as not reaped", async () => {
  upload(`${B}.png`);
  vi.mocked(uploadsRepo.listReapable).mockResolvedValue([{ id: "row-1", filename: `${B}.png` }]);
  vi.mocked(uploadsRepo.remove).mockRejectedValue(new Error("db down"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await sweep()).toBe(0);
});

test.for(["referencedFilenames", "refreshReferenced", "listReapable"] as const)(
  "a failure in %s aborts the sweep before anything is deleted",
  async (step) => {
    upload(`${B}.png`);
    vi.mocked(uploadsRepo.listReapable).mockResolvedValue([{ id: "row-1", filename: `${B}.png` }]);
    vi.mocked(uploadsRepo[step]).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sweep()).toBe(0);
    expect(existsSync(join(tmp, `${B}.png`))).toBe(true);
  },
);

test("the sweeper starts once and repeats daily", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => {});
  startUploadGcSweeper();
  startUploadGcSweeper();
  await vi.advanceTimersByTimeAsync(0);
  expect(uploadsRepo.referencedFilenames).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(86_400_000);
  expect(uploadsRepo.referencedFilenames).toHaveBeenCalledTimes(2);
});
