// SPDX-License-Identifier: AGPL-3.0-or-later

// Twitter-style client-side image handling: downscale large photos and re-encode
// to WebP before upload, so phone-sized images "just work" without shipping a
// heavy image library to the server. The backend still enforces a hard byte cap
// (see services/media.ts) as a safety net.

// Longest edge after resizing; large enough for a full-width blog image.
const MAX_DIMENSION = 1600;
// Avatars never render large (~72px in the profile, smaller in feeds); 256px
// covers retina without shipping a multi-hundred-KB photo.
export const AVATAR_MAX_DIMENSION = 256;
// WebP quality — a good size/quality trade-off for photographic content.
const WEBP_QUALITY = 0.82;

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const ACCEPTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

// Whether a picked file is an image we accept. We can't rely on `file.type`
// alone: some browsers/OSes report a non-standard MIME (e.g. "image/jpg") or an
// empty string for otherwise-valid files, so fall back to the file extension.
export function isAcceptedImage(file: File): boolean {
  if (file.type && ACCEPTED_IMAGE_TYPES.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export type PreparedImage = { blob: Blob; type: string };

// Resizes and re-encodes `file` for upload. Animated GIFs are passed through
// untouched (a canvas would flatten them to a single frame). On any failure the
// original file is returned so the upload can still proceed. `maxDimension`
// caps the longest edge — pass a smaller value for avatars, which never render
// large (see AVATAR_MAX_DIMENSION).
export async function prepareImage(
  file: File,
  maxDimension: number = MAX_DIMENSION,
): Promise<PreparedImage> {
  if (file.type === "image/gif") return { blob: file, type: file.type };

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { blob: file, type: file.type };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY)
    );
    // Fall back to the original if WebP encoding is unsupported, or if it somehow
    // came out larger than the source (e.g. an already-tiny image).
    if (!blob || blob.size >= file.size) return { blob: file, type: file.type };
    return { blob, type: "image/webp" };
  } catch {
    return { blob: file, type: file.type };
  }
}
