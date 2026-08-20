// SPDX-License-Identifier: AGPL-3.0-or-later
import { initializeImageMagick } from "@imagemagick/magick-wasm";

// One initialisation of the ImageMagick wasm module for the whole process.
//
// The blob is ~14MB and initialising it is not free, so it happens once,
// lazily, on the first request that needs it — never during boot, which would
// tax every instance whether or not an image is ever transcoded. Held as the
// promise rather than a flag so concurrent first requests await one
// initialisation instead of racing into several.
//
// Shared rather than per-module: `initializeImageMagick` is global state, and
// two callers each guarding their own copy would call it twice. Both users —
// the share-image transcode (lib/shareImage.ts) and the generated post card
// (lib/ogCard.ts) — go through here.
let ready: Promise<void> | null = null;

export function initializeMagick(): Promise<void> {
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
