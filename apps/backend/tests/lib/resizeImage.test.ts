// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  ImageMagick,
  MagickColor,
  MagickFormat,
  MagickImage,
  MagickImageCollection,
  MagickImageInfo,
} from "@imagemagick/magick-wasm";
import { beforeAll, describe, expect, test } from "vitest";
import { initializeMagick } from "@/lib/magick.ts";
import { IMAGE_WIDTHS, resizeToWebp, variantWidth } from "@/lib/resizeImage.ts";

beforeAll(initializeMagick);

/** A width×height image of one colour, encoded as `format`. */
function solid(width: number, height: number, format: MagickFormat, color = "#3366cc"): Uint8Array {
  let out!: Uint8Array;
  ImageMagick.read(new MagickColor(color), width, height, (img) => {
    img.write(format, (bytes) => (out = new Uint8Array(bytes)));
  });
  return out;
}

const size = (bytes: Uint8Array) => {
  const info = MagickImageInfo.create(bytes);
  return { width: info.width, height: info.height, format: info.format };
};

describe("variantWidth", () => {
  test("snaps a request up to the next served width", () => {
    expect(variantWidth("1")).toBe(64);
    expect(variantWidth("64")).toBe(64);
    expect(variantWidth("288")).toBe(384);
    expect(variantWidth("1280")).toBe(1280);
  });

  test("anything past the largest width, or not a width at all, is the original", () => {
    for (const bad of [null, undefined, "", "0", "1281", "99999", "-5", "12.5", "1e3", "abc", "256px"]) {
      expect(variantWidth(bad)).toBe(null);
    }
  });

  test("so one image only ever has a handful of variants", () => {
    const seen = new Set(Array.from({ length: 1400 }, (_, i) => variantWidth(String(i + 1))));
    expect(seen.size).toBe(IMAGE_WIDTHS.length + 1);
  });
});

describe("resizeToWebp", () => {
  test("shrinks to the width, keeps the aspect ratio, and re-encodes as WebP", async () => {
    const out = await resizeToWebp(solid(1600, 900, MagickFormat.Png), "image/png", 384);
    expect(out).not.toBe(null);
    expect(size(out!)).toEqual({ width: 384, height: 216, format: MagickFormat.WebP });
  });

  test.for([
    ["image/jpeg", MagickFormat.Jpeg],
    ["image/webp", MagickFormat.WebP],
    ["image/gif", MagickFormat.Gif],
  ] as const)("reads %s", async ([type, format]) => {
    const out = await resizeToWebp(solid(800, 400, format), type, 256);
    expect(size(out!)).toMatchObject({ width: 256, height: 128 });
  });

  test("the variant is much smaller than a large original", async () => {
    // Noise compresses badly, like a photo, unlike a flat colour.
    let photo!: Uint8Array;
    ImageMagick.read("plasma:", (img) => {
      img.resize(1600, 1000);
      img.write(MagickFormat.Jpeg, (bytes) => (photo = new Uint8Array(bytes)));
    });
    const out = await resizeToWebp(photo, "image/jpeg", 384);
    expect(out!.byteLength).toBeLessThan(photo.byteLength / 5);
  });

  test("never enlarges: an image already that narrow is served as is", async () => {
    expect(await resizeToWebp(solid(300, 300, MagickFormat.Png), "image/png", 384)).toBe(null);
    expect(await resizeToWebp(solid(384, 100, MagickFormat.Png), "image/png", 384)).toBe(null);
  });

  test("an animation is served as is rather than cut to its first frame", async () => {
    let gif!: Uint8Array;
    MagickImageCollection.use((frames) => {
      for (const color of ["red", "blue"]) {
        const frame = MagickImage.create(new MagickColor(color), 800, 400);
        frame.animationDelay = 50;
        frames.push(frame);
      }
      frames.write(MagickFormat.Gif, (bytes) => (gif = new Uint8Array(bytes)));
    });
    expect(await resizeToWebp(gif, "image/gif", 256)).toBe(null);
  });

  test("a type that isn't a raster we decode is served as is", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="10"/>');
    expect(await resizeToWebp(svg, "image/svg+xml", 256)).toBe(null);
    expect(await resizeToWebp(solid(800, 400, MagickFormat.Png), "application/octet-stream", 256)).toBe(null);
  });

  test("a canvas too large to decode safely is served as is, without decoding it", async () => {
    expect(await resizeToWebp(solid(12_001, 2, MagickFormat.Png), "image/png", 256)).toBe(null);
    expect(await resizeToWebp(solid(7_000, 6_000, MagickFormat.Png, "white"), "image/png", 256)).toBe(null);
  });

  test("bytes that aren't the declared type are refused, not reinterpreted", async () => {
    await expect(resizeToWebp(solid(800, 400, MagickFormat.Png), "image/jpeg", 256)).rejects.toThrow(/Not a JPEG file/);
  });
});
