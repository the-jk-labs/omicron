// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";
import { badRequest } from "@/lib/http.ts";

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

// Confirms the leading bytes actually match the claimed image format. The
// declared content-type is attacker-controlled, so without this a caller could
// store an HTML/SVG/script payload behind an image extension (a stored-XSS or
// content-sniffing vector). We only accept files whose real magic number matches
// one of our raster formats — never SVG, which is an active-content type.
export function sniffMatches(bytes: Uint8Array, ext: string): boolean {
  const b = bytes;
  switch (ext) {
    case "png":
      return b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
        b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
    case "jpg":
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "gif":
      // "GIF87a" or "GIF89a"
      return b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
        (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61;
    case "webp":
      // "RIFF" .... "WEBP"
      return b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    default:
      return false;
  }
}

// Persists an uploaded image to local disk and returns its public URL, served
// back through `mediaRoutes` (mounted at /api/uploads).
export async function saveImage(bytes: Uint8Array, contentType: string): Promise<string> {
  const ext = IMAGE_TYPES[contentType];
  if (!ext) throw badRequest("Unsupported image type. Use PNG, JPEG, WebP, or GIF.");
  if (bytes.byteLength === 0) throw badRequest("The uploaded file is empty.");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw badRequest("Image too large (max 5 MB).");
  if (!sniffMatches(bytes, ext)) {
    throw badRequest("The file contents don't match a PNG, JPEG, WebP, or GIF image.");
  }

  await Deno.mkdir(config.UPLOADS_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.${ext}`;
  await Deno.writeFile(`${config.UPLOADS_DIR}/${filename}`, bytes);
  return `/api/uploads/${filename}`;
}
