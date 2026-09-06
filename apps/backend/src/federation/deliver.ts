// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from "@fedify/fedify";
import type { Actor } from "@fedify/fedify/vocab";
import { Create, Delete, isActor, PUBLIC_COLLECTION, Tombstone, Update } from "@fedify/fedify/vocab";
import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { buildPerson } from "@/federation/actor.ts";
import { buildArticle, type ArticleAudience } from "@/federation/article.ts";
import { getFederation } from "@/federation/mod.ts";
import { buildNote, commentApUri, isCommentFederable, noteContext } from "@/federation/note.ts";
import { textToNoteHtml } from "@/lib/html.ts";
import { federationOrigin } from "@/services/federationState.ts";

// Sends a Create(Note) — or an Update(Note) for an edit — of a local comment
// to everyone holding the other side of the thread: the commenter's remote
// followers, plus the post author's remote followers for a local post, or the
// remote post's own actor for a cached one (that's the inbox threading it).
// Only public-post comments federate (see isCommentFederable); replies on a
// private author's posts stay local-only. The Note id is stable, so an Update
// carries the same object id the remote instance already cached.
export async function deliverComment(commentId: string, action: "create" | "update" = "create"): Promise<void> {
  const origin = federationOrigin();
  const comment = await commentsRepo.findById(commentId);
  if (!comment || !comment.authorId) return;

  const author = await usersRepo.findById(comment.authorId);
  if (!author) return;

  const nctx = await noteContext(origin, author.username, comment.id);
  if (!nctx) return;

  const ctx = getFederation().createContext(new URL(origin), undefined);
  const recipients = await commentRecipients(ctx, author.id, nctx.postAuthorId, nctx.postApId);
  if (recipients.length === 0) return;

  const actorUri = ctx.getActorUri(author.username);
  const followersUri = ctx.getFollowersUri(author.username);
  const note = buildNote(author.username, {
    id: new URL(nctx.noteId),
    attribution: actorUri,
    contentHtml: textToNoteHtml(nctx.comment.content),
    published: nctx.comment.createdAt,
    inReplyTo: new URL(nctx.inReplyTo),
    url: new URL(`${nctx.postUrl}#comment-${nctx.comment.id}`),
    audience: { to: PUBLIC_COLLECTION, cc: followersUri },
  });

  const activity =
    action === "update"
      ? new Update({
          id: new URL(`/users/${author.username}/comments/${comment.id}/updates/${crypto.randomUUID()}`, origin),
          actor: actorUri,
          object: note,
          tos: [PUBLIC_COLLECTION],
        })
      : new Create({
          id: new URL(`/users/${author.username}/comments/${comment.id}/activity`, origin),
          actor: actorUri,
          object: note,
          tos: [PUBLIC_COLLECTION],
        });

  await ctx.sendActivity({ identifier: author.username }, recipients, activity);
}

// Sends a Delete for a local comment that has already been removed from the
// DB. Mirrors deliverPostDelete: the caller passes the former author id and
// the post id (whose row still exists), and the Tombstone id matches the Note
// id remote instances cached.
export async function deliverCommentDelete(commentId: string, authorId: string, postId: string): Promise<void> {
  const origin = federationOrigin();
  const author = await usersRepo.findById(authorId);
  if (!author) return;

  const post = await postsRepo.findById(postId);
  if (!post) return;
  if (post.post.authorId) {
    const postAuthor = await usersRepo.findById(post.post.authorId);
    if (!postAuthor || !isCommentFederable(post.post, postAuthor.isPrivate)) return;
  } else if (!isCommentFederable(post.post, false)) {
    return;
  }

  const ctx = getFederation().createContext(new URL(origin), undefined);
  const recipients = await commentRecipients(
    ctx,
    author.id,
    post.post.authorId,
    post.post.remote ? (post.post.apId ?? null) : null,
  );
  if (recipients.length === 0) return;

  const actorUri = ctx.getActorUri(author.username);
  await ctx.sendActivity(
    { identifier: author.username },
    recipients,
    new Delete({
      id: new URL(`/users/${author.username}/comments/${commentId}/delete/${crypto.randomUUID()}`, origin),
      actor: actorUri,
      object: new Tombstone({ id: new URL(commentApUri(origin, author.username, commentId)) }),
      tos: [PUBLIC_COLLECTION],
    }),
  );
}

// The inboxes an outbound comment activity goes to: the commenter's remote
// followers, plus whoever holds the other side of the thread — the post
// author's remote followers for a local post, or the remote post's own actor
// for a cached one (that's the inbox that needs to thread it under the post).
async function commentRecipients(
  ctx: Context<unknown>,
  commentAuthorId: string,
  postAuthorId: string | null,
  remotePostApId: string | null,
): Promise<Actor[]> {
  const seen = new Set<string>();
  const recipients: Actor[] = [];
  const push = (actor: Actor) => {
    if (actor.id && !seen.has(actor.id.href)) {
      seen.add(actor.id.href);
      recipients.push(actor);
    }
  };
  for (const actor of await remoteRecipients(ctx, commentAuthorId)) push(actor);
  if (postAuthorId && postAuthorId !== commentAuthorId) {
    for (const actor of await remoteRecipients(ctx, postAuthorId)) push(actor);
  } else if (remotePostApId) {
    try {
      const object = await ctx.lookupObject(remotePostApId);
      if (isActor(object)) push(object);
    } catch {
      // The post author's instance is unreachable; the followers still get it.
    }
  }
  return recipients;
}

// Resolves a local user's remote followers into deliverable actor objects,
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
export async function deliverPost(postId: string, action: "create" | "update" = "create"): Promise<void> {
  const row = await postsRepo.findById(postId);
  if (!row || row.post.remote || !row.post.authorId) return;

  const author = await usersRepo.findById(row.post.authorId);
  if (!author) return;

  const ctx = getFederation().createContext(new URL(federationOrigin()), undefined);
  const recipients = await remoteRecipients(ctx, author.id);
  if (recipients.length === 0) return;

  const tags = await tagsRepo.tagsForPost(row.post.id);
  const actorUri = ctx.getActorUri(author.username);
  const followersUri = ctx.getFollowersUri(author.username);

  // A private author's posts are followers-only: address the wrapping activity
  // (and the Article inside it) to the followers collection, not the public one,
  // so receiving instances keep them off public timelines. Public authors get
  // the normal `to: Public, cc: followers`. (Delivery already targets only
  // approved remote followers for either case.)
  const activityAudience = author.isPrivate ? followersUri : PUBLIC_COLLECTION;
  const articleAudience: ArticleAudience = author.isPrivate
    ? { to: followersUri }
    : { to: PUBLIC_COLLECTION, cc: followersUri };
  const article = buildArticle(ctx, author.username, row.post, tags, articleAudience);

  const activity =
    action === "update"
      ? // Update needs a fresh, unique activity id each time; the object id is stable.
        new Update({
          id: new URL(`/posts/${row.post.id}/updates/${crypto.randomUUID()}`, actorUri),
          actor: actorUri,
          object: article,
          tos: [activityAudience],
        })
      : new Create({
          id: new URL(`/posts/${row.post.id}/activity`, actorUri),
          actor: actorUri,
          object: article,
          tos: [activityAudience],
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

  const ctx = getFederation().createContext(new URL(federationOrigin()), undefined);
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

  const ctx = getFederation().createContext(new URL(federationOrigin()), undefined);
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
