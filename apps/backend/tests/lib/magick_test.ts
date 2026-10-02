// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";

const { init, readFile } = vi.hoisted(() => ({
  init: vi.fn<(wasm: unknown) => Promise<void>>(),
  readFile: vi.fn<(path: string) => Promise<Uint8Array>>(),
}));

vi.mock(import("@imagemagick/magick-wasm"), () => ({ initializeImageMagick: init as never }));
vi.mock(import("node:fs/promises"), () => ({ readFile: readFile as never }));

async function load() {
  vi.resetModules();
  return (await import("@/lib/magick.ts")).initializeMagick;
}

beforeEach(() => {
  init.mockReset();
  readFile.mockReset();
  readFile.mockResolvedValue(new Uint8Array([0, 97, 115, 109]));
});

test("initializes the wasm module once, however many callers ask", async () => {
  init.mockResolvedValue();
  const initializeMagick = await load();
  await Promise.all([initializeMagick(), initializeMagick(), initializeMagick()]);
  await initializeMagick();
  expect(init).toHaveBeenCalledOnce();
  expect(readFile).toHaveBeenCalledOnce();
  expect(readFile.mock.calls[0][0]).toMatch(/magick\.wasm$/);
});

test("concurrent first callers share one promise", async () => {
  init.mockResolvedValue();
  const initializeMagick = await load();
  expect(initializeMagick()).toBe(initializeMagick());
});

test("a failed initialization is retried on the next call", async () => {
  init.mockRejectedValueOnce(new Error("wasm failed")).mockResolvedValue();
  const initializeMagick = await load();
  await expect(initializeMagick()).rejects.toThrow("wasm failed");
  await expect(initializeMagick()).resolves.toBeUndefined();
  expect(init).toHaveBeenCalledTimes(2);
});

test("a failed read of the wasm blob is also retried", async () => {
  readFile.mockRejectedValueOnce(new Error("ENOENT"));
  init.mockResolvedValue();
  const initializeMagick = await load();
  await expect(initializeMagick()).rejects.toThrow("ENOENT");
  await expect(initializeMagick()).resolves.toBeUndefined();
});
