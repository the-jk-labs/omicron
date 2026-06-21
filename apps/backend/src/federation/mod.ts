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
  isActor,
  Note,
  Person,
  PUBLIC_COLLECTION,
  Undo,
} from "@fedify/fedify/vocab";
import * as usersRepo from "@/db/repositories/users.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import { buildNote } from "@/federation/note.ts";

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

// ── Inbox: inbound Follow / Undo / Create ────────────────────────────────
function setupInbox(f: Federation<ContextData>) {
  f.setInboxListeners("/users/{identifier}/inbox", "/inbox")
    .on(Follow, async (ctx, follow) => {
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
      const object = await undo.getObject(ctx);
      if (!(object instanceof Follow) || !object.objectId) return;
      const parsed = ctx.parseUri(object.objectId);
      if (parsed?.type !== "actor") return;
      const followee = await usersRepo.findByUsername(parsed.identifier);
      if (followee && undo.actorId) {
        await followsRepo.removeRemoteFollower(followee.id, undo.actorId.href);
      }
    })
    .on(Create, async (ctx, create) => {
      // Ingest a remote note as a local (remote-flagged) post.
      const object = await create.getObject(ctx);
      if (!(object instanceof Note) || !object.id) return;
      if (await postsRepo.findByApId(object.id.href)) return;
      const author = await create.getActor(ctx);
      if (!isActor(author) || !author.id) return;
      // Map the remote author to a local placeholder user keyed by actor URI.
      const local = await usersRepo.findByUsername(
        `${author.preferredUsername ?? "remote"}`,
      );
      if (!local) return; // Only ingest notes from actors we already know.
      await postsRepo.create({
        authorId: local.id,
        contentHtml: object.content?.toString() ?? "",
        apId: object.id.href,
        remote: true,
      });
    });
}

// ── Outbox: list the user's notes ─────────────────────────────────────────
function setupOutbox(f: Federation<ContextData>) {
  f.setOutboxDispatcher("/users/{identifier}/outbox", async (ctx, identifier) => {
    const user = await usersRepo.findByUsername(identifier);
    if (!user) return null;
    const rows: postsRepo.PostWithAuthor[] = await postsRepo.listByAuthor(user.id, null, 20);
    const items = rows.slice(0, 20).map(({ post }) =>
      new Create({
        id: new URL(`${post.id}/activity`, ctx.getOutboxUri(identifier)),
        actor: ctx.getActorUri(identifier),
        object: buildNote(ctx, identifier, post),
        tos: [PUBLIC_COLLECTION],
      })
    );
    return { items };
  });
}
