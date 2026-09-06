// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from "@fedify/fedify";
import { isActor, Note } from "@fedify/fedify/vocab";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import type { PostWithAuthor } from "@/db/repositories/posts.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import type { Comment, Post } from "@/db/schema.ts";
import { isPubliclyAddressed } from "@/federation/article.ts";
import { cacheActor } from "@/federation/remote.ts";
import { sameOrigin } from "@/lib/domain.ts";
import { htmlToText } from "@/lib/html.ts";
import { federationOrigin } from "@/services/federationState.ts";
import * as notifications from "@/services/notifications.ts";

// Federated replies: local Responses ↔ ActivityPub Notes.
//
// A local comment federates out as a Note whose `inReplyTo` is the post's
// ActivityPub URI (or the parent comment's Note URI for a reply), and a remote
// Note with such an `inReplyTo` ingests back into the same `comments` table —
// so a Mastodon reply shows under Responses, and a local reply shows in the
// Mastodon thread. Bodies are plain text on both sides of the boundary:
// inbound HTML is flattened with `htmlToText`, outbound text is wrapped with
// `textToNoteHtml`, which is what keeps the client's escaped rendering safe
// for remote content too.

// Inbound bodies are capped like local ones (see services/comments.ts
// MAX_LENGTH) — the column itself is unbounded, so without a cap one hostile
// instance could stuff megabytes into a Responses thread.
const MAX_REMOTE_LENGTH = 2000;

// A comment federates — in either direction — only on a published post whose
// audience is fully public: a cached remote post (only public ones are ever
// cached, see federation/mod.ts) or a local post by a non-private author.
// Replies on a private author's posts stay local-only: the Replies collection
// below is served to the whole internet, so it must never name them, and the
// same line is drawn for what we accept and what we send.
export function isCommentFederable(post: Pick<Post, "status" | "remote">, authorIsPrivate: boolean): boolean {
  if (post.status !== "published") return false;
  if (post.remote) return true;
  return !authorIsPrivate;
}

// Extracts a Note's body as plain text: Mastodon wraps it in `<p>`, encodes
// entities, and prefixes a mention (`<span class="h-card">…</span>`) that
// flattens into an inert `@user` string. Empty when the Note carries nothing
// renderable (e.g. an attachment-only post) — the caller drops those.
export function noteText(note: Note): string {
  return htmlToText(note.content?.toString() ?? "")
    .slice(0, MAX_REMOTE_LENGTH)
    .trim();
}

// The ActivityPub URI of a local comment, derived deterministically from its
// author and id so the dispatcher, delivery, and inbox routing all agree
// without a lookup. Scoped under the author's actor path (Mastodon's
// `/users/{name}/statuses/{id}` shape), which keeps it inside the already
// reverse-proxied `/users/*` federation prefix — no Caddy change needed.
export function commentApUri(origin: string, identifier: string, commentId: string): string {
  return `${origin}/users/${identifier}/comments/${commentId}`;
}

// Parses our own comment URI back into `{ identifier, commentId }` — the
// fallback that resolves an `inReplyTo` pointing at a local comment we never
// federated (no `apId` minted yet). Pure and unit-tested; the DB lookup that
// follows confirms the row actually exists and is local.
export function parseLocalCommentRef(href: string): { identifier: string; commentId: string } | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const match = /^\/users\/([^/]+)\/comments\/([^/]+)$/.exec(url.pathname);
  if (!match) return null;
  return { identifier: match[1], commentId: match[2] };
}

// Parses our own post URI back into its id. Local posts carry no stored `apId`
// (their federated address is derived — see postApUri), so without this an
// `inReplyTo` naming our `/posts/{id}` address would never resolve. Pure and
// unit-tested; the DB lookup that follows confirms the row exists.
export function parseLocalPostRef(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const match = /^\/posts\/([^/]+)$/.exec(url.pathname);
  return match ? match[1] : null;
}

// Finds a post by ActivityPub URI: exact `apId` match first (cached remote
// posts), then our own derived `/posts/{id}` address (local posts). Always
// returns the joined read shape, so callers get author visibility either way.
export async function findPostByApUri(href: string): Promise<PostWithAuthor | null> {
  const byApId = await postsRepo.findByApId(href);
  if (byApId) return postsRepo.findById(byApId.id);
  const postId = parseLocalPostRef(href);
  if (!postId) return null;
  if (new URL(href).origin !== federationOrigin()) return null;
  return postsRepo.findById(postId);
}

// The canonical ActivityPub URI of a post: a cached remote post's own id, or
// the local `/posts/{id}` address remote instances already know from Articles.
export function postApUri(origin: string, post: Pick<Post, "id" | "remote" | "apId">): string {
  if (post.remote && post.apId) return post.apId;
  return `${origin}/posts/${post.id}`;
}

