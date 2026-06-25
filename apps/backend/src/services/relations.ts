// SPDX-License-Identifier: AGPL-3.0-or-later
import * as relationsRepo from "@/db/repositories/relations.ts";
import type { RelationKind } from "@/db/repositories/relations.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import { getProfile as getRemoteActor } from "@/services/remoteProfiles.ts";
import { relationActorLocal, relationActorRemote } from "@/routes/serializers.ts";
import { badRequest, notFound } from "@/lib/http.ts";

// Business logic for the personal-moderation edges (mute / block). Both kinds
// share this code; only the table differs. Targets may be a local user (by
// username) or a remote actor (by `user@host` handle). Blocks are local-only —
// no ActivityPub Block is federated.

export async function setLocal(
  kind: RelationKind,
  viewerId: string,
  username: string,
  on: boolean,
) {
  const target = await usersRepo.findByUsername(username);
  if (!target) throw notFound("User not found.");
  if (target.id === viewerId) throw badRequest(`You cannot ${kind} yourself.`);
  if (on) await relationsRepo.addLocal(kind, viewerId, target.id);
  else await relationsRepo.removeLocal(kind, viewerId, target.id);
}

export async function setRemote(
  kind: RelationKind,
  viewerId: string,
  handle: string,
  on: boolean,
) {
  // Resolve (and cache) the actor so we have a stable id to reference.
  const actor = on ? await getRemoteActor(handle) : await remoteActorsRepo.findByHandle(handle);
  if (!actor) throw notFound("Remote user not found.");
  if (on) await relationsRepo.addRemote(kind, viewerId, actor.id);
  else await relationsRepo.removeRemote(kind, viewerId, actor.id);
}

// ── management lists ──────────────────────────────────────────────────────
// Returns a flat, uniform list of actors (local + remote) the viewer mutes or
// blocks, newest first within each source.
export async function listRelation(kind: RelationKind, viewerId: string) {
  const [local, remote] = await Promise.all([
    relationsRepo.listLocalTargets(kind, viewerId),
    relationsRepo.listRemoteTargets(kind, viewerId),
  ]);
  return [...local.map(relationActorLocal), ...remote.map(relationActorRemote)];
}
