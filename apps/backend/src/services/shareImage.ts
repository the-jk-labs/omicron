// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";
import { toShareJpeg } from "@/lib/shareImage.ts";
import { IMAGE_TYPES } from "@/services/media.ts";

// On-disk caching for post share images. The transcode itself is in
// lib/shareImage.ts, which explains why a JPEG copy exists at all.

/** Where a derivative is cached on disk. */
export function cachePath(id: string): string {
  return `${config.UPLOADS_DIR}/og/${id}.jpg`;
}

/**
 * The stored upload a share image should be built from.
 *
 * Uploads are named `<uuid>.<ext>` and the share URL carries only the uuid, so
 * the extension is recovered by trying the ones we accept. At most a handful of
 * stat calls, and only on the first request for a given image.
 */
export async function findSource(id: string): Promise<Uint8Array<ArrayBuffer> | null> {
  for (const ext of new Set(Object.values(IMAGE_TYPES))) {
    try {
      return await Deno.readFile(`${config.UPLOADS_DIR}/${id}.${ext}`);
    } catch {
      // Not this extension; try the next.
    }
  }
  return null;
}

/**
 * The cached JPEG for an upload, generating it if this is the first request.
 *
 * Returns null when no upload with that id exists. Written to a temporary file
 * and renamed into place, so two scrapers arriving together can never serve
 * each other a half-written image.
 */
export async function shareJpeg(id: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const cached = cachePath(id);
  try {
    return await Deno.readFile(cached);
  } catch {
    // Not built yet.
  }

  const source = await findSource(id);
  if (!source) return null;

  const jpeg = await toShareJpeg(source);
  await Deno.mkdir(`${config.UPLOADS_DIR}/og`, { recursive: true });
  const tmp = `${cached}.${crypto.randomUUID()}.tmp`;
  try {
    await Deno.writeFile(tmp, jpeg);
    await Deno.rename(tmp, cached);
  } catch {
    // A failed cache write costs a re-transcode next time; it must not cost the
    // caller their share image.
    await Deno.remove(tmp).catch(() => {});
  }
  return jpeg;
}