export type NoteAudience = {
  to: URL;
  cc?: URL;
};

// Builds the ActivityPub Note for a comment: stable id, attribution to whoever
// wrote it (a local actor URI, or the remote actor's own id when re-serving an
// ingested reply in the Replies collection), HTML body, and the `inReplyTo`
// (`replyTarget`) that threads it under the post or parent comment.
export function buildNote(
  identifier: string,
  opts: {
    id: URL;
    attribution: URL;
    contentHtml: string;
    published?: Date;
    inReplyTo: URL;
    url: URL;
    audience: NoteAudience;
  },
): Note {
  return new Note({
    id: opts.id,
    attribution: opts.attribution,
    content: opts.contentHtml,
    published: opts.published ? Temporal.Instant.from(opts.published.toISOString()) : undefined,
    replyTarget: opts.inReplyTo,
    url: opts.url,
    to: opts.audience.to,
    cc: opts.audience.cc,
  });
}

// Loads everything the Note dispatcher and outbound delivery need for one
// local comment: the comment, its post, the audience, and the resolved
// `inReplyTo` URI (parent comment's Note URI, else the post's URI). Mints the
// comment's `apId` on first use so the id is stable across edits and deletes.
// Null when the comment isn't local, its post is gone, or either side opted
// out of federation (private author, unpublished post).
export async function noteContext(
  origin: string,
  identifier: string,
  commentId: string,
): Promise<{
  comment: Comment;
  noteId: string;
  inReplyTo: string;
  postUrl: string;
  postAuthorId: string | null;
  postApId: string | null;
} | null> {
  const comment = await commentsRepo.findById(commentId);
  if (!comment || !comment.authorId) return null;

  const author = await usersRepo.findById(comment.authorId);
  if (!author || author.username !== identifier) return null;

  const post = await postsRepo.findById(comment.postId);
  if (!post) return null;
  if (post.post.authorId) {
    const postAuthor = await usersRepo.findById(post.post.authorId);
    if (!postAuthor || !isCommentFederable(post.post, postAuthor.isPrivate)) return null;
  } else if (!isCommentFederable(post.post, false)) {
    return null;
  }

  const noteId = comment.apId ?? commentApUri(origin, identifier, comment.id);
  if (!comment.apId) await commentsRepo.setApId(comment.id, noteId);

  let inReplyTo: string;
  if (comment.parentId) {
    const parent = await commentsRepo.findById(comment.parentId);
    if (!parent) return null;
    inReplyTo =
      parent.apId ??
      (parent.authorId
        ? await (async () => {
            const parentAuthor = await usersRepo.findById(parent.authorId!);
            return parentAuthor ? commentApUri(origin, parentAuthor.username, parent.id) : postApUri(origin, post.post);
          })()
        : postApUri(origin, post.post));
  } else {
    inReplyTo = postApUri(origin, post.post);
  }

  return {
    comment,
    noteId,
    inReplyTo,
    postUrl: postApUri(origin, post.post),
    postAuthorId: post.post.authorId,
    postApId: post.post.remote ? (post.post.apId ?? null) : null,
  };
}

