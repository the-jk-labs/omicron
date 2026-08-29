// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  createFederation,
  exportJwk,
  type Federation,
  generateCryptoKeyPair,
  importJwk,
  InProcessMessageQueue,
  type KvStore,
  MemoryKvStore,
  type MessageQueue,
} from "@fedify/fedify";
import type { Context } from "@fedify/fedify";
import {
  Accept,
  Announce,
  Article,
  Block,
  Create,
  Delete,
  Follow,
  Hashtag,
  isActor,
  OrderedCollection,
  PUBLIC_COLLECTION,
  Undo,
  Update,
} from "@fedify/fedify/vocab";
import { RedisKvStore, RedisMessageQueue } from "@fedify/redis";
import { origin } from "@/config.ts";
import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import * as recommendationsRepo from "@/db/repositories/recommendations.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import type { Post } from "@/db/schema.ts";
import { buildPerson } from "@/federation/actor.ts";
import { articleLanguage, buildArticle, isPubliclyAddressed } from "@/federation/article.ts";
import { setupNodeInfo } from "@/federation/nodeinfo.ts";
import { cacheActor } from "@/federation/remote.ts";
import { sameOrigin } from "@/lib/domain.ts";
import { getRedis, redisEnabled, redisFactory } from "@/lib/redis.ts";
import { sanitizePostHtml } from "@/lib/sanitize.ts";
import { normalizeTags } from "@/lib/tags.ts";
import * as notifications from "@/services/notifications.ts";

// ── ActivityPub wiring (isolated) ────────────────────────────────────────
// This module is only imported when FEDERATION_ENABLED=true (see app.ts), so a
// Fedify API change can never break the standalone blog. It owns the actor,
// WebFinger, inbox/outbox and key-pair dispatchers.

// Context data passed through Fedify (none needed for now).
type ContextData = undefined;

let federation: Federation<ContextData> | null = null;

export function getFederation(): Federation<ContextData> {
  if (federation) return federation;

  const f = createFederationInstance();
  setupNodeInfo(f);
  setupActor(f);
  setupFollowers(f);
  setupLists(f);
  setupInbox(f);
  setupOutbox(f);
  federation = f;
  return f;
}

function createFederationInstance(): Federation<ContextData> {
  // Backing store selection. Without Redis we use MemoryKvStore + an in-process
  // queue — fine for a single instance, but non-durable, so undelivered
  // activities are lost on restart and state can't be shared across processes.
  // When `REDIS_URL` is set (the docker-compose default) we swap in Redis-backed
  // equivalents so outbound delivery survives restarts and multiple backends
  // share one queue. Dispatchers are untouched either way.
  //
  // The queue is what gives outbound delivery Fedify's retry/backoff (exponential,
  // up to 10 attempts over ~12h) instead of a single synchronous best-effort send,
  // and it lets inbound activities be processed with the inbox retry policy.
  //
  // Signatures: we rely on Fedify's secure defaults — every inbound activity is
  // HTTP-Signature-verified within a one-hour timestamp window. Stated here
  // explicitly (`skipSignatureVerification: false`) so the guarantee can't
  // silently drift; never flip this on in production.
  let kv: KvStore;
  let queue: MessageQueue;
  if (redisEnabled()) {
    // @fedify/redis bundles its own ioredis@5.x internally, while `getRedis()`
    // hands it our app-wide ioredis@6.x client — same wire protocol (RESP2,
    // pinned in lib/redis.ts) and API, but TypeScript sees two structurally
    // distinct `Redis` classes from the two package copies. Verified
    // functionally identical against a live Redis instance.
    kv = new RedisKvStore(getRedis()!);
    queue = new RedisMessageQueue(redisFactory());
    console.log("✔ Federation using Redis-backed KV + message queue (durable).");
  } else {
    kv = new MemoryKvStore();
    queue = new InProcessMessageQueue();
  }
  const f = createFederation<ContextData>({
    kv,
    queue,
    skipSignatureVerification: false,
    // Transient delivery failures are retried per the backoff schedule; surface
    // each attempt so operators can see a struggling peer.
    onOutboxError: (error, activity) => {
      console.error(`federation: outbound delivery error for ${activity?.id?.href ?? "<unknown>"}:`, error);
    },
  });
  // Dead-letter visibility: fired once Fedify gives up on an inbox (a permanent
  // HTTP failure, or the circuit breaker's retention expiring). This is the
  // signal that an activity was dropped for good.
  f.setOutboxPermanentFailureHandler((_ctx, { inbox, activity, statusCode, reason }) => {
    console.error(
      `federation: gave up delivering ${activity.id?.href ?? "<unknown>"} to ${inbox.href} ` +
        `(${reason}, status ${statusCode})`,
    );
  });
  return f;
}

