// SPDX-License-Identifier: AGPL-3.0-or-later
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import { pageOf } from "@/services/posts.ts";
import { type Cursor, DEFAULT_PAGE_SIZE } from "@/lib/pagination.ts";
import { badRequest, notFound } from "@/lib/http.ts";
import { normalizeTag } from "@/lib/tags.ts";

// Business logic for tags: browsing a tag's posts, following, search, trending.

const MAX_RESULTS = 20;

// Tag meta for a tag page: the tag plus its post/follower counts and whether
// the viewer follows it. 404s on an unknown or empty slug.
export async function getTag(rawSlug: string, viewerId: string | null) {
  const slug = normalizeTag(rawSlug);
  if (!slug) throw notFound("Tag not found.");
  const tag = await tagsRepo.findBySlug(slug);
  if (!tag) throw notFound("Tag not found.");
  const [postCount, followerCount, isFollowing] = await Promise.all([
    tagsRepo.postCount(tag.id, viewerId),
    tagsRepo.followerCount(tag.id),
    viewerId ? tagsRepo.isFollowing(viewerId, tag.id) : Promise.resolve(false),
  ]);
  return {
    tag: { slug: tag.slug, name: tag.name },
    postCount,
    followerCount,
    isFollowing,
  };
}

export async function tagPosts(rawSlug: string, cursor: Cursor | null, viewerId: string | null) {
  const slug = normalizeTag(rawSlug);
  if (!slug) return { items: [], nextCursor: null };
  const tag = await tagsRepo.findBySlug(slug);
  const canonical = tag?.slug ?? slug;
  const rows = await postsRepo.listByTag(canonical, viewerId, cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}

// Resolves a slug to its tag id, creating nothing — you can only follow a tag
// that already exists (i.e. has been used on at least one post).
async function requireTag(rawSlug: string) {
  const slug = normalizeTag(rawSlug);
  if (!slug) throw badRequest("Invalid tag.");
  const tag = await tagsRepo.findBySlug(slug);
  if (!tag) throw notFound("Tag not found.");
  return tag;
}

export async function follow(userId: string, rawSlug: string) {
  const tag = await requireTag(rawSlug);
  await tagsRepo.follow(userId, tag.id);
}

export async function unfollow(userId: string, rawSlug: string) {
  const tag = await requireTag(rawSlug);
  await tagsRepo.unfollow(userId, tag.id);
}

export function search(query: string) {
  const slug = normalizeTag(query);
  if (!slug) return Promise.resolve([]);
  return tagsRepo.search(slug, MAX_RESULTS);
}

export function suggest(query: string) {
  const slug = normalizeTag(query);
  if (!slug) return Promise.resolve([]);
  return tagsRepo.suggest(slug, MAX_RESULTS);
}

export function trending() {
  return tagsRepo.trending(MAX_RESULTS);
}

export function followed(userId: string) {
  return tagsRepo.listFollowedByUser(userId);
}

export async function createAlias(aliasRaw: string, targetRaw: string) {
  const alias = normalizeTag(aliasRaw);
  const target = normalizeTag(targetRaw);
  if (!alias || !target) throw badRequest("Invalid tag.");
  if (alias === target) throw badRequest("Alias and target are the same.");
  try {
    await tagsRepo.createAlias(alias, target);
  } catch (e) {
    throw badRequest(e instanceof Error ? e.message : "Could not create alias.");
  }
}

export async function merge(fromRaw: string, toRaw: string) {
  const from = normalizeTag(fromRaw);
  const to = normalizeTag(toRaw);
  if (!from || !to) throw badRequest("Invalid tag.");
  if (from === to) throw badRequest("Source and target are the same.");
  try {
    await tagsRepo.mergeTags(from, to);
  } catch (e) {
    throw badRequest(e instanceof Error ? e.message : "Could not merge tags.");
  }
}

export function listAliases() {
  return tagsRepo.listAliases();
}
