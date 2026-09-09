// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { notFound } from "@/lib/http.ts";
import { renderProfileCard } from "@/lib/profileCard.ts";
import { hashToken } from "@/lib/tokens.ts";
import { getAppDomain } from "@/services/instanceSetup.ts";

// On-disk caching for generated profile share cards. The drawing itself is in
// lib/profileCard.ts, which explains why a card exists at all.
//
// Same shape as services/ogCard.ts, and for the same reason: a card is only
// ever fetched by a link-preview scraper, once per profile per platform, so one
// render amortised over the life of the profile is the whole cost.

const AVATAR_PATH = /^\/api\/uploads\/([A-Za-z0-9-]+\.(?:png|jpe?g|webp|gif))$/;

/**
 * Where a card is cached.
 *
 * The hash is of everything drawn, so a renamed author, an edited bio or a
 * swapped avatar writes a new file rather than serving a stale one. The
 * superseded file is left behind — a few tens of kilobytes per edit, against
 * the alternative of tracking which cards belong to which profile.
 */
function cachePath(username: string, digest: string): string {
  return `${config.UPLOADS_DIR}/og-profiles/${username}-${digest.slice(0, 16)}.jpg`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The share card for a local profile, generated on first request and cached.
 *
 * Throws 404 when no such user exists (or the account is suspended), so a
 * card is no more reachable than the profile. Returns null when no card can
 * be drawn — a display name in a script the bundled face has no glyphs for —
 * and the caller falls back to the instance's brand image.
 *
 * Private accounts still get a card: the header (name, bio, counts) renders
 * for strangers deciding whether to request a follow, and the card draws only
 * that same public header — never posts.
 */
export async function profileCard(username: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const user = await usersRepo.findByUsername(username);
  if (!user || user.suspendedAt) throw notFound("User not found.");

  const [counts, postCounts, site] = await Promise.all([
    followsRepo.counts(user.id),
    postsRepo.countsByAuthor(user.id),
    getAppDomain(),
  ]);

  const text = {
    displayName: user.displayName,
    handle: `@${user.username}`,
    bio: user.bio ?? "",
    stats: `${plural(postCounts.published, "article", "articles")} · ${plural(counts.followers, "follower", "followers")}`,
    site,
  };

  // A locally stored avatar is read off disk; anything else (no avatar, or a
  // value that is not one of our upload paths) falls back to initials.
  let avatar: Uint8Array<ArrayBuffer> | null = null;
  const avatarFile = user.avatarUrl ? AVATAR_PATH.exec(user.avatarUrl)?.[1] : undefined;
  if (avatarFile) {
    try {
      avatar = await Deno.readFile(`${config.UPLOADS_DIR}/${avatarFile}`);
    } catch {
      avatar = null;
    }
  }

  const digest = await hashToken(
    `${text.displayName}\n${text.handle}\n${text.bio}\n${text.stats}\n${text.site}\n${avatar ? await sha256Hex(avatar) : "-"}`,
  );
  const cached = cachePath(user.username, digest);
  try {
    return await Deno.readFile(cached);
  } catch {
    // Not built yet.
  }

  const jpeg = await renderProfileCard(text, avatar);
  if (!jpeg) return null;

  await Deno.mkdir(`${config.UPLOADS_DIR}/og-profiles`, { recursive: true });
  // Written to a temporary file and renamed into place, so two scrapers
  // arriving together can never serve each other a half-written image.
  const tmp = `${cached}.${crypto.randomUUID()}.tmp`;
  try {
    await Deno.writeFile(tmp, jpeg);
    await Deno.rename(tmp, cached);
  } catch {
    // A failed cache write costs a re-render next time; it must not cost the
    // caller their card.
    await Deno.remove(tmp).catch(() => {});
  }
  return jpeg;
}