// ── Actor + key pairs ──────────────────────────────────────────────────
function setupActor(f: Federation<ContextData>) {
  f.setActorDispatcher("/users/{identifier}", async (ctx, identifier) => {
    const user = await usersRepo.findByUsername(identifier);
    if (!user) return null;
    const keys = await ctx.getActorKeyPairs(identifier);
    const tags = await tagsRepo.tagsForUser(user.id);
    return await buildPerson(ctx, identifier, user, tags, keys);
  })
    // Generate + persist an RSA key pair on first use; reuse thereafter.
    .setKeyPairsDispatcher(async (_ctx, identifier) => {
      const user = await usersRepo.findByUsername(identifier);
      if (!user) return [];
      if (!user.actorKeyPair) {
        const { privateKey, publicKey } = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
        await usersRepo.setKeyPair(user.id, {
          privateKey: await exportJwk(privateKey),
          publicKey: await exportJwk(publicKey),
        });
        return [{ privateKey, publicKey }];
      }
      return [
        {
          privateKey: await importJwk(user.actorKeyPair.privateKey, "private"),
          publicKey: await importJwk(user.actorKeyPair.publicKey, "public"),
        },
      ];
    });
}

// ── Followers collection ─────────────────────────────────────────────────
// Required so the actor can advertise `followers` and so getFollowersUri works.
// Lists local + remote followers as recipients (used for display; delivery
// resolves inboxes separately in deliver.ts).
function setupFollowers(f: Federation<ContextData>) {
  f.setFollowersDispatcher("/users/{identifier}/followers", async (ctx, identifier) => {
    const user = await usersRepo.findByUsername(identifier);
    if (!user) return null;
    const [locals, remotes] = await Promise.all([
      followsRepo.localFollowerUsernames(user.id),
      followsRepo.remoteFollowerActors(user.id),
    ]);
    const items = [
      ...locals.map((u) => ({ id: ctx.getActorUri(u), inboxId: ctx.getInboxUri(u) })),
      ...remotes.map((uri) => ({ id: new URL(uri), inboxId: null })),
    ];
    return { items };
  });
}

// ── Reading lists: public lists as OrderedCollections ─────────────────────
// Each public list is fetchable at /users/{identifier}/lists/{listId} as an
// OrderedCollection whose items are the saved posts' ActivityPub URIs (local
// posts → this instance's /posts/{id}; remote posts → their origin apId).
// Private and Read-later-while-private lists are never served (404), so only
// public lists ever leave the instance.
function setupLists(f: Federation<ContextData>) {
  f.setObjectDispatcher(
    OrderedCollection,
    "/users/{identifier}/lists/{listId}",
    async (ctx, { identifier, listId }) => {
      const user = await usersRepo.findByUsername(identifier);
      if (!user) return null;
      const list = await listsRepo.findById(listId);
      if (!list || list.userId !== user.id || list.visibility !== "public") return null;

      const refs = await listsRepo.itemRefs(list.id);
      const items = refs.map((r) => (r.remote && r.apId ? new URL(r.apId) : new URL(`/posts/${r.id}`, origin)));
      return new OrderedCollection({
        id: ctx.getObjectUri(OrderedCollection, { identifier, listId }),
        name: list.title,
        summary: list.description || undefined,
        totalItems: items.length,
        items,
      });
    },
  );
}

// Drops inbound activities whose sender is on a defederated domain (exact host
// or subdomain). Every inbox listener bails on this before touching the DB.
async function fromBlockedDomain(actorId: URL | null | undefined): Promise<boolean> {
  if (!actorId) return false;
  try {
    return await blockedDomainsRepo.isBlocked(actorId.host);
  } catch {
    return false;
  }
}

