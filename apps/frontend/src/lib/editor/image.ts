// SPDX-License-Identifier: AGPL-3.0-or-later

// Twitter-style client-side image handling: downscale large photos and re-encode
// to WebP before upload, so phone-sized images "just work" without shipping a
// heavy image library to the server. The backend still enforces a hard byte cap
// (see services/media.ts) as a safety net.

// Longest edge after resizing; large enough for a full-width blog image.
const MAX_DIMENSION = 1600;
// Avatars never render large (72px in the profile is the biggest use, smaller in
// feeds); 160px covers that at 2x retina without shipping an oversized photo that
// Lighthouse flags as larger than its displayed dimensions.
export const AVATAR_MAX_DIMENSION = 160;
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

const encodeCanvas = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));

// Resizes and re-encodes `file` for upload. Animated GIFs are passed through
// untouched (a canvas would flatten them to a single frame). On any failure the
// original file is returned so the upload can still proceed. `maxDimension`
// caps the longest edge — pass a smaller value for avatars, which never render
// large (see AVATAR_MAX_DIMENSION). If `maxBytes` is given, quality and then
// resolution are progressively reduced until the result fits (or we run out of
// room to shrink), so oversized phone photos "just work" without the caller
// having to reject them upfront.
export async function prepareImage(
  file: File,
  maxDimension: number = MAX_DIMENSION,
  maxBytes?: number,
): Promise<PreparedImage> {
  if (file.type === "image/gif") return { blob: file, type: file.type };

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    let width = Math.round(bitmap.width * scale);
    let height = Math.round(bitmap.height * scale);

    let canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { blob: file, type: file.type };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let blob = await encodeCanvas(canvas, WEBP_QUALITY);

    if (maxBytes) {
      for (const quality of [0.6, 0.4, 0.2]) {
        if (blob && blob.size <= maxBytes) break;
        blob = await encodeCanvas(canvas, quality);
      }
      // Quality alone wasn't enough — halve the resolution (drawing from the
      // existing canvas, so no need to re-decode the source) and try again.
      while (blob && blob.size > maxBytes && Math.max(width, height) > 48) {
        width = Math.round(width / 2);
        height = Math.round(height / 2);
        const smaller = document.createElement("canvas");
        smaller.width = width;
        smaller.height = height;
        const sctx = smaller.getContext("2d");
        if (!sctx) break;
        sctx.drawImage(canvas, 0, 0, width, height);
        canvas = smaller;
        blob = await encodeCanvas(canvas, 0.6);
      }
    }

    // Fall back to the original if WebP encoding is unsupported, or if it somehow
    // came out larger than the source (e.g. an already-tiny image).
    if (!blob || blob.size >= file.size) return { blob: file, type: file.type };
    return { blob, type: "image/webp" };
  } catch {
    return { blob: file, type: file.type };
  }
}
