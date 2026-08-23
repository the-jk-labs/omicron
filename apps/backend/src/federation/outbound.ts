// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from "@fedify/fedify";
import {
  Accept,
  type Actor,
  Announce,
  Block,
  Delete,
  Follow,
  isActor,
  PUBLIC_COLLECTION,
  Reject,
  Undo,
} from "@fedify/fedify/vocab";
import { origin } from "@/config.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { getFederation } from "@/federation/mod.ts";

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

// Outbound Reject(Follow) to a remote follower's instance. Sent when a local
// user removes a remote account from their followers ("Remove follower"): we
// reconstruct the Follow(actor = the remote follower, object = our local actor)
// and wrap it in a Reject so their instance severs the follow on its side.
export async function sendRejectFollow(userId: string, targetActor: string): Promise<void> {
  const user = await usersRepo.findById(userId);
  if (!user) return;
  const ctx = getFederation().createContext(new URL(origin), undefined);
  const actor = await ctx.lookupObject(targetActor);
  if (!isActor(actor) || !actor.id) return;
  const actorUri = ctx.getActorUri(user.username);
  await ctx.sendActivity(
    { identifier: user.username },
    actor,
    new Reject({
      id: new URL(`#rejects/${crypto.randomUUID()}`, actorUri),
      actor: actorUri,
      object: new Follow({ actor: actor.id, object: actorUri }),
    }),
  );
}

// Outbound Accept(Follow) to a remote follower's instance. Sent when a private
// local user approves a pending remote follow request: we reconstruct the
// original Follow(actor = the remote follower, object = our local actor) —
// reusing the stored activity id when we have it — and wrap it in an Accept so
// their instance confirms the follow on its side.
export async function sendAcceptFollow(
  userId: string,
  targetActor: string,
  followActivityId: string | null = null,
): Promise<void> {
  const user = await usersRepo.findById(userId);
  if (!user) return;
  const ctx = getFederation().createContext(new URL(origin), undefined);
  const actor = await ctx.lookupObject(targetActor);
  if (!isActor(actor) || !actor.id) return;
  const actorUri = ctx.getActorUri(user.username);
  await ctx.sendActivity(
    { identifier: user.username },
    actor,
    new Accept({
      id: new URL(`#accepts/${crypto.randomUUID()}`, actorUri),
      actor: actorUri,
      object: new Follow({
        id: followActivityId ? new URL(followActivityId) : undefined,
        actor: actor.id,
        object: actorUri,
      }),
    }),
  );
}

// Resolves a local user's remote followers into deliverable actor objects.
// Shared by sendRecommend/sendUnrecommend, mirroring deliver.ts's
// remoteRecipients (kept separate — that one also checks the blocklist, which
// a recommend/undo-recommend doesn't need since the recipients are the
// recommender's own approved followers).
async function followerRecipients(ctx: Context<unknown>, userId: string): Promise<Actor[]> {
  const uris = await followsRepo.remoteFollowerActors(userId);
  const recipients: Actor[] = [];
  for (const uri of uris) {
    const actor = await ctx.lookupObject(uri);
    if (isActor(actor)) recipients.push(actor);
  }
  return recipients;
}

// Outbound Announce — a local user "recommending" (reposting) a post to their
// followers. The post may be local or a cached remote one; either way the
// Announce references its canonical ActivityPub URI. The activity id is
// deterministic (`#recommends/{postId}` under the recommender's actor) so
// sendUnrecommend can reconstruct it below without persisting anything extra.
export async function sendRecommend(userId: string, postId: string): Promise<void> {
  const user = await usersRepo.findById(userId);
  if (!user) return;
  const row = await postsRepo.findById(postId);
  if (!row) return;

  const ctx = getFederation().createContext(new URL(origin), undefined);
  const recipients = await followerRecipients(ctx, user.id);
  if (recipients.length === 0) return;

  const objectUri =
    row.post.remote && row.post.apId ? new URL(row.post.apId) : new URL(`/posts/${row.post.id}`, origin);
  const actorUri = ctx.getActorUri(user.username);

  await ctx.sendActivity(
    { identifier: user.username },
    recipients,
    new Announce({
      id: new URL(`#recommends/${postId}`, actorUri),
      actor: actorUri,
      object: objectUri,
      tos: [PUBLIC_COLLECTION],
      cc: ctx.getFollowersUri(user.username),
    }),
  );
}

// Outbound Undo(Announce) — sent when a local user un-recommends a post.
// Reconstructs the original Announce by its deterministic id; no lookup of the
// post is needed (or possible, if it has since been deleted).
export async function sendUnrecommend(userId: string, postId: string): Promise<void> {
  const user = await usersRepo.findById(userId);
  if (!user) return;

  const ctx = getFederation().createContext(new URL(origin), undefined);
  const recipients = await followerRecipients(ctx, user.id);
  if (recipients.length === 0) return;

  const actorUri = ctx.getActorUri(user.username);
  await ctx.sendActivity(
    { identifier: user.username },
    recipients,
    new Undo({
      id: new URL(`#undo-recommends/${postId}`, actorUri),
      actor: actorUri,
      object: new Announce({ id: new URL(`#recommends/${postId}`, actorUri), actor: actorUri }),
      tos: [PUBLIC_COLLECTION],
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
