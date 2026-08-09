// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  AlphaAction,
  ImageMagick,
  initializeImageMagick,
  MagickColor,
  MagickFormat,
} from "@imagemagick/magick-wasm";

// Transcoding an uploaded image into the JPEG used as a post's Open Graph
// share image.
//
// Deliberately free of config and filesystem imports, like lib/webhook.ts, so
// the transcode is unit-testable on its own; the caching that needs the uploads
// directory lives in services/shareImage.ts.
//
// Everything uploaded here is re-encoded to WebP in the browser before it is
// sent (see the frontend's editor/image.ts), which is right for the page: it is
// materially smaller than JPEG and every browser has supported it for years.
// Link-preview scrapers are not browsers. WhatsApp's handling of a WebP
// `og:image` is unreliable and fails *silently* — no image, no error — while
// Telegram renders it fine, which is exactly the "works there, blank here"
// report this exists to fix.
//
// So the page keeps its WebP and the share tag points at a JPEG derivative
// generated from it on first request and cached on disk. Nothing about the
// stored upload changes, which is what makes this work for posts published
// before any of this existed — no backfill, no re-upload.
//
// Only ever fetched by a scraper, once per image per platform, so the cost is a
// single transcode amortised over the life of the post.

// 1200x630 is the size every platform documents for a share card. The image is
// fitted inside that box rather than cropped to it: a banner is the author's
// composition, and silently cutting a third off it to hit an aspect ratio is
// worse than a card that letterboxes. Fitting also keeps us inside WhatsApp's
// stated bounds (at least 300px wide, no narrower than 4:1).
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
// Comfortably under WhatsApp's ~600KB ceiling at these dimensions.
const OG_QUALITY = 82;

// The wasm blob is ~14MB and initialising it is not free, so it happens once,
// lazily, on the first share-image request — never during boot, which would tax
// every instance whether or not a link is ever shared. Held as the promise
// rather than a flag so concurrent first requests await one initialisation
// instead of racing into several.
let ready: Promise<void> | null = null;

function initialize(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      // Resolved through the import map rather than a path into node_modules,
      // so it works the same under `deno cache` in the image and a local run.
      const wasm = await Deno.readFile(
        new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm")),
      );
      await initializeImageMagick(wasm);
    })().catch((err) => {
      // Let a failed initialisation be retried rather than poisoning every
      // later request with the same rejected promise.
      ready = null;
      throw err;
    });
  }
  return ready;
}

/** Transcode an uploaded image to the JPEG used as a share image. */
export async function toShareJpeg(source: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  await initialize();
  let out: Uint8Array<ArrayBuffer> | null = null;
  ImageMagick.read(source, (img) => {
    // Drops EXIF: a scraper needs none of it, and a phone photo's camera and
    // GPS tags have no business being republished on a share card.
    img.strip();
    // Only ever shrinks — enlarging a small image to fill the box would just
    // ship a blurry upscale.
    if (img.width > OG_WIDTH || img.height > OG_HEIGHT) img.resize(OG_WIDTH, OG_HEIGHT);
    img.quality = OG_QUALITY;
    // JPEG has no alpha channel, and dropping one without compositing first
    // leaves every transparent pixel black — a logo on a transparent PNG would
    // arrive as a black slab. Flatten onto white instead, which is what the
    // card is shown against anyway.
    img.backgroundColor = new MagickColor("white");
    img.alpha(AlphaAction.Remove);
    // Copied out of the callback: the buffer magick hands over is only valid
    // for the duration of the call.
    img.write(MagickFormat.Jpeg, (bytes) => {
      out = new Uint8Array(bytes);
    });
  });
  if (!out) throw new Error("Share image could not be encoded.");
  return out;
}
