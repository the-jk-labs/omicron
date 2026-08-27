// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";
import * as uploadsRepo from "@/db/repositories/uploads.ts";
import { badRequest, payloadTooLarge, type HttpError } from "@/lib/http.ts";

// Business logic for user-uploaded post media. Images are downscaled and
// re-encoded in the browser before upload (see the editor), so this layer only
// validates and persists; the byte cap below is a server-side safety net for
// oversized or hand-crafted requests, not the everyday path.

// Image types we accept for post media, mapped to the persisted file extension.
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// Storage quotas as bytes, straight from the MB-valued env knobs (see
// services/media.ts saveImage for how they are enforced). Exported so every
// upload path — post images here, avatars in services/users.ts — checks the
// same caps.
export const UPLOAD_USER_QUOTA_BYTES = config.UPLOAD_QUOTA_USER_MB * 1024 * 1024;
export const UPLOAD_TOTAL_QUOTA_BYTES = config.UPLOAD_QUOTA_TOTAL_MB * 1024 * 1024;

// Maps a quota verdict to the error the upload endpoint surfaces. 413 rather
// than 403: the request itself was fine, the payload simply does not fit.
export function quotaError(reason: "user" | "total"): HttpError {
  return reason === "user"
    ? payloadTooLarge(
        `Upload storage limit reached (${config.UPLOAD_QUOTA_USER_MB} MB per account). Remove old images — edit older posts or clear your avatar — and try again.`,
      )
    : payloadTooLarge(
        `This instance's upload storage is full (${config.UPLOAD_QUOTA_TOTAL_MB} MB). Please contact the operator.`,
      );
}

// Confirms the leading bytes actually match the claimed image format. The
// declared content-type is attacker-controlled, so without this a caller could
// store an HTML/SVG/script payload behind an image extension (a stored-XSS or
// content-sniffing vector). We only accept files whose real magic number matches
// one of our raster formats — never SVG, which is an active-content type.
export function sniffMatches(bytes: Uint8Array, ext: string): boolean {
  const b = bytes;
  switch (ext) {
    case "png":
      return (
        b.length >= 8 &&
        b[0] === 0x89 &&
        b[1] === 0x50 &&
        b[2] === 0x4e &&
        b[3] === 0x47 &&
        b[4] === 0x0d &&
        b[5] === 0x0a &&
        b[6] === 0x1a &&
        b[7] === 0x0a
      );
    case "jpg":
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "gif":
      // "GIF87a" or "GIF89a"
      return (
        b.length >= 6 &&
        b[0] === 0x47 &&
        b[1] === 0x49 &&
        b[2] === 0x46 &&
        b[3] === 0x38 &&
        (b[4] === 0x37 || b[4] === 0x39) &&
        b[5] === 0x61
      );
    case "webp":
      // "RIFF" .... "WEBP"
      return (
        b.length >= 12 &&
        b[0] === 0x52 &&
        b[1] === 0x49 &&
        b[2] === 0x46 &&
        b[3] === 0x46 &&
        b[8] === 0x57 &&
        b[9] === 0x45 &&
        b[10] === 0x42 &&
        b[11] === 0x50
      );
    default:
      return false;
  }
}

// Persists an uploaded image to local disk and returns its public URL, served
// back through `mediaRoutes` (mounted at /api/uploads). `ownerId` records who
// made the upload (see db/schema.ts `uploads`) so storage use is attributable.
// The quota is reserved before a byte is written, so storage can never fill
// with files the database has already refused; a failed disk write releases
// the reservation immediately (the GC would clear the orphaned row eventually
// anyway, but a quota that heals on the next upload is kinder than one that
// waits a month).
export async function saveImage(ownerId: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const ext = IMAGE_TYPES[contentType];
  if (!ext) throw badRequest("Unsupported image type. Use PNG, JPEG, WebP, or GIF.");
  if (bytes.byteLength === 0) throw badRequest("The uploaded file is empty.");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw badRequest("Image too large (max 5 MB).");
  if (!sniffMatches(bytes, ext)) {
    throw badRequest("The file contents don't match a PNG, JPEG, WebP, or GIF image.");
  }

  const filename = `${crypto.randomUUID()}.${ext}`;
  const verdict = await uploadsRepo.createWithinQuota(
    ownerId,
    filename,
    bytes.byteLength,
    UPLOAD_USER_QUOTA_BYTES,
    UPLOAD_TOTAL_QUOTA_BYTES,
  );
  if (!verdict.ok) throw quotaError(verdict.reason);

  await Deno.mkdir(config.UPLOADS_DIR, { recursive: true });
  try {
    await Deno.writeFile(`${config.UPLOADS_DIR}/${filename}`, bytes);
  } catch (err) {
    await uploadsRepo.removeByFilename(filename).catch(() => {});
    throw err;
  }
  return `/api/uploads/${filename}`;
}
