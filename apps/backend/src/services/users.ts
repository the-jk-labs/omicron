// SPDX-License-Identifier: AGPL-3.0-or-later
import * as usersRepo from "@/db/repositories/users.ts";
import { config } from "@/config.ts";
import { badRequest } from "@/lib/http.ts";
import type { User } from "@/db/schema.ts";

// Business logic for editing one's own profile. Routes stay HTTP-only and call
// into here; all disk + DB access is funnelled through the repository / services.

// Image types we accept for avatars, mapped to the file extension we persist.
export const AVATAR_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

// Updates the mutable profile fields. Only the keys present in `input` are
// touched, so callers can patch display name and bio independently.
export async function updateProfile(
  userId: string,
  input: { displayName?: string; bio?: string },
): Promise<User> {
  const patch: { displayName?: string; bio?: string } = {};

  if (input.displayName !== undefined) {
    const displayName = input.displayName.trim();
    if (displayName.length < 1 || displayName.length > 60) {
      throw badRequest("Display name must be 1–60 characters.");
    }
    patch.displayName = displayName;
  }

  if (input.bio !== undefined) {
    if (input.bio.length > 500) throw badRequest("Bio must be 500 characters or fewer.");
    patch.bio = input.bio.trim();
  }

  return usersRepo.update(userId, patch);
}

// Persists an uploaded avatar to local disk and stores its public URL. The URL
// is served back through `mediaRoutes` (mounted at /api/uploads).
export async function setAvatar(
  userId: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<User> {
  const ext = AVATAR_TYPES[contentType];
  if (!ext) throw badRequest("Unsupported image type. Use PNG, JPEG, WebP, or GIF.");
  if (bytes.byteLength === 0) throw badRequest("The uploaded file is empty.");
  if (bytes.byteLength > MAX_AVATAR_BYTES) throw badRequest("Image too large (max 2 MB).");

  await Deno.mkdir(config.UPLOADS_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.${ext}`;
  await Deno.writeFile(`${config.UPLOADS_DIR}/${filename}`, bytes);

  return usersRepo.update(userId, { avatarUrl: `/api/uploads/${filename}` });
}