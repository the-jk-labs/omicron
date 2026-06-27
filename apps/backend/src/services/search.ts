// SPDX-License-Identifier: AGPL-3.0-or-later
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import { normalizeTag } from "@/lib/tags.ts";
import { relationActorLocal, relationActorRemote } from "@/routes/serializers.ts";

// Site search: long-form stories (full-text), people (local accounts and
// already-cached remote actors) and tags. People search reads the local cache
// only — it never crawls the fediverse; to pull in an unseen remote profile a
// viewer opens its `@user@host` handle directly.

const MAX_POSTS = 20;
const MAX_PEOPLE = 10;
const MAX_TAGS = 10;

export async function searchPosts(viewerId: string | null, query: string) {
  return await postsRepo.searchPosts(viewerId, query, MAX_POSTS);
}

export async function searchPeople(query: string) {
  const [local, remote] = await Promise.all([
    usersRepo.search(query, MAX_PEOPLE),
    remoteActorsRepo.search(query, MAX_PEOPLE),
  ]);
  return [...local.map(relationActorLocal), ...remote.map(relationActorRemote)];
}

export function searchTags(query: string) {
  // Match against the normalized slug form so a "#fediverse" query finds the
  // "fediverse" tag; an all-punctuation query normalizes to "" → no results.
  const slug = normalizeTag(query);
  if (!slug) return Promise.resolve([]);
  return tagsRepo.search(slug, MAX_TAGS);
}
