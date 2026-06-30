// SPDX-License-Identifier: AGPL-3.0-or-later
import * as usersRepo from "@/db/repositories/users.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as linksRepo from "@/db/repositories/profileLinks.ts";
import { relationActorLocal } from "@/routes/serializers.ts";
import { config } from "@/config.ts";
import { badRequest } from "@/lib/http.ts";
import { MAX_PROFILE_TAGS, normalizeTags } from "@/lib/tags.ts";
import {
  isLinkPlatform,
  MAX_LINK_LABEL_LEN,
  MAX_PROFILE_LINKS,
  normalizeLinkUrl,
} from "@/lib/profileLinks.ts";
import type { ProfileLink, User } from "@/db/schema.ts";

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
export type ProfileLinkInput = { platform?: string; url?: string; label?: string };

// Validates and normalizes a list of profile links, throwing on bad input.
// Returns the clean rows ready to persist (order preserved from the input).
function sanitizeLinks(
  input: ProfileLinkInput[],
): { platform: string; url: string; label: string }[] {
  if (input.length > MAX_PROFILE_LINKS) {
    throw badRequest(`A profile can have at most ${MAX_PROFILE_LINKS} links.`);
  }
  return input.map((link) => {
    if (!isLinkPlatform(link.platform)) throw badRequest("Unknown link type.");
    const url = normalizeLinkUrl(link.url ?? "");
    if (!url) throw badRequest("Each link needs a valid web address.");
    const label = (link.label ?? "").trim().slice(0, MAX_LINK_LABEL_LEN);
    return { platform: link.platform, url, label };
  });
}

export async function updateProfile(
  userId: string,
  input: {
    displayName?: string;
    bio?: string;
    publicEmail?: string;
    tags?: string[];
    links?: ProfileLinkInput[];
  },
): Promise<{ user: User; tags: tagsRepo.TagSummary[]; links: ProfileLink[] }> {
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

  if (input.links !== undefined) {
    await linksRepo.replaceForUser(userId, sanitizeLinks(input.links));
  }

  // A tags/links-only update touches no user columns; drizzle rejects an empty
  // SET, so only call update when there's something to change.
  const user = Object.keys(patch).length > 0
    ? await usersRepo.update(userId, patch)
    : (await usersRepo.findById(userId))!;

  return {
    user,
    tags: await tagsRepo.tagsForUser(userId),
    links: await linksRepo.listForUser(userId),
  };
}

// "Who to follow" suggestions for the discovery rail. Each suggestion carries
// the actor summary (so `/@username` links + Follow work) plus a follower count
// for a little social proof.
export async function suggestedFollows(viewerId: string | null, limit = 5) {
  const rows = await usersRepo.suggested(viewerId, limit);
  return rows.map((r) => ({ ...relationActorLocal(r), followerCount: r.followerCount }));
}

// A user's profile links, for the public profile and the settings editor.
export function profileLinks(userId: string): Promise<ProfileLink[]> {
  return linksRepo.listForUser(userId);
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
