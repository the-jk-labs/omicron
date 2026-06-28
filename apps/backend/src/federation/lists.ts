// SPDX-License-Identifier: AGPL-3.0-or-later
import { Add, isActor, OrderedCollection, PUBLIC_COLLECTION, Remove } from "@fedify/fedify/vocab";
import { getFederation } from "@/federation/mod.ts";
import { origin } from "@/config.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";

// Announces that a post was added to / removed from a *public* reading list, via
// a standard Add / Remove activity whose `target` is the list's OrderedCollection
// URI. Delivered to the list owner's remote followers; Fedify signs and retries.
//
// Private lists never federate, so this no-ops for them — the call sites also
// gate on visibility, this is just defence in depth.
export async function deliverListItem(
  listId: string,
  postId: string,
  action: "add" | "remove",
): Promise<void> {
  const list = await listsRepo.findById(listId);
  if (!list || list.visibility !== "public") return;

  const owner = await usersRepo.findById(list.userId);
  if (!owner) return;

  const followerUris = await followsRepo.remoteFollowerActors(owner.id);
  if (followerUris.length === 0) return;

  const row = await postsRepo.findById(postId);
  if (!row) return;
  // The post's canonical ActivityPub URI: local posts live under this instance's
  // /posts/{id}; remote posts keep their origin apId.
  const postUri = row.post.remote && row.post.apId
    ? new URL(row.post.apId)
    : new URL(`/posts/${row.post.id}`, origin);

  const ctx = getFederation().createContext(new URL(origin), undefined);
  const recipients = [];
  for (const uri of followerUris) {
    const actor = await ctx.lookupObject(uri);
    if (isActor(actor)) recipients.push(actor);
  }
  if (recipients.length === 0) return;

  const actorUri = ctx.getActorUri(owner.username);
  const target = ctx.getObjectUri(OrderedCollection, { identifier: owner.username, listId });
  const values = {
    id: new URL(`#lists/${listId}/${action}/${crypto.randomUUID()}`, actorUri),
    actor: actorUri,
    object: postUri,
    target,
    tos: [PUBLIC_COLLECTION],
    cc: ctx.getFollowersUri(owner.username),
  };

  await ctx.sendActivity(
    { identifier: owner.username },
    recipients,
    action === "add" ? new Add(values) : new Remove(values),
  );
}
