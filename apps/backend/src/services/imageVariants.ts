// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { config } from "@/config.ts";
import { IMAGE_WIDTHS, resizeToWebp } from "@/lib/resizeImage.ts";

// Caching and scheduling for resized image variants (lib/resizeImage.ts).
//
// A resize runs synchronously in the wasm module (~70–160 ms for a 1600 px
// upload), so they run one at a time, and past a short queue the original is
// served instead of stalling every other request behind a burst of them.
// Each upload is resized once per width and kept on disk beside the uploads;
// remote images, which can't be kept forever, are held in a capped memory cache.

export type Variant = { bytes: Uint8Array; contentType: string };

const MAX_QUEUED = 16;
let queued = 0;
let tail: Promise<unknown> = Promise.resolve();
const BUSY = Symbol("busy");

/** Runs resizes one after another; BUSY when the queue is full. */
function scheduled<T>(work: () => Promise<T>): Promise<T | typeof BUSY> {
  if (queued >= MAX_QUEUED) return Promise.resolve(BUSY);
  queued++;
  const run = tail.then(work, work).finally(() => queued--);
  tail = run.catch(() => {});
  return run;
}

// Keys whose answer is "serve the original" (already that narrow, animated,
// undecodable), so they aren't decoded again on every request. A full queue is
// never remembered: that answer only holds for the moment.
const ORIGINAL_MAX_ENTRIES = 8192;
const original = new Set<string>();
function rememberOriginal(key: string) {
  original.add(key);
  if (original.size > ORIGINAL_MAX_ENTRIES) original.delete(original.values().next().value!);
}

/** A resize through the queue: bytes, null for "serve the original", or BUSY. */
async function resize(key: string, source: () => Promise<Uint8Array>, contentType: string, width: number) {
  const result = await scheduled(async () => {
    try {
      return await resizeToWebp(await source(), contentType, width);
    } catch (err) {
      console.warn(`Image resize failed for ${key}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  });
  if (result === null) rememberOriginal(key);
  return result;
}

// One resize per key at a time: a feed full of the same avatar asks once.
const pending = new Map<string, Promise<Variant | null>>();
function once(key: string, work: () => Promise<Variant | null>): Promise<Variant | null> {
  let running = pending.get(key);
  if (!running) {
    running = work().finally(() => pending.delete(key));
    pending.set(key, running);
  }
  return running;
}

/** Where an upload's variant at one width is cached. */
export function variantPath(file: string, width: number): string {
  return `${config.UPLOADS_DIR}/w/${width}/${file.replace(/\.[a-z0-9]+$/i, "")}.webp`;
}

/** Deletes every cached variant of an upload (its source is being removed). */
export async function removeUploadVariants(file: string): Promise<void> {
  await Promise.all(IMAGE_WIDTHS.map((w) => unlink(variantPath(file, w)).catch(() => {})));
}

/**
 * An upload at `width`, from the disk cache or resized now. Null means serve
 * the original: it's already that narrow, animated, or the queue is full.
 */
export function uploadVariant(
  file: string,
  source: () => Promise<Uint8Array>,
  contentType: string,
  width: number,
): Promise<Variant | null> {
  const path = variantPath(file, width);
  if (original.has(path)) return Promise.resolve(null);
  return once(path, async () => {
    try {
      return { bytes: await readFile(path), contentType: "image/webp" };
    } catch {
      // Not built yet.
    }
    const bytes = await resize(path, source, contentType, width);
    if (bytes === null || bytes === BUSY) return null;
    // Written aside and renamed in, so a concurrent reader never sees half a file.
    const tmp = `${path}.${crypto.randomUUID()}.tmp`;
    try {
      await mkdir(`${config.UPLOADS_DIR}/w/${width}`, { recursive: true });
      await writeFile(tmp, bytes);
      await rename(tmp, path);
    } catch {
      // A failed cache write costs a resize next time, not this response.
      await unlink(tmp).catch(() => {});
    }
    return { bytes, contentType: "image/webp" };
  });
}

// Remote variants: least recently used first out, capped by bytes and count.
const REMOTE_MAX_BYTES = 24 * 1024 * 1024;
const REMOTE_MAX_ENTRIES = 2048;
const remote = new Map<string, Variant>();
let remoteBytes = 0;

function rememberRemote(key: string, variant: Variant) {
  remote.set(key, variant);
  remoteBytes += variant.bytes.byteLength;
  for (const [old, entry] of remote) {
    if (remoteBytes <= REMOTE_MAX_BYTES && remote.size <= REMOTE_MAX_ENTRIES) break;
    remote.delete(old);
    remoteBytes -= entry.bytes.byteLength;
  }
}

/** A proxied remote image at `width`; null means serve the original. */
export function remoteVariant(url: string, image: Variant, width: number): Promise<Variant | null> {
  const key = `${width} ${url}`;
  if (original.has(key)) return Promise.resolve(null);
  const hit = remote.get(key);
  if (hit) {
    // Re-inserted so it counts as recently used.
    remote.delete(key);
    remote.set(key, hit);
    return Promise.resolve(hit);
  }
  return once(key, async () => {
    const bytes = await resize(key, async () => image.bytes, image.contentType, width);
    if (bytes === null || bytes === BUSY) return null;
    const variant = { bytes, contentType: "image/webp" };
    rememberRemote(key, variant);
    return variant;
  });
}

/** Test hook: forgets every in-memory answer. */
export function clearVariantCaches() {
  remote.clear();
  remoteBytes = 0;
  original.clear();
}
