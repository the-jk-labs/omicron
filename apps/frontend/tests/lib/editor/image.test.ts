// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { isAcceptedImage, prepareImage } from "#lib/editor/image.js";

const file = (name: string, type: string, size = 1000) => new File([new Uint8Array(size)], name, { type });

describe("isAcceptedImage", () => {
  test.for([
    ["a.png", "image/png"],
    ["a.JPG", ""],
    ["photo", "image/webp"],
    ["a.gif", "image/gif"],
  ])("%s (%s) is accepted", ([name, type]) => {
    expect(isAcceptedImage(file(name, type))).toBe(true);
  });

  test.for([
    ["a.svg", "image/svg+xml"],
    ["a.heic", "image/heic"],
    ["a.txt", ""],
  ])("%s (%s) is refused", ([name, type]) => {
    expect(isAcceptedImage(file(name, type))).toBe(false);
  });
});

describe("prepareImage", () => {
  // A fake canvas pipeline: `sizes` is what each successive toBlob encodes to.
  let sizes: number[];
  let drawn: { width: number; height: number }[];

  beforeEach(() => {
    sizes = [];
    drawn = [];
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn<() => Promise<{ width: number; height: number; close: () => void }>>(async () => ({
        width: 4000,
        height: 2000,
        close: () => {},
      })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      return { drawImage: () => drawn.push({ width: this.width, height: this.height }) } as never;
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb, type, quality) => {
      const size = sizes.shift() ?? 10;
      cb(new Blob([new Uint8Array(size)], { type: `${type}` }));
      expect(typeof quality).toBe("number");
    });
  });

  test("a GIF is passed through untouched, animation and all", async () => {
    const gif = file("a.gif", "image/gif");
    expect(await prepareImage(gif)).toEqual({ blob: gif, type: "image/gif" });
  });

  test("downscales to the longest edge and re-encodes as WebP", async () => {
    sizes = [500];
    const out = await prepareImage(file("a.png", "image/png", 5000), 1600);
    expect(drawn[0]).toEqual({ width: 1600, height: 800 });
    expect(out.type).toBe("image/webp");
    expect(out.blob.size).toBe(500);
  });

  test("keeps the original when re-encoding would not make it smaller", async () => {
    sizes = [9000];
    const original = file("a.png", "image/png", 5000);
    expect(await prepareImage(original)).toEqual({ blob: original, type: "image/png" });
  });

  test("under a byte cap: lowers quality first, then halves dimensions", async () => {
    sizes = [900, 800, 700, 600, 300];
    const out = await prepareImage(file("a.png", "image/png", 100_000), 1600, 400);
    expect(out.blob.size).toBe(300);
    expect(drawn.map((d) => d.width)).toEqual([1600, 800]);
  });

  test("stops halving at a floor even if the cap is still not met", async () => {
    sizes = Array.from({ length: 20 }, () => 5000);
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 100, height: 100, close: () => {} });
    const original = file("a.png", "image/png", 100_000);
    const out = await prepareImage(original, 1600, 10);
    expect(drawn.at(-1)!.width).toBeLessThanOrEqual(48);
    expect(out.type).toBe("image/webp");
  });

  test("no 2D context, or a decode failure, falls back to the original file", async () => {
    const original = file("a.png", "image/png");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(await prepareImage(original)).toEqual({ blob: original, type: "image/png" });
    vi.mocked(createImageBitmap).mockRejectedValue(new Error("undecodable"));
    expect(await prepareImage(original)).toEqual({ blob: original, type: "image/png" });
  });
});
