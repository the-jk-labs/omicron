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

// Persists an uploaded image to local disk and returns its public URL, served
// back through `mediaRoutes` (mounted at /api/uploads).
export async function saveImage(bytes: Uint8Array, contentType: string): Promise<string> {
  const ext = IMAGE_TYPES[contentType];
  if (!ext) throw badRequest("Unsupported image type. Use PNG, JPEG, WebP, or GIF.");
  if (bytes.byteLength === 0) throw badRequest("The uploaded file is empty.");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw badRequest("Image too large (max 5 MB).");

  await Deno.mkdir(config.UPLOADS_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.${ext}`;
  await Deno.writeFile(`${config.UPLOADS_DIR}/${filename}`, bytes);
  return `/api/uploads/${filename}`;
}
