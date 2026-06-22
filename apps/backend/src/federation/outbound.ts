// SPDX-License-Identifier: AGPL-3.0-or-later
import { Follow, isActor, Undo } from "@fedify/fedify/vocab";
import { getFederation } from "@/federation/mod.ts";
import { origin } from "@/config.ts";
import * as usersRepo from "@/db/repositories/users.ts";

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