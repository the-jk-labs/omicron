// SPDX-License-Identifier: AGPL-3.0-or-later
import * as usersRepo from "@/db/repositories/users.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import { config } from "@/config.ts";
import { badRequest } from "@/lib/http.ts";
import { MAX_PROFILE_TAGS, normalizeTags } from "@/lib/tags.ts";
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
// touched, so callers can patch display name, bio and profile tags
// independently. Returns the updated user plus their current profile tags.
export async function updateProfile(
  userId: string,
  input: { displayName?: string; bio?: string; publicEmail?: string; tags?: string[] },
): Promise<{ user: User; tags: tagsRepo.TagSummary[] }> {
  const patch: { displayName?: string; bio?: string; publicEmail?: string } = {};

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

  if (input.publicEmail !== undefined) {
    // Optional; an empty value clears it. When set, require a plausible address.
    const publicEmail = input.publicEmail.trim();
    if (publicEmail) {
      if (publicEmail.length > 254) throw badRequest("Email must be 254 characters or fewer.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicEmail)) {
        throw badRequest("Enter a valid email address.");
      }
    }
    patch.publicEmail = publicEmail;
  }

  if (input.tags !== undefined) {
    const slugs = normalizeTags(input.tags);
    if (slugs.length > MAX_PROFILE_TAGS) {
      throw badRequest(`A profile can have at most ${MAX_PROFILE_TAGS} tags.`);
    }
    await tagsRepo.setUserTags(userId, slugs);
  }

  // A tags-only update touches no user columns; drizzle rejects an empty SET, so
  // only call update when there's something to change.
  const user = Object.keys(patch).length > 0
    ? await usersRepo.update(userId, patch)
    : (await usersRepo.findById(userId))!;

  return { user, tags: await tagsRepo.tagsForUser(userId) };
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

// Clears the avatar so the profile falls back to initials. The previous file is
// left on disk (it may still be referenced by federated copies), matching how
// `setAvatar` doesn't prune the prior image.
export function removeAvatar(userId: string): Promise<User> {
  return usersRepo.update(userId, { avatarUrl: null });
}
