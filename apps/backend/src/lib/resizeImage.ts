// SPDX-License-Identifier: AGPL-3.0-or-later
import { ImageMagick, MagickFormat, MagickImageInfo, MagickReadSettings } from "@imagemagick/magick-wasm";
import { initializeMagick } from "@/lib/magick.ts";

// Smaller copies of an image for the places that show it small: a 144 px feed
// thumbnail or a 40 px avatar used to download the full 1600 px upload or a
// remote original of any size. Free of config and filesystem imports, like
// lib/shareImage.ts; the caching lives in services/imageVariants.ts.

// The only widths served, so one image has a bounded number of variants and a
// `?w=` can't be used to make the server render (and cache) endless sizes. A
// request snaps up to the next one; anything past the last gets the original.
export const IMAGE_WIDTHS = [64, 128, 256, 384, 640, 960, 1280] as const;

/** The variant width a `?w=` asks for, or null for the original. */
export function variantWidth(requested: string | null | undefined): number | null {
  if (!requested || !/^\d{1,5}$/.test(requested)) return null;
  const width = Number(requested);
  if (width <= 0) return null;
  return IMAGE_WIDTHS.find((w) => w >= width) ?? null;
}

// Decoded from a known type only: the bytes are named, never sniffed by
// ImageMagick, so a file can't steer it into some other coder.
const FORMATS: Record<string, MagickFormat> = {
  "image/png": MagickFormat.Png,
  "image/jpeg": MagickFormat.Jpeg,
  "image/webp": MagickFormat.WebP,
  "image/gif": MagickFormat.Gif,
};

// Beyond these an image isn't decoded at all (a small file can declare a huge
// canvas); the original is served instead.
const MAX_SIDE = 12_000;
const MAX_PIXELS = 40_000_000;
const QUALITY = 80;

/**
 * A WebP of `source` at most `width` px wide, or null when the original should
 * be served as is: a type we don't resize (SVG), an image already that narrow,
 * an animation (a resize would keep only its first frame), or one too large
 * to decode safely.
 */
export async function resizeToWebp(
  source: Uint8Array,
  contentType: string,
  width: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const format = FORMATS[contentType];
  if (!format) return null;
  await initializeMagick();

  const info = MagickImageInfo.create(source, new MagickReadSettings({ format }));
  if (info.width <= width) return null;
  if (info.width > MAX_SIDE || info.height > MAX_SIDE || info.width * info.height > MAX_PIXELS) return null;

  let out: Uint8Array<ArrayBuffer> | null = null;
  ImageMagick.readCollection(source, format, (frames) => {
    if (frames.length !== 1) return;
    const img = frames[0];
    // EXIF has no place on a thumbnail, and a phone photo's GPS tags least of all.
    img.strip();
    img.resize(width, 0);
    img.quality = QUALITY;
    img.write(MagickFormat.WebP, (bytes) => {
      out = new Uint8Array(bytes);
    });
  });
  return out;
}
