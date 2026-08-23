// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { toShareJpeg } from "@/lib/shareImage.ts";

// The share image exists for one reason: a link-preview scraper — WhatsApp
// above all — must receive a JPEG, because it silently shows nothing for the
// WebP every upload is stored as. So what is asserted here is the promise the
// feature makes, not the library's behaviour: JPEG bytes out, small enough and
// large enough for the platforms that consume them.
//
// Also guards the wasm binding itself. It loads a 14MB module through an import
// map and a callback API; an upgrade that moved either would otherwise fail
// only in production, on a page nobody looks at until a share comes out blank.

// A 400x200 PNG, left half opaque red and right half fully transparent — so the
// decode, the alpha flattening and the encode are all exercised.
const TRANSPARENT_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAZAAAADICAYAAADGFbfiAAADsElEQVR42u3VAQ0AAAgCQfqXxgJawN1tXwHSpJL2AtyMhORAwIFIDgQciORAwIFIDgQciORAAAciORBwIJIDAQciORBwIJIDAQciORDAgUgOBByI5EDAgUgOBByI5EDAgUgOBHAgkgMBByI5EHAgkgMBByI5EHAgkhwIOBDJgYADkRwIOBDJgYADkRwIOBBJDgQciORAwIFIDgQciORAwIFIDgQciCQHAg5EciDgQCQHAg5EciDgQCQHAg5EkgMBByI5EHAgkgMBByI5EHAgkgMBHIjkQMCBSA4EHIjkQMCBSA4EHIjkQAAHIjkQcCCSAwEHIjkQcCCSAwEHIjkQwIFIDgQciORAwIFIDgQciORAwIFIDgRwIJIDAQciORBwIJIDAQciORBwIJIcCDgQyYGAA5EcCDgQyYGAA5EcCDgQSQ4EHIjkQMCBSA4EHIjkQMCBSA4EHIgkBwIORHIg4EAkBwIORHIg4EAkBwIOxEhIDgQciORAwIFIDgQciORAwIFIDgRwIJIDAQciORBwIJIDAQciORBwIJIDARyI5EDAgUgOBByI5EDAgUgOBByI5EAAByI5EHAgkgMBByI5EHAgkgMBByLJQoADkRwIOBDJgYADkRwIOBDJgYADkeRAwIFIDgQciORAwIFIDgQciORAwIFIciDgQCQHAg5EciDgQCQHAg5EciDgQCQ5EHAgkgMBByI5EHAgkgMBByI5EMCBSA4EHIjkQMCBSA4EHIjkQMCBSA4EcCCSAwEHIjkQcCCSAwEHIjkQcCCSAwEciORAwIFIDgQciORAwIFIDgQciORAAAciORBwIJIDAQciORBwIJIDAQciyYGAA5EcCDgQyYGAA5EcCDgQyYGAA5HkQMCBSA4EHIjkQMCBSA4EHIjkQMCBSHIg4EAkBwIORHIg4EAkBwIORHIg4ECMhORAwIFIDgQciORAwIFIDgQciORAAAciORBwIJIDAQciORBwIJIDAQciORDAgUgOBByI5EDAgUgOBByI5EDAgUgOBHAgkgMBByI5EHAgkgMBByI5EHAgkgMBHIjkQMCBSA4EHIjkQMCBSA4EHIgkBwIORHIg4EAkBwIORHIg4EAkBwIORJIDAQciORBwIJIDAQciORBwIJIDAQciyYGAA5EcCDgQyYGAA5EcCDgQyYEADkRyIOBAJAcCDkRyIOBAJAcCDkRyIIADkRwIOBDJgYADkRwIOBDJgYADkRwI4EAkBwIORHIg4EAkBwIORHIg8N8Aqh9Zuu00k14AAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);

/** Width and height read out of a JPEG's start-of-frame marker. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  for (let i = 2; i < bytes.length - 9;) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8],
      };
    }
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

test("toShareJpeg: returns JPEG bytes, whatever went in", async () => {
  const jpeg = await toShareJpeg(TRANSPARENT_PNG);
  // SOI + the first marker: what a scraper sniffs for.
  expect([jpeg[0], jpeg[1], jpeg[2]]).toEqual([0xff, 0xd8, 0xff]);
});

test("toShareJpeg: an image already inside the card box is not upscaled", async () => {
  // 400x200 fits within 1200x630, so enlarging it would only ship a blurry
  // upscale to save nobody anything.
  expect(jpegSize(await toShareJpeg(TRANSPARENT_PNG))).toEqual({ width: 400, height: 200 });
});

test("toShareJpeg: stays well under WhatsApp's ~600KB ceiling", async () => {
  const jpeg = await toShareJpeg(TRANSPARENT_PNG);
  expect(jpeg.length, `share image was ${jpeg.length} bytes`).toBeLessThan(600 * 1024);
});
