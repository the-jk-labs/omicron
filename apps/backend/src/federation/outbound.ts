// SPDX-License-Identifier: AGPL-3.0-or-later
import { Block, Delete, Follow, isActor, PUBLIC_COLLECTION, Undo } from "@fedify/fedify/vocab";
import { getFederation } from "@/federation/mod.ts";
import { origin } from "@/config.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as followsRepo from "@/db/repositories/follows.ts";

// Outbound Follow / Undo(Follow) to a remote actor URI. Wired for future use
// when the UI lets users follow remote handles; the call site already enqueues
// `send_follow` jobs (see queue handlers).

export async function sendFollow(followerId: string, targetActor: string): Promise<void> {
  const user = await usersRepo.findById(followerId);
  if (!user) return;
  const ctx = getFederation().createContext(new URL(origin), undefined);
  const actor = await ctx.lookupObject(targetActor);
  if (!isActor(actor)) return;
  await ctx.sendActivity(
    { identifier: user.username },
    actor,
    new Follow({
      id: new URL(`#follows/${crypto.randomUUID()}`, ctx.getActorUri(user.username)),
      actor: ctx.getActorUri(user.username),
      object: actor.id,
    }),
  );
}

export async function sendUnfollow(followerId: string, targetActor: string): Promise<void> {
  const user = await usersRepo.findById(followerId);
  if (!user) return;
  const ctx = getFederation().createContext(new URL(origin), undefined);
  const actor = await ctx.lookupObject(targetActor);
  if (!isActor(actor)) return;
  await ctx.sendActivity(
    { identifier: user.username },
    actor,
    new Undo({
      id: new URL(`#unfollows/${crypto.randomUUID()}`, ctx.getActorUri(user.username)),
      actor: ctx.getActorUri(user.username),
      object: new Follow({ actor: ctx.getActorUri(user.username), object: actor.id }),
    }),
  );
}

// Outbound Block / Undo(Block) to a remote actor URI. Sent when a local user
// blocks (or unblocks) a remote account, so the actor's instance severs the
// relationship on its side too — the Mastodon convention.

export async function sendBlock(blockerId: string, targetActor: string): Promise<void> {
  const user = await usersRepo.findById(blockerId);
  if (!user) return;
  const ctx = getFederation().createContext(new URL(origin), undefined);
  const actor = await ctx.lookupObject(targetActor);
  if (!isActor(actor)) return;
  await ctx.sendActivity(
    { identifier: user.username },
    actor,
    new Block({
      id: new URL(`#blocks/${crypto.randomUUID()}`, ctx.getActorUri(user.username)),
      actor: ctx.getActorUri(user.username),
      object: actor.id,
    }),
  );
}

export async function sendUndoBlock(blockerId: string, targetActor: string): Promise<void> {
  const user = await usersRepo.findById(blockerId);
  if (!user) return;
  const ctx = getFederation().createContext(new URL(origin), undefined);
  const actor = await ctx.lookupObject(targetActor);
  if (!isActor(actor)) return;
  await ctx.sendActivity(
    { identifier: user.username },
    actor,
    new Undo({
      id: new URL(`#unblocks/${crypto.randomUUID()}`, ctx.getActorUri(user.username)),
      actor: ctx.getActorUri(user.username),
      object: new Block({ actor: ctx.getActorUri(user.username), object: actor.id }),
    }),
  );
}

// Broadcasts Delete(actor) to the user's remote followers so other instances
// tombstone the account. Must run while the user (and their signing key) still
// exists in the DB; the caller deletes the row afterwards.
export async function sendActorDelete(userId: string): Promise<void> {
  const user = await usersRepo.findById(userId);
  if (!user) return;

  const followerUris = await followsRepo.remoteFollowerActors(user.id);
  if (followerUris.length === 0) return;

  const ctx = getFederation().createContext(new URL(origin), undefined);
  const recipients = [];
  for (const uri of followerUris) {
    const actor = await ctx.lookupObject(uri);
    if (isActor(actor)) recipients.push(actor);
  }
  if (recipients.length === 0) return;

  const actorUri = ctx.getActorUri(user.username);
  await ctx.sendActivity(
    { identifier: user.username },
    recipients,
    new Delete({
      id: new URL(`#delete/${crypto.randomUUID()}`, actorUri),
      actor: actorUri,
      object: actorUri,
      tos: [PUBLIC_COLLECTION],
    }),
  );
}