// Ingests a remote Article, keyed by its ActivityPub id — shared by the
// inbound Create handler (a fresh post) and the inbound Announce handler (a
// remote actor boosting a post we may not have cached yet). Resolves the
// article's *attributed author*, not the wrapping activity's actor, since
// those two differ for an Announce (the booster isn't the writer). Returns the
// existing cached row without refetching anything if we already have it.
async function ingestArticle(ctx: Context<ContextData>, article: Article): Promise<Post | undefined> {
  if (!article.id) return undefined;
  const existing = await postsRepo.findByApId(article.id.href);
  if (existing) return existing;

  // Privacy/security (#123): we only persist remote posts that were addressed to
  // the ActivityStreams Public collection. A followers-only or direct-message
  // Article has no local author (author_id null) and would otherwise be treated
  // as visible to everyone on the global feed and other anonymous read paths.
  // We don't persist remote recipient ACLs, so refusing to cache anything that
  // wasn't plainly public is the safe choice.
  if (!isPubliclyAddressed(article)) return undefined;

  if (!article.attributionId) return undefined;
  const author = await ctx.lookupObject(article.attributionId);
  if (!isActor(author) || !author.id) return undefined;

  // Authority check: a post may only be attributed to an actor on the same
  // origin as the post's own id. Without this, a hostile instance can deliver an
  // Article on its own domain that claims `attributedTo` an account on another
  // server, and we would store its content under that victim's name (fediverse
  // impersonation). Fedify already refetches an embedded object from the origin
  // of its id, so this closes the remaining gap where the id and the attributed
  // actor disagree.
  if (!sameOrigin(article.id, author.id)) return undefined;

  const actor = await cacheActor(author);

  const post = await postsRepo.upsertRemotePost({
    remoteActorId: actor.id,
    apId: article.id.href,
    title: article.name?.toString() ?? null,
    // Remote HTML is untrusted and rendered with {@html} by the reader —
    // sanitize before it ever touches the database.
    contentHtml: sanitizePostHtml(article.content?.toString()),
    apType: "Article",
    language: articleLanguage(article),
    createdAt: article.published ? new Date(article.published.epochMilliseconds) : undefined,
  });

  // Mirror any Hashtag tags onto the post so it joins our tag pages/feeds.
  const tagNames: string[] = [];
  for await (const tag of article.getTags(ctx)) {
    if (tag instanceof Hashtag && tag.name) tagNames.push(tag.name.toString());
  }
  await tagsRepo.setPostTags(post.id, normalizeTags(tagNames));
  return post;
}

