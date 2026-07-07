// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from "@fedify/fedify";
import type { Actor } from "@fedify/fedify/vocab";
import { Create, Delete, isActor, PUBLIC_COLLECTION, Tombstone, Update } from "@fedify/fedify/vocab";
import { getFederation } from "@/federation/mod.ts";
import { buildArticle } from "@/federation/article.ts";
import { buildPerson } from "@/federation/actor.ts";
import { origin } from "@/config.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";

// Resolves a local author's remote followers into deliverable actor objects,
// skipping any on a defederated domain (exact host or subdomain). Shared by
// every outbound post activity (Create / Update / Delete).
async function remoteRecipients(ctx: Context<unknown>, authorId: string): Promise<Actor[]> {
  const uris = await followsRepo.remoteFollowerActors(authorId);
  const recipients: Actor[] = [];
  for (const uri of uris) {
    try {
      if (await blockedDomainsRepo.isBlocked(new URL(uri).host)) continue;
    } catch {
      // Unparseable follower URI — skip it (lookup would fail anyway).
      continue;
    }
    const actor = await ctx.lookupObject(uri);
    if (isActor(actor)) recipients.push(actor);
  }
  return recipients;
}

// Sends a Create(Article) — or an Update(Article) for an edit — of a local post
// to all remote followers' inboxes. Fedify handles HTTP signatures, batching and
// delivery retries. The Article id is stable, so an Update carries the same
// object id the remote instance already cached.
export async function deliverPost(
  postId: string,
  action: "create" | "update" = "create",
): Promise<void> {
  const row = await postsRepo.findById(postId);
  if (!row || row.post.remote || !row.post.authorId) return;

  const author = await usersRepo.findById(row.post.authorId);
  if (!author) return;

  const ctx = getFederation().createContext(new URL(origin), undefined);
  const recipients = await remoteRecipients(ctx, author.id);
  if (recipients.length === 0) return;

  const tags = await tagsRepo.tagsForPost(row.post.id);
  const actorUri = ctx.getActorUri(author.username);
  const article = buildArticle(ctx, author.username, row.post, tags);

  const activity = action === "update"
    // Update needs a fresh, unique activity id each time; the object id is stable.
    ? new Update({
      id: new URL(`/posts/${row.post.id}/updates/${crypto.randomUUID()}`, actorUri),
      actor: actorUri,
      object: article,
      tos: [PUBLIC_COLLECTION],
    })
    : new Create({
      id: new URL(`/posts/${row.post.id}/activity`, actorUri),
      actor: actorUri,
      object: article,
      tos: [PUBLIC_COLLECTION],
    });

  await ctx.sendActivity({ identifier: author.username }, recipients, activity);
}

// Sends an Update(Person) of a user's own actor to all remote followers'
// inboxes, so instances that already cached the actor (from a prior fetch or
// follow) refresh their copy. Without this, a display name/bio/avatar edit
// only ever changes what our own server returns — remote instances keep
// showing whatever they fetched the first time until they happen to refetch.
export async function deliverActorUpdate(userId: string): Promise<void> {
  const user = await usersRepo.findById(userId);
  if (!user) return;

  const ctx = getFederation().createContext(new URL(origin), undefined);
  const recipients = await remoteRecipients(ctx, user.id);
  if (recipients.length === 0) return;

  const keys = await ctx.getActorKeyPairs(user.username);
  const tags = await tagsRepo.tagsForUser(user.id);
  const actorUri = ctx.getActorUri(user.username);
  const person = await buildPerson(ctx, user.username, user, tags, keys);

  await ctx.sendActivity(
    { identifier: user.username },
    recipients,
    new Update({
      id: new URL(`/updates/${crypto.randomUUID()}`, actorUri),
      actor: actorUri,
      object: person,
      tos: [PUBLIC_COLLECTION],
    }),
  );
}

// Sends a Delete for a local post that has already been removed from the DB.
// The row is gone, so the caller passes the (former) author id and post id;
// the remote follower edges live on the author and survive the post deletion.
// The Tombstone id matches the Article id remote instances cached, so their
// inbound Delete handler can drop the right copy.
export async function deliverPostDelete(postId: string, authorId: string): Promise<void> {
  const author = await usersRepo.findById(authorId);
  if (!author) return;

  const ctx = getFederation().createContext(new URL(origin), undefined);
  const recipients = await remoteRecipients(ctx, author.id);
  if (recipients.length === 0) return;

  const actorUri = ctx.getActorUri(author.username);
  await ctx.sendActivity(
    { identifier: author.username },
    recipients,
    new Delete({
      id: new URL(`/posts/${postId}/delete/${crypto.randomUUID()}`, actorUri),
      actor: actorUri,
      object: new Tombstone({ id: new URL(`/posts/${postId}`, actorUri) }),
      tos: [PUBLIC_COLLECTION],
    }),
  );
}
