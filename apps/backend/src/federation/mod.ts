// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  createFederation,
  exportJwk,
  type Federation,
  generateCryptoKeyPair,
  importJwk,
  MemoryKvStore,
} from "@fedify/fedify";
import {
  Accept,
  Article,
  Create,
  Endpoints,
  Follow,
  Hashtag,
  isActor,
  OrderedCollection,
  Person,
  PropertyValue,
  PUBLIC_COLLECTION,
  Undo,
} from "@fedify/fedify/vocab";
import * as usersRepo from "@/db/repositories/users.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import * as linksRepo from "@/db/repositories/profileLinks.ts";
import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import { buildArticle } from "@/federation/article.ts";
import { cacheActor } from "@/federation/remote.ts";
import { origin } from "@/config.ts";
import { normalizeTags } from "@/lib/tags.ts";
import { escapeHtml } from "@/lib/html.ts";
import { sanitizePostHtml } from "@/lib/sanitize.ts";
import { linkDisplayText, linkLabel } from "@/lib/profileLinks.ts";

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
  setupActor(f);
  setupFollowers(f);
  setupLists(f);
  setupInbox(f);
  setupOutbox(f);
  federation = f;
  return f;
}

function createFederationInstance(): Federation<ContextData> {
  // MemoryKvStore + the built-in delivery queue are fine for a single instance.
  // Both are swappable (e.g. a Postgres/Redis KV) without touching dispatchers.
  return createFederation<ContextData>({ kv: new MemoryKvStore() });
}

// ── Actor + key pairs ──────────────────────────────────────────────────
function setupActor(f: Federation<ContextData>) {
  f.setActorDispatcher("/users/{identifier}", async (ctx, identifier) => {
    const user = await usersRepo.findByUsername(identifier);
    if (!user) return null;
    const keys = await ctx.getActorKeyPairs(identifier);
    const tags = await tagsRepo.tagsForUser(user.id);
    // Advertise the user's public reading lists as supplementary collections
    // (`streams`), so federated clients can discover and fetch them.
    const publicLists = await listsRepo.listForUser(user.id, true);
    // Profile metadata fields, rendered by Mastodon et al. as the actor's
    // PropertyValue table. Each link's value carries `rel="me"` so that, when
    // the linked site links back the same way, Mastodon shows the green ✓
    // verified badge. An optional public email is exposed as a plain field.
    const links = await linksRepo.listForUser(user.id);
    const attachments = [
      ...(user.publicEmail
        ? [new PropertyValue({ name: "Email", value: escapeHtml(user.publicEmail) })]
        : []),
      ...links.map((l) => {
        // Custom links use the user's own label as the field name; known
        // platforms use their canonical label ("GitHub", "Mastodon", …).
        const name = l.platform === "custom" ? (l.label || "Link") : linkLabel(l.platform);
        return new PropertyValue({
          name,
          value:
            `<a href="${escapeHtml(l.url)}" target="_blank" rel="nofollow noopener noreferrer me" translate="no">${
              escapeHtml(linkDisplayText(l.url))
            }</a>`,
        });
      }),
    ];
    return new Person({
      id: ctx.getActorUri(identifier),
      preferredUsername: identifier,
      name: user.displayName,
      summary: user.bio,
      inbox: ctx.getInboxUri(identifier),
      outbox: ctx.getOutboxUri(identifier),
      followers: ctx.getFollowersUri(identifier),
      endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
      url: ctx.getActorUri(identifier),
      publicKey: keys[0]?.cryptographicKey,
      assertionMethods: keys.map((k) => k.multikey),
      // Profile tags, federated as Hashtags (like Mastodon's featured tags).
      tags: tags.map((t) =>
        new Hashtag({ name: `#${t.name}`, href: new URL(`/tags/${t.slug}`, origin) })
      ),
      streams: publicLists.map((l) =>
        ctx.getObjectUri(OrderedCollection, { identifier, listId: l.id })
      ),
      attachments,
    });
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
      return [{
        privateKey: await importJwk(user.actorKeyPair.privateKey, "private"),
        publicKey: await importJwk(user.actorKeyPair.publicKey, "public"),
      }];
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
      const items = refs.map((r) =>
        r.remote && r.apId ? new URL(r.apId) : new URL(`/posts/${r.id}`, origin)
      );
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

// ── Inbox: inbound Follow / Undo / Create ────────────────────────────────
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

      await followsRepo.createRemoteFollower(followee.id, follower.id.href);
      // Auto-accept follows for now.
      await ctx.sendActivity(
        { identifier: parsed.identifier },
        follower,
        new Accept({ actor: follow.objectId, object: follow }),
      );
    })
    .on(Undo, async (ctx, undo) => {
      if (await fromBlockedDomain(undo.actorId)) return;
      const object = await undo.getObject(ctx);
      if (!(object instanceof Follow) || !object.objectId) return;
      const parsed = ctx.parseUri(object.objectId);
      if (parsed?.type !== "actor") return;
      const followee = await usersRepo.findByUsername(parsed.identifier);
      if (followee && undo.actorId) {
        await followsRepo.removeRemoteFollower(followee.id, undo.actorId.href);
      }
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
      if (!object.id) return;
      if (await postsRepo.findByApId(object.id.href)) return;
      const author = await create.getActor(ctx);
      if (!isActor(author) || !author.id) return;
      const actor = await cacheActor(author);
      const post = await postsRepo.upsertRemotePost({
        remoteActorId: actor.id,
        apId: object.id.href,
        title: object.name?.toString() ?? null,
        // Remote HTML is untrusted and rendered with {@html} by the reader —
        // sanitize before it ever touches the database.
        contentHtml: sanitizePostHtml(object.content?.toString()),
        apType: "Article",
        createdAt: object.published ? new Date(object.published.epochMilliseconds) : undefined,
      });

      // Mirror any Hashtag tags onto the post so it joins our tag pages/feeds.
      const tagNames: string[] = [];
      for await (const tag of object.getTags(ctx)) {
        if (tag instanceof Hashtag && tag.name) tagNames.push(tag.name.toString());
      }
      await tagsRepo.setPostTags(post.id, normalizeTags(tagNames));
    });
}

// ── Outbox: list the user's articles ──────────────────────────────────────
function setupOutbox(f: Federation<ContextData>) {
  f.setOutboxDispatcher("/users/{identifier}/outbox", async (ctx, identifier) => {
    const user = await usersRepo.findByUsername(identifier);
    if (!user) return null;
    const rows: postsRepo.PostWithAuthor[] = await postsRepo.listByAuthor(user.id, null, null, 20);
    const page = rows.slice(0, 20);
    const tagsByPost = await tagsRepo.tagsForPosts(page.map(({ post }) => post.id));
    const items = page.map(({ post }) =>
      new Create({
        id: new URL(`${post.id}/activity`, ctx.getOutboxUri(identifier)),
        actor: ctx.getActorUri(identifier),
        object: buildArticle(ctx, identifier, post, tagsByPost.get(post.id) ?? []),
        tos: [PUBLIC_COLLECTION],
      })
    );
    return { items };
  });
}