// Ingests a remote Note as a response on the post (or comment) its `inReplyTo`
// names — shared by the inbox Create handler. Mirrors `ingestArticle`'s
// guards: dedupe by ActivityPub id, public addressing only (#123), and the
// same-origin authority check, plus the reply-target resolution Articles never
// needed. Returns the stored comment, or undefined when the Note isn't a reply
// to anything local (ordinary microblog traffic we don't cache).
export async function ingestNote(ctx: Context<unknown>, note: Note): Promise<Comment | undefined> {
  if (!note.id) return undefined;
  const apId = note.id.href;

  const existing = await commentsRepo.findByApId(apId);
  if (existing) return existing;

  // Privacy/security (#123), same as Articles: a followers-only or direct
  // Note must not be persisted and surfaced on public read paths.
  if (!isPubliclyAddressed(note)) return undefined;

  if (!note.attributionId) return undefined;
  const author = await ctx.lookupObject(note.attributionId);
  if (!isActor(author) || !author.id) return undefined;

  // Authority check, same as Articles: the Note id and its attributed actor
  // must share an origin, or any instance could post under anyone's name.
  if (!sameOrigin(note.id, author.id)) return undefined;

  // Our own Notes never arrive inbound — we author those. Without this, a
  // relayed echo of our own federated response would be cached as a "remote"
  // duplicate of itself.
  if (new URL(author.id.href).origin === federationOrigin()) return undefined;

  // Resolve the reply target: every `inReplyTo` is tried in order, first a
  // post (cached remote by `apId`, local by its derived `/posts/{id}`
  // address), then a known comment (whose post we adopt). Anything else — a
  // Note replying into a thread we never saw — is ordinary microblog traffic,
  // not a response to us.
  let post: PostWithAuthor | null = null;
  let parentId: string | null = null;
  for (const target of note.replyTargetIds) {
    const candidate = await findPostByApUri(target.href);
    if (candidate) {
      post = candidate;
      break;
    }
    const parent = await findCommentByApUri(target.href);
    if (parent) {
      const parentPost = await postsRepo.findById(parent.postId);
      if (!parentPost) continue;
      post = parentPost;
      // Replies flatten to one level, same as local ones (see
      // services/comments.ts): replying to a reply attaches to its top-level
      // parent.
      parentId = parent.parentId ?? parent.id;
      break;
    }
  }
  if (!post) return undefined;
  const postId = post.post.id;
  if (post.post.authorId) {
    const postAuthor = await usersRepo.findById(post.post.authorId);
    if (!postAuthor || !isCommentFederable(post.post, postAuthor.isPrivate)) return undefined;
  } else if (!isCommentFederable(post.post, false)) {
    return undefined;
  }

  const actor = await cacheActor(author);

  // A local author who blocked this remote actor doesn't get their replies —
  // the same rule that keeps a blocked follower out (see mod.ts Follow).
  if (post.post.authorId && (await relationsRepo.hasRemote("block", post.post.authorId, actor.id))) {
    return undefined;
  }

  const content = noteText(note);
  if (!content) return undefined;

  const comment = await commentsRepo.createRemote({
    postId,
    remoteActorId: actor.id,
    parentId,
    content,
    apId,
    createdAt: note.published ? new Date(note.published.epochMilliseconds) : undefined,
  });
  if (!comment) return undefined;

  // Notify like a local reply would: the post's local author always hears
  // about a new response; a reply additionally pings the local author of the
  // comment it answers (a remote parent has no local recipient to ping).
  if (post.post.authorId) {
    await notifications.notify({
      recipientId: post.post.authorId,
      type: "comment",
      remoteActorId: actor.id,
      postId,
      commentId: comment.id,
    });
  }
  if (parentId) {
    const parent = await commentsRepo.findById(parentId);
    if (parent?.authorId && parent.authorId !== post.post.authorId) {
      await notifications.notify({
        recipientId: parent.authorId,
        type: "reply",
        remoteActorId: actor.id,
        postId,
        commentId: comment.id,
      });
    }
  }

  return comment;
}

// A remote author edited their Note: re-flatten and update the cached copy in
// place. Only comments we actually hold are touched, and only by the actor who
// wrote them.
export async function ingestNoteUpdate(ctx: Context<unknown>, note: Note): Promise<void> {
  if (!note.id || !note.attributionId) return;
  const existing = await commentsRepo.findByApId(note.id.href);
  if (!existing || !existing.remoteActorId) return;

  const updater = await ctx.lookupObject(note.attributionId);
  if (!isActor(updater) || !updater.id) return;
  const actor = await remoteActorsRepo.findByApId(updater.id.href);
  if (!actor || actor.id !== existing.remoteActorId) return;

  const content = noteText(note);
  if (!content) return;
  await commentsRepo.update(existing.id, content);
}

// A remote author deleted their Note: drop the cached copy, but only when the
// deleter owns it. The mirrored notification is left in place — it still
// describes something that happened, and its comment link simply 404s.
export async function ingestNoteDelete(objectHref: string, actorHref: string): Promise<void> {
  const existing = await commentsRepo.findByApId(objectHref);
  if (!existing || !existing.remoteActorId) return;
  const actor = await remoteActorsRepo.findByApId(actorHref);
  if (!actor || actor.id !== existing.remoteActorId) return;
  await commentsRepo.remove(existing.id);
}

// Finds a comment by ActivityPub URI: exact `apId` match first (remote Notes
// and minted local ones), then our own never-federated comment path. The
// path-derived row still goes through the caller's ownership checks, so a
// hostile instance can't hijack a local id by minting a colliding URI —
// colliding with a *remote* row is impossible (exact match wins) and with a
// local row fails the author check in Update/Delete.
export async function findCommentByApUri(href: string): Promise<Comment | null> {
  const byApId = await commentsRepo.findByApId(href);
  if (byApId) return byApId;
  const ref = parseLocalCommentRef(href);
  if (!ref) return null;
  if (new URL(href).origin !== federationOrigin()) return null;
  return commentsRepo.findById(ref.commentId);
}
