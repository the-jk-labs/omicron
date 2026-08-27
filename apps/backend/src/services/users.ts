import { config } from "@/config.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as linksRepo from "@/db/repositories/profileLinks.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as uploadsRepo from "@/db/repositories/uploads.ts";
// SPDX-License-Identifier: AGPL-3.0-or-later
import * as usersRepo from "@/db/repositories/users.ts";
import type { ProfileLink, User } from "@/db/schema.ts";
import { badRequest } from "@/lib/http.ts";
import { renderMarkdown } from "@/lib/markdown.ts";
import { isLinkPlatform, MAX_LINK_LABEL_LEN, MAX_PROFILE_LINKS, normalizeLinkUrl } from "@/lib/profileLinks.ts";
import { MAX_PROFILE_TAGS, normalizeTags } from "@/lib/tags.ts";
import { queue } from "@/queue/queue.ts";
import { relationActorLocal } from "@/routes/serializers.ts";
import * as followRequests from "@/services/followRequests.ts";
import { quotaError, sniffMatches, UPLOAD_TOTAL_QUOTA_BYTES, UPLOAD_USER_QUOTA_BYTES } from "@/services/media.ts";

// Business logic for editing one's own profile. Routes stay HTTP-only and call
// into here; all disk + DB access is funnelled through the repository / services.

// Upper bound on the profile's custom Markdown section. Generous enough for a
// long, richly formatted page, small enough that it can't be used as storage.
export const MAX_CUSTOM_SECTION_LEN = 20_000;

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
function sanitizeLinks(input: ProfileLinkInput[]): { platform: string; url: string; label: string }[] {
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
    customSection?: string;
    tags?: string[];
    links?: ProfileLinkInput[];
  },
): Promise<{ user: User; tags: tagsRepo.TagSummary[]; links: ProfileLink[] }> {
  const patch: {
    displayName?: string;
    bio?: string;
    publicEmail?: string;
    customSection?: string;
    customSectionHtml?: string;
  } = {};

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

  if (input.customSection !== undefined) {
    const source = input.customSection.trim();
    if (source.length > MAX_CUSTOM_SECTION_LEN) {
      throw badRequest(`Custom section must be ${MAX_CUSTOM_SECTION_LEN.toLocaleString("en-US")} characters or fewer.`);
    }
    // Render + sanitize once, here, so the reader is only ever handed HTML that
    // has already been through the allowlist (see lib/markdown.ts).
    patch.customSection = source;
    patch.customSectionHtml = renderMarkdown(source);
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
  const user =
    Object.keys(patch).length > 0 ? await usersRepo.update(userId, patch) : (await usersRepo.findById(userId))!;

  // Any of these fields (name/bio/email/tags/links) surface on the federated
  // actor, so push it to remote followers who already cached the old one. The
  // custom section is deliberately not part of the actor: it's a rich page that
  // has no ActivityPub equivalent, so it stays on the profile we serve.
  queue.add("federate_actor_update", { userId });

  return {
    user,
    tags: await tagsRepo.tagsForUser(userId),
    links: await linksRepo.listForUser(userId),
  };
}

// Flips the account between public and private. Going public auto-approves every
// pending follow request (Instagram behaviour) — sending Accepts to remote
// requesters and "accepted" notifications to local ones. The privacy change also
// flips the federated actor's `manuallyApprovesFollowers`, so push an actor
// update to instances that cached the old flag.
export async function setPrivacy(userId: string, isPrivate: boolean): Promise<User> {
  const user = await usersRepo.update(userId, { isPrivate });

  if (!isPrivate) {
    const pending = await followsRepo.pendingInboundEdges(userId);
    for (const edge of pending) {
      await followRequests.approve(userId, edge.id);
    }
  }

  queue.add("federate_actor_update", { userId });
  return user;
}

// "Who to follow" suggestions for the discovery rail. Each suggestion carries
// the actor summary (so `/@username` links + Follow work) plus a follower count
// for a little social proof.
//
// Drawn from a bounded pool of the most-followed eligible accounts (same
// indexed query as before, just a bigger LIMIT) and shuffled in memory, so
// every visitor doesn't see the identical three people. That's cheaper than
// `ORDER BY random()` in the query itself, which can't use an index and forces
// Postgres to sort the whole matching set on every request.
const SUGGESTION_POOL_SIZE = 20;

export async function suggestedFollows(viewerId: string | null, count = 3) {
  const pool = await usersRepo.suggested(viewerId, SUGGESTION_POOL_SIZE);
  const picked = sampleRandom(pool, count);
  return picked.map((r) => ({ ...relationActorLocal(r), followerCount: r.followerCount }));
}

// Partial Fisher-Yates: only shuffles the first `count` positions, so picking
// a handful out of the pool stays O(count) rather than O(pool).
function sampleRandom<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

// A user's profile links, for the public profile and the settings editor.
export function profileLinks(userId: string): Promise<ProfileLink[]> {
  return linksRepo.listForUser(userId);
}

// Persists an uploaded avatar to local disk and stores its public URL. The URL
// is served back through `mediaRoutes` (mounted at /api/uploads).
export async function setAvatar(userId: string, bytes: Uint8Array, contentType: string): Promise<User> {
  const ext = AVATAR_TYPES[contentType];
  if (!ext) throw badRequest("Unsupported image type. Use PNG, JPEG, WebP, or GIF.");
  if (bytes.byteLength === 0) throw badRequest("The uploaded file is empty.");
  if (bytes.byteLength > MAX_AVATAR_BYTES) throw badRequest("Image too large (max 2 MB).");
  // The declared content-type is untrusted; require the bytes to really be the
  // claimed raster format so an active-content payload can't hide behind an
  // image extension (see mediaService.sniffMatches).
  if (!sniffMatches(bytes, ext)) {
    throw badRequest("The file contents don't match a PNG, JPEG, WebP, or GIF image.");
  }

  // Same reserve-then-write flow as saveImage: the quota (shared with post
  // images — an avatar is storage too) is committed before the file lands, and
  // a failed disk write releases the reservation.
  const filename = `${crypto.randomUUID()}.${ext}`;
  const verdict = await uploadsRepo.createWithinQuota(
    userId,
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

  const user = await usersRepo.update(userId, { avatarUrl: `/api/uploads/${filename}` });
  queue.add("federate_actor_update", { userId });
  return user;
}

// Clears the avatar so the profile falls back to initials. The previous file
// is left on disk for the upload GC to reap once it has been unreferenced past
// the grace period (see services/uploadGc.ts); federated copies may still
// reference it in the meantime.
export async function removeAvatar(userId: string): Promise<User> {
  const user = await usersRepo.update(userId, { avatarUrl: null });
  queue.add("federate_actor_update", { userId });
  return user;
}
