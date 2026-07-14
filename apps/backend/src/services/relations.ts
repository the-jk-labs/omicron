// SPDX-License-Identifier: AGPL-3.0-or-later
import * as relationsRepo from "@/db/repositories/relations.ts";
import type { RelationKind } from "@/db/repositories/relations.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import { getProfile as getRemoteActor } from "@/services/remoteProfiles.ts";
import { relationActorLocal, relationActorRemote } from "@/routes/serializers.ts";
import { badRequest, notFound } from "@/lib/http.ts";
import { queue } from "@/queue/queue.ts";

// Business logic for the personal-moderation edges (mute / block). Both kinds
// share this code; only the table differs. Targets may be a local user (by
// username) or a remote actor (by `user@host` handle).
//
// A BLOCK is the strong edge (Mastodon/Instagram semantics): placing one also
// severs the follow relationship both ways, and — for a remote target — sends
// an ActivityPub Block to the actor's instance (Undo(Block) on unblock). A MUTE
// is the soft, silent edge and touches neither follows nor federation.

export async function setLocal(
  kind: RelationKind,
  viewerId: string,
  username: string,
  on: boolean,
) {
  const target = await usersRepo.findByUsername(username);
  if (!target) throw notFound("User not found.");
  if (target.id === viewerId) throw badRequest(`You cannot ${kind} yourself.`);
  if (on) {
    await relationsRepo.addLocal(kind, viewerId, target.id);
    // Blocking severs any follow edge between the two users, both directions.
    if (kind === "block") await followsRepo.severLocal(viewerId, target.id);
  } else {
    await relationsRepo.removeLocal(kind, viewerId, target.id);
  }
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
  if (on) {
    await relationsRepo.addRemote(kind, viewerId, actor.id);
    if (kind === "block") {
      // Sever both follow directions with the remote actor, then federate the
      // Block so their instance drops the relationship on their side too.
      await followsRepo.removeRemoteFollowing(viewerId, actor.id);
      await followsRepo.removeRemoteFollower(viewerId, actor.apId);
      queue.add("send_block", { blockerId: viewerId, targetActor: actor.apId });
    }
  } else {
    await relationsRepo.removeRemote(kind, viewerId, actor.id);
    if (kind === "block") {
      queue.add("send_unblock", { blockerId: viewerId, targetActor: actor.apId });
    }
  }
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