// ── Inbox: inbound Follow / Undo / Create / Announce ─────────────────────
function setupInbox(f: Federation<ContextData>) {
  f.setInboxListeners("/users/{identifier}/inbox", "/inbox")
    .on(Follow, async (ctx, follow) => {
      if (await fromBlockedDomain(follow.actorId)) return;
      if (!follow.objectId) return;
      const parsed = ctx.parseUri(follow.objectId);
      if (parsed?.type !== "actor") return;
      const followee = await usersRepo.findByUsername(parsed.identifier);
      const follower = await follow.getActor(ctx);
      if (!followee || !isActor(follower) || !follower.id) return;

      // If the local user has blocked this remote actor, ignore the follow —
      // a blocked account can't re-follow (Mastodon semantics).
      const cachedFollower = await remoteActorsRepo.findByApId(follower.id.href);
      if (cachedFollower && (await relationsRepo.hasRemote("block", followee.id, cachedFollower.id))) {
        return;
      }

      // Cache the actor so the notification can reference it; best-effort.
      const cachedActor = await cacheActor(follower);

      if (followee.isPrivate) {
        // Private account: hold the follow as an unapproved request (storing the
        // Follow activity id so a later approve can Accept it) and notify the
        // owner. Do NOT auto-Accept — the owner approves/rejects (see
        // services/followRequests.ts), which sends the Accept/Reject.
        await followsRepo.createRemoteFollower(followee.id, follower.id.href, false, follow.id?.href ?? null);
        await notifications.notify({
          recipientId: followee.id,
          type: "follow_request",
          remoteActorId: cachedActor.id,
        });
        return;
      }

      // Public account: accept instantly and notify the new follower.
      await followsRepo.createRemoteFollower(followee.id, follower.id.href);
      await notifications.notify({
        recipientId: followee.id,
        type: "follow",
        remoteActorId: cachedActor.id,
      });
      await ctx.sendActivity(
        { identifier: parsed.identifier },
        follower,
        new Accept({ actor: follow.objectId, object: follow }),
      );
    })
    .on(Undo, async (ctx, undo) => {
      if (await fromBlockedDomain(undo.actorId)) return;
      const object = await undo.getObject(ctx);
      if (object instanceof Follow) {
        if (!object.objectId) return;
        const parsed = ctx.parseUri(object.objectId);
        if (parsed?.type !== "actor") return;
        const followee = await usersRepo.findByUsername(parsed.identifier);
        if (followee && undo.actorId) {
          await followsRepo.removeRemoteFollower(followee.id, undo.actorId.href);
        }
        return;
      }
      if (object instanceof Announce) {
        // A remote actor un-boosted a post. `object` here is the original
        // Announce, nested inside the Undo — its own `objectId` is the boosted
        // post's URI (not the Announce's own id), which is what we keyed the
        // recommendation on.
        if (!object.objectId || !undo.actorId) return;
        const post = await postsRepo.findByApId(object.objectId.href);
        if (!post) return;
        const actor = await remoteActorsRepo.findByApId(undo.actorId.href);
        if (!actor) return;
        await recommendationsRepo.removeRemote(post.id, actor.id);
        if (post.authorId) {
          await notifications.unnotify({
            recipientId: post.authorId,
            type: "recommend",
            remoteActorId: actor.id,
            postId: post.id,
          });
        }
      }
    })
    .on(Block, async (ctx, block) => {
      if (await fromBlockedDomain(block.actorId)) return;
      // A remote actor blocked one of our local users. Our block edges are
      // always local-authored, so we don't persist the remote block, but we
      // mirror Mastodon's core effect: sever the follow relationship both ways.
      // (Undo(Block) needs no action — nothing was persisted, and a block never
      // restores a severed follow.)
      if (!block.objectId || !block.actorId) return;
      const parsed = ctx.parseUri(block.objectId);
      if (parsed?.type !== "actor") return;
      const localUser = await usersRepo.findByUsername(parsed.identifier);
      if (!localUser) return;
      await followsRepo.removeRemoteFollower(localUser.id, block.actorId.href);
      const remoteActor = await remoteActorsRepo.findByApId(block.actorId.href);
      if (remoteActor) await followsRepo.removeRemoteFollowing(localUser.id, remoteActor.id);
    })
    .on(Accept, async (ctx, accept) => {
      if (await fromBlockedDomain(accept.actorId)) return;
      // A remote actor accepted our outbound Follow. The Accept wraps the
      // original Follow(actor = our local actor, object = the remote actor);
      // mark that edge approved so the UI can reflect a confirmed follow.
      const object = await accept.getObject(ctx);
      if (!(object instanceof Follow) || !object.actorId) return;
      const parsed = ctx.parseUri(object.actorId);
      if (parsed?.type !== "actor") return;
      const follower = await usersRepo.findByUsername(parsed.identifier);
      const remoteActorUri = accept.actorId?.href;
      if (!follower || !remoteActorUri) return;
      const remoteActor = await remoteActorsRepo.findByApId(remoteActorUri);
      if (remoteActor) {
        await followsRepo.approveRemoteFollowing(follower.id, remoteActor.id);
      }
    })
    .on(Create, async (ctx, create) => {
      if (await fromBlockedDomain(create.actorId)) return;
      // Ingest a remote post. This is a long-form blogging platform, so we only
      // accept ActivityPub Articles (Omicron, WriteFreely, Ghost, Plume, …) and
      // ignore microblog Notes (Mastodon, Pixelfed, …) outright.
      const object = await create.getObject(ctx);
      if (!(object instanceof Article)) return;
      await ingestArticle(ctx, object);
    })
    .on(Announce, async (ctx, announce) => {
      if (await fromBlockedDomain(announce.actorId)) return;
      // A remote actor "boosted" a post — record it as a recommendation from
      // them, so it can surface on their local followers' "For you" feed (see
      // db/repositories/recommendations.ts). Only Articles are recognised,
      // matching the rest of this instance's long-form-only stance; a boosted
      // Note (a Mastodon retweet) is silently ignored.
      if (!announce.objectId) return;
      const recommender = await announce.getActor(ctx);
      if (!isActor(recommender) || !recommender.id) return;
      const actor = await cacheActor(recommender);

      let post = await postsRepo.findByApId(announce.objectId.href);
      if (!post) {
        const object = await announce.getObject(ctx);
        if (!(object instanceof Article)) return;
        post = await ingestArticle(ctx, object);
        if (!post) return;
      }

      await recommendationsRepo.addRemote(post.id, actor.id);
      // Notify the post's local author (if any); remote-authored posts have no
      // local recipient.
      if (post.authorId) {
        await notifications.notify({
          recipientId: post.authorId,
          type: "recommend",
          remoteActorId: actor.id,
          postId: post.id,
        });
      }
    })
    .on(Update, async (ctx, update) => {
      if (await fromBlockedDomain(update.actorId)) return;
      // A remote author edited one of their Articles. Re-sanitize and update the
      // cached copy in place. Only Articles we already cache are touched.
      const object = await update.getObject(ctx);
      if (!(object instanceof Article) || !object.id || !update.actorId) return;
      const existing = await postsRepo.findByApId(object.id.href);
      if (!existing) return;
      // Ownership: the editor must be the post's cached author, so one actor
      // can't rewrite another's content.
      const actor = await remoteActorsRepo.findByApId(update.actorId.href);
      if (!actor || actor.id !== existing.remoteActorId) return;

      await postsRepo.update(existing.id, {
        title: object.name?.toString() ?? null,
        // Remote HTML is untrusted and rendered with {@html} — sanitize on edit
        // exactly as on create.
        contentHtml: sanitizePostHtml(object.content?.toString()),
        language: articleLanguage(object),
      });

      const tagNames: string[] = [];
      for await (const tag of object.getTags(ctx)) {
        if (tag instanceof Hashtag && tag.name) tagNames.push(tag.name.toString());
      }
      await tagsRepo.setPostTags(existing.id, normalizeTags(tagNames));
    })
    .on(Delete, async (_ctx, del) => {
      if (await fromBlockedDomain(del.actorId)) return;
      const objectId = del.objectId?.href;
      if (!objectId || !del.actorId) return;

      // Delete(Actor): an account deleting itself sends its own id as the object.
      // Purge the cached actor; their posts, follow edges, etc. cascade away.
      if (objectId === del.actorId.href) {
        await remoteActorsRepo.removeByApId(objectId);
        return;
      }

      // Delete(post): drop the cached copy, but only when the deleter owns it.
      const post = await postsRepo.findByApId(objectId);
      if (!post) return;
      const actor = await remoteActorsRepo.findByApId(del.actorId.href);
      if (!actor || actor.id !== post.remoteActorId) return;
      await postsRepo.removeByApId(objectId);
    });
}

// ── Outbox: list the user's articles ──────────────────────────────────────
function setupOutbox(f: Federation<ContextData>) {
  f.setOutboxDispatcher("/users/{identifier}/outbox", async (ctx, identifier) => {
    const user = await usersRepo.findByUsername(identifier);
    if (!user) return null;
    // A private account's posts are followers-only; the public outbox must not
    // enumerate them to anyone who fetches it. Serve an empty collection.
    if (user.isPrivate) return { items: [] };
    const rows: postsRepo.PostWithAuthor[] = await postsRepo.listByAuthor(user.id, null, null, 20);
    const page = rows.slice(0, 20);
    const tagsByPost = await tagsRepo.tagsForPosts(page.map(({ post }) => post.id));
    const items = page.map(
      ({ post }) =>
        new Create({
          id: new URL(`${post.id}/activity`, ctx.getOutboxUri(identifier)),
          actor: ctx.getActorUri(identifier),
          object: buildArticle(ctx, identifier, post, tagsByPost.get(post.id) ?? []),
          tos: [PUBLIC_COLLECTION],
        }),
    );
    return { items };
  });
}
