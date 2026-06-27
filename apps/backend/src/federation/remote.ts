// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DocumentLoader } from "@fedify/fedify";
import { type Actor, Article, Create, Hashtag, isActor } from "@fedify/fedify/vocab";
import { getFederation } from "@/federation/mod.ts";
import { origin } from "@/config.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import { normalizeTags } from "@/lib/tags.ts";
import type { RemoteActor } from "@/db/schema.ts";

// Resolving and caching remote fediverse actors + their posts. This is the
// read-side counterpart to outbound.ts: we fetch foreign actor documents and
// outboxes so they can be browsed locally.

const MAX_OUTBOX_POSTS = 20;

function text(value: { toString(): string } | string | null | undefined): string {
  return value == null ? "" : value.toString();
}

// Fedify's lookupObject expects the canonical `@user@host` form; callers pass a
// bare `user@host` handle (the leading `@` is stripped at the route layer).
function fediHandle(handle: string): string {
  return handle.startsWith("@") ? handle : `@${handle}`;
}

// A signed document loader (keyed to the oldest local user) so instances that
// require authorized fetch / secure mode still serve us their documents. Falls
// back to the default loader when there is no local user yet.
async function signedLoader(): Promise<DocumentLoader | undefined> {
  const ctx = getFederation().createContext(new URL(origin), undefined);
  const user = await usersRepo.firstUser();
  if (!user) return undefined;
  return await ctx.getDocumentLoader({ identifier: user.username });
}

// Resolves `user@host` via WebFinger, then caches the actor document.
export async function resolveActor(handle: string): Promise<RemoteActor | null> {
  const ctx = getFederation().createContext(new URL(origin), undefined);
  const documentLoader = await signedLoader();
  const object = await ctx.lookupObject(fediHandle(handle), { documentLoader });
  if (!isActor(object) || !object.id) return null;
  return await cacheActor(object, handle);
}

// Persists (or refreshes) a resolved actor. `handle` is optional because the
// inbox path derives it from the actor itself.
export async function cacheActor(actor: Actor, handle?: string): Promise<RemoteActor> {
  const apId = actor.id!.href;
  const host = new URL(apId).host;
  const username = text(actor.preferredUsername) || "unknown";
  const icon = await actor.getIcon().catch(() => null);
  const avatarUrl = icon?.url instanceof URL ? icon.url.href : null;

  const cached = await remoteActorsRepo.upsert({
    apId,
    handle: handle ?? `${username}@${host}`,
    username,
    host,
    displayName: text(actor.name) || username,
    bio: text(actor.summary),
    avatarUrl,
    inboxUrl: actor.inboxId?.href ?? null,
    sharedInboxUrl: actor.endpoints?.sharedInbox?.href ?? null,
    outboxUrl: actor.outboxId?.href ?? null,
    followersCount: null,
    followingCount: null,
  });

  // Mirror the actor's profile Hashtags so federated profiles show their tags.
  const tagNames: string[] = [];
  for await (const tag of actor.getTags()) {
    if (tag instanceof Hashtag && tag.name) tagNames.push(tag.name.toString());
  }
  await tagsRepo.setRemoteActorTags(cached.id, normalizeTags(tagNames));

  return cached;
}

// Fetches the first page of an actor's outbox and upserts each Article as a
// local (remote-flagged) post. Best-effort: failures are swallowed so the
// profile still renders from whatever is cached.
export async function fetchOutboxPosts(handle: string, remoteActorId: string): Promise<void> {
  try {
    const ctx = getFederation().createContext(new URL(origin), undefined);
    const documentLoader = await signedLoader();
    const actor = await ctx.lookupObject(fediHandle(handle), { documentLoader });
    if (!isActor(actor)) return;

    const outbox = await actor.getOutbox({ documentLoader });
    if (!outbox) return;
    // Paged collections keep items on their first page; inline ones expose them
    // directly. Try the first page, then fall back to the collection itself.
    const page = "getFirst" in outbox && outbox.firstId
      ? (await outbox.getFirst({ documentLoader })) ?? outbox
      : outbox;

    let count = 0;
    for await (const item of page.getItems({ documentLoader })) {
      if (count >= MAX_OUTBOX_POSTS) break;
      const obj = item instanceof Create ? await item.getObject({ documentLoader }) : item;
      // Long-form only: keep Articles, skip microblog Notes (Mastodon, …).
      if (!(obj instanceof Article)) continue;
      if (!obj.id) continue;
      await postsRepo.upsertRemotePost({
        remoteActorId,
        apId: obj.id.href,
        title: obj.name ? text(obj.name) : null,
        contentHtml: text(obj.content),
        apType: "Article",
        createdAt: obj.published ? new Date(obj.published.epochMilliseconds) : undefined,
      });
      count++;
    }
  } catch (err) {
    console.warn(`[federation] outbox fetch failed for ${handle}:`, err);
  }
}
