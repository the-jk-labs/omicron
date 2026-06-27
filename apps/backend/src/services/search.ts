// SPDX-License-Identifier: AGPL-3.0-or-later
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import { relationActorLocal, relationActorRemote } from "@/routes/serializers.ts";

// Site search: long-form stories (full-text) plus people (local accounts and
// already-cached remote actors). People search reads the local cache only — it
// never crawls the fediverse; to pull in an unseen remote profile a viewer
// opens its `@user@host` handle directly.

const MAX_POSTS = 20;
const MAX_PEOPLE = 10;

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
