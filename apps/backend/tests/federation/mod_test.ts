// SPDX-License-Identifier: AGPL-3.0-or-later
// The federation module's inbox listeners and dispatchers. Fedify's real
// createFederation is used; it is only wrapped so each registered handler can
// also be captured and called directly — with real vocab activities and a fake
// context — instead of through HTTP-signed inbox requests. Repositories and the
// note/remote helpers (tested in their own files) are stubbed.
import {
  Accept,
  Announce,
  Article,
  Block,
  Create,
  Delete,
  Follow,
  Hashtag,
  Note,
  OrderedCollection,
  Person,
  PUBLIC_COLLECTION,
  Undo,
  Update,
} from "@fedify/fedify/vocab";
import { beforeEach, describe, expect, it, test, vi } from "vitest";
import type * as remote from "@/federation/remote.ts";
import { postRow, postWithAuthor, remoteActorRow, userRow } from "../fixtures.ts";
import { fakeContext } from "./fakeContext.ts";

type Handler = (ctx: unknown, value: unknown) => Promise<unknown>;
const captured = vi.hoisted(() => ({
  listeners: new Map<unknown, Handler>(),
  dispatchers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock(import("@fedify/fedify"), async (importOriginal) => {
  const fedify = await importOriginal();
  return {
    ...fedify,
    createFederation: ((options: never) => {
      const fed = fedify.createFederation(options) as unknown as Record<string, (...a: unknown[]) => unknown>;
      const wrap = (name: string, keyOf: (args: unknown[]) => string) => {
        const original = fed[name].bind(fed);
        fed[name] = (...args: unknown[]) => {
          captured.dispatchers.set(keyOf(args), args.at(-1) as never);
          return original(...args);
        };
      };
      wrap("setActorDispatcher", () => "actor");
      wrap("setFollowersDispatcher", () => "followers");
      wrap("setOutboxDispatcher", () => "outbox");
      wrap("setObjectDispatcher", (a) => `object:${a[1] as string}`);
      const setInbox = fed.setInboxListeners.bind(fed);
      fed.setInboxListeners = (...args: unknown[]) => {
        const setters = setInbox(...args) as { on: (t: unknown, h: Handler) => unknown };
        const register = setters.on.bind(setters);
        setters.on = (type, handler) => {
          captured.listeners.set(type, handler);
          register(type, handler);
          return setters;
        };
        return setters;
      };
      return fed;
    }) as never,
  };
});

vi.mock(import("@/db/repositories/blockedDomains.ts"));
vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/readingLists.ts"));
vi.mock(import("@/db/repositories/recommendations.ts"));
vi.mock(import("@/db/repositories/relations.ts"));
vi.mock(import("@/db/repositories/remoteActors.ts"));
vi.mock(import("@/db/repositories/tags.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/db/repositories/notifications.ts"));
vi.mock(import("@/db/repositories/profileLinks.ts"));
vi.mock(import("@/federation/note.ts"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    ingestNote: vi.fn<typeof mod.ingestNote>(),
    ingestNoteUpdate: vi.fn<typeof mod.ingestNoteUpdate>(),
    ingestNoteDelete: vi.fn<typeof mod.ingestNoteDelete>(),
    noteContext: vi.fn<typeof mod.noteContext>(),
  };
});
vi.mock(import("@/federation/remote.ts"), () => ({
  cacheActor: vi.fn<typeof remote.cacheActor>(),
  resolveActor: vi.fn<typeof remote.resolveActor>(),
  fetchOutboxPosts: vi.fn<typeof remote.fetchOutboxPosts>(),
}));

import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as linksRepo from "@/db/repositories/profileLinks.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import * as recommendationsRepo from "@/db/repositories/recommendations.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { getFederation } from "@/federation/mod.ts";
import { ingestNote, ingestNoteDelete, ingestNoteUpdate, noteContext } from "@/federation/note.ts";
import { cacheActor } from "@/federation/remote.ts";
import { hostMatchesDomain } from "@/lib/domain.ts";
import { seedFederationOrigin } from "@/services/federationState.ts";

const ORIGIN = "https://blog.example";
const BOB = "https://remote.example/users/bob";
const ADA = `${ORIGIN}/users/ada`;
const POST_ID = "52683dce-2d3a-4b1c-9e5f-123456789abc";

seedFederationOrigin(ORIGIN);

describe("getFederation", () => {
  // Boot regression: two object dispatchers for one vocabulary class once
  // crash-looped the backend with a RouterError. Any registration runs here.
  it("registers every dispatcher without throwing", () => {
    expect(() => getFederation()).not.toThrow();
  });

  it("is a singleton", () => {
    expect(getFederation()).toBe(getFederation());
  });
});

getFederation();
const f = fakeContext(ORIGIN);
const ctx = {
  ...f.ctx,
  parseUri: (uri: URL | null) => {
    const m = uri && /^\/users\/([^/]+)$/.exec(uri.pathname);
    return m && uri.origin === ORIGIN ? { type: "actor", identifier: m[1] } : null;
  },
  getActorKeyPairs: vi.fn<() => Promise<never[]>>(async () => []),
};

function on(type: unknown) {
  const handler = captured.listeners.get(type);
  if (!handler) throw new Error("no listener captured");
  return (activity: unknown) => handler(ctx, activity);
}

const bobPerson = () => new Person({ id: new URL(BOB), preferredUsername: "bob", inbox: new URL(`${BOB}/inbox`) });
const bobCached = remoteActorRow({ id: "actor-bob", apId: BOB });
const ada = userRow({ id: "ada-id", username: "ada" });

beforeEach(() => {
  f.reset();
  vi.mocked(blockedDomainsRepo.isBlocked).mockResolvedValue(false);
  vi.mocked(usersRepo.findByUsername).mockImplementation(((u: string) =>
    Promise.resolve(u === "ada" ? ada : undefined)) as never);
  vi.mocked(remoteActorsRepo.findByApId).mockImplementation(((apId: string) =>
    Promise.resolve(apId === BOB ? bobCached : undefined)) as never);
  vi.mocked(relationsRepo.hasRemote).mockResolvedValue(false);
  vi.mocked(cacheActor).mockResolvedValue(bobCached);
  vi.mocked(tagsRepo.tagsForUser).mockResolvedValue([]);
  vi.mocked(listsRepo.listForUser).mockResolvedValue([]);
  vi.mocked(linksRepo.listForUser).mockResolvedValue([]);
});

describe("inbox: Follow", () => {
  const follow = () =>
    new Follow({ id: new URL("https://remote.example/follows/1"), actor: bobPerson(), object: new URL(ADA) });

  it("a public account accepts at once, records the follower and notifies", async () => {
    await on(Follow)(follow());
    expect(followsRepo.createRemoteFollower).toHaveBeenCalledWith("ada-id", BOB);
    expect(notificationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "ada-id", type: "follow", remoteActorId: "actor-bob" }),
    );
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0].activity).toBeInstanceOf(Accept);
    expect(f.sent[0].recipients).toEqual([BOB]);
  });

  it("a private account holds it as a request, keeping the Follow id, and sends nothing", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ id: "ada-id", username: "ada", isPrivate: true }));
    await on(Follow)(follow());
    expect(followsRepo.createRemoteFollower).toHaveBeenCalledWith(
      "ada-id",
      BOB,
      false,
      "https://remote.example/follows/1",
    );
    expect(notificationsRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: "follow_request" }));
    expect(f.sent).toEqual([]);
  });

  it("an actor the followee blocked cannot follow again", async () => {
    vi.mocked(relationsRepo.hasRemote).mockResolvedValue(true);
    await on(Follow)(follow());
    expect(followsRepo.createRemoteFollower).not.toHaveBeenCalled();
  });

  it("a defederated domain is ignored before anything is touched", async () => {
    vi.mocked(blockedDomainsRepo.isBlocked).mockResolvedValue(true);
    await on(Follow)(follow());
    expect(usersRepo.findByUsername).not.toHaveBeenCalled();
  });

  // BUG: the inbox passes actorId.host to the blocklist, and URL.host keeps a
  // non-default port, which hostMatchesDomain never strips. A defederated
  // server that serves its actors on e.g. :8443 walks straight past the block.
  it.fails("BUG: a defederated domain is ignored on a non-default port too", async () => {
    vi.mocked(blockedDomainsRepo.isBlocked).mockImplementation(async (host) =>
      hostMatchesDomain(host, "remote.example"),
    );
    const actor = new Person({ id: new URL("https://remote.example:8443/users/bob"), inbox: new URL(`${BOB}/inbox`) });
    await on(Follow)(new Follow({ actor, object: new URL(ADA) }));
    expect(followsRepo.createRemoteFollower).not.toHaveBeenCalled();
  });

  it("a Follow of something that is not one of our actors is ignored", async () => {
    await on(Follow)(new Follow({ actor: bobPerson(), object: new URL(`${ORIGIN}/posts/1`) }));
    await on(Follow)(new Follow({ actor: bobPerson(), object: new URL("https://elsewhere.example/users/ada") }));
    await on(Follow)(new Follow({ actor: bobPerson(), object: new URL(`${ORIGIN}/users/ghost`) }));
    expect(followsRepo.createRemoteFollower).not.toHaveBeenCalled();
  });
});

describe("inbox: Undo, Block, Accept", () => {
  it("Undo(Follow) removes the sender's follow edge", async () => {
    await on(Undo)(
      new Undo({ actor: new URL(BOB), object: new Follow({ actor: new URL(BOB), object: new URL(ADA) }) }),
    );
    expect(followsRepo.removeRemoteFollower).toHaveBeenCalledWith("ada-id", BOB);
  });

  it("Undo(Announce) removes the recommendation and its notification", async () => {
    vi.mocked(postsRepo.findByApId).mockResolvedValue(postRow({ id: "p1", authorId: "ada-id" }) as never);
    await on(Undo)(
      new Undo({
        actor: new URL(BOB),
        object: new Announce({ actor: new URL(BOB), object: new URL("https://x/p/1") }),
      }),
    );
    expect(recommendationsRepo.removeRemote).toHaveBeenCalledWith("p1", "actor-bob");
    expect(notificationsRepo.removeMatching).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "ada-id", type: "recommend", postId: "p1" }),
    );
  });

  it("Block severs both follow directions", async () => {
    await on(Block)(new Block({ actor: new URL(BOB), object: new URL(ADA) }));
    expect(followsRepo.removeRemoteFollower).toHaveBeenCalledWith("ada-id", BOB);
    expect(followsRepo.removeRemoteFollowing).toHaveBeenCalledWith("ada-id", "actor-bob");
  });

  it("Accept approves our pending follow of the accepting actor", async () => {
    await on(Accept)(
      new Accept({ actor: new URL(BOB), object: new Follow({ actor: new URL(ADA), object: new URL(BOB) }) }),
    );
    expect(followsRepo.approveRemoteFollowing).toHaveBeenCalledWith("ada-id", "actor-bob");
  });
});

describe("inbox: Create / Update / Delete", () => {
  function article(id = "https://remote.example/posts/1", overrides = {}) {
    return new Article({
      id: new URL(id),
      attribution: new URL(BOB),
      name: "Title",
      content: "<p>Hi<script>x</script></p>",
      to: PUBLIC_COLLECTION,
      tags: [new Hashtag({ name: "#Deno" })],
      ...overrides,
    });
  }

  beforeEach(() => {
    f.remote(BOB);
    vi.mocked(postsRepo.findByApId).mockResolvedValue(undefined);
    vi.mocked(postsRepo.upsertRemotePost).mockResolvedValue(postRow({ id: "cached-post" }) as never);
  });

  it("Create(Note) is handed to the reply ingester", async () => {
    const note = new Note({ id: new URL("https://remote.example/n/1"), content: "x" });
    await on(Create)(new Create({ actor: new URL(BOB), object: note }));
    expect(ingestNote).toHaveBeenCalledWith(ctx, expect.any(Note));
  });

  it("Create(Article) caches a public Article, sanitized, with its hashtags", async () => {
    await on(Create)(new Create({ actor: new URL(BOB), object: article() }));
    expect(postsRepo.upsertRemotePost).toHaveBeenCalledWith(
      expect.objectContaining({ remoteActorId: "actor-bob", apId: "https://remote.example/posts/1", title: "Title" }),
    );
    expect(vi.mocked(postsRepo.upsertRemotePost).mock.calls[0][0].contentHtml).not.toContain("<script");
    expect(tagsRepo.setPostTags).toHaveBeenCalledWith("cached-post", ["deno"]);
  });

  it.for([
    ["followers-only", { to: new URL(`${BOB}/followers`) }],
    ["attributed to another origin", { attribution: new URL("https://victim.example/users/v") }],
  ])("Create(Article) %s is never cached", async ([, overrides]) => {
    f.remote("https://victim.example/users/v");
    await on(Create)(new Create({ actor: new URL(BOB), object: article(undefined, overrides) }));
    expect(postsRepo.upsertRemotePost).not.toHaveBeenCalled();
  });

  it("an already-cached Article is not refetched or rewritten", async () => {
    vi.mocked(postsRepo.findByApId).mockResolvedValue(postRow({ id: "cached-post" }) as never);
    await on(Create)(new Create({ actor: new URL(BOB), object: article() }));
    expect(postsRepo.upsertRemotePost).not.toHaveBeenCalled();
  });

  it("Update(Article) by its author refreshes the cached copy", async () => {
    vi.mocked(postsRepo.findByApId).mockResolvedValue(
      postRow({ id: "cached-post", remoteActorId: "actor-bob" }) as never,
    );
    await on(Update)(new Update({ actor: new URL(BOB), object: article(undefined, { name: "New" }) }));
    expect(postsRepo.update).toHaveBeenCalledWith(
      "cached-post",
      expect.objectContaining({ title: "New", language: null }),
    );
  });

  it("Update(Article) by anyone else is ignored", async () => {
    vi.mocked(postsRepo.findByApId).mockResolvedValue(
      postRow({ id: "cached-post", remoteActorId: "someone-else" }) as never,
    );
    await on(Update)(new Update({ actor: new URL(BOB), object: article() }));
    expect(postsRepo.update).not.toHaveBeenCalled();
  });

  it("Update(Note) goes to the reply updater", async () => {
    await on(Update)(
      new Update({ actor: new URL(BOB), object: new Note({ id: new URL("https://remote.example/n/1") }) }),
    );
    expect(ingestNoteUpdate).toHaveBeenCalled();
  });

  it("Delete(actor) purges the cached actor", async () => {
    await on(Delete)(new Delete({ actor: new URL(BOB), object: new URL(BOB) }));
    expect(remoteActorsRepo.removeByApId).toHaveBeenCalledWith(BOB);
  });

  it("Delete(post) only by its author", async () => {
    vi.mocked(postsRepo.findByApId).mockResolvedValue(postRow({ remoteActorId: "actor-bob" }) as never);
    await on(Delete)(new Delete({ actor: new URL(BOB), object: new URL("https://remote.example/posts/1") }));
    expect(postsRepo.removeByApId).toHaveBeenCalledWith("https://remote.example/posts/1");
    vi.mocked(postsRepo.removeByApId).mockClear();
    vi.mocked(postsRepo.findByApId).mockResolvedValue(postRow({ remoteActorId: "someone-else" }) as never);
    await on(Delete)(new Delete({ actor: new URL(BOB), object: new URL("https://remote.example/posts/1") }));
    expect(postsRepo.removeByApId).not.toHaveBeenCalled();
  });

  it("Delete of something that is not a cached post goes to the reply deleter", async () => {
    await on(Delete)(new Delete({ actor: new URL(BOB), object: new URL("https://remote.example/n/1") }));
    expect(ingestNoteDelete).toHaveBeenCalledWith("https://remote.example/n/1", BOB);
  });

  it.for([Create, Update, Delete, Announce, Undo, Block, Accept])(
    "%o from a defederated domain is dropped",
    async (type) => {
      vi.mocked(blockedDomainsRepo.isBlocked).mockResolvedValue(true);
      await on(type)(new (type as typeof Create)({ actor: new URL(BOB), object: new URL(BOB) }));
      expect(postsRepo.findByApId).not.toHaveBeenCalled();
      expect(remoteActorsRepo.removeByApId).not.toHaveBeenCalled();
      expect(followsRepo.removeRemoteFollower).not.toHaveBeenCalled();
    },
  );
});

describe("inbox: Announce", () => {
  beforeEach(() => {
    f.remote(BOB);
  });

  it("a boost of a cached remote post is recorded and its local author notified", async () => {
    vi.mocked(postsRepo.findByApId).mockResolvedValue(postRow({ id: "p1", authorId: "ada-id" }) as never);
    await on(Announce)(new Announce({ actor: bobPerson(), object: new URL("https://remote.example/posts/1") }));
    expect(recommendationsRepo.addRemote).toHaveBeenCalledWith("p1", "actor-bob");
    expect(notificationsRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: "recommend", postId: "p1" }));
  });

  // BUG: a boost is matched to its post with postsRepo.findByApId, but local
  // posts store no apId — their ActivityPub id is derived (/posts/{id}). The
  // fallback then fetches our own /posts/{id}, which the frontend serves as an
  // HTML page, not JSON-LD. So when anyone on Mastodon boosts one of our
  // articles, nothing is recorded and the author is never told.
  it.fails("BUG: a remote boost of one of our own posts is recorded and notified", async () => {
    vi.mocked(postsRepo.findByApId).mockResolvedValue(undefined);
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: POST_ID }, { id: "ada-id" }));
    await on(Announce)(new Announce({ actor: bobPerson(), object: new URL(`${ORIGIN}/posts/${POST_ID}`) })).catch(
      () => {},
    );
    expect(recommendationsRepo.addRemote).toHaveBeenCalledWith(POST_ID, "actor-bob");
  });
});

describe("dispatchers", () => {
  const dispatch = (key: string, ...args: unknown[]) => captured.dispatchers.get(key)!(ctx, ...args);

  it("the actor dispatcher serves a live account and hides a deleted one", async () => {
    expect(await dispatch("actor", "ada")).toBeInstanceOf(Person);
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ username: "ada", deletedAt: new Date() }));
    expect(await dispatch("actor", "ada")).toBe(null);
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(undefined);
    expect(await dispatch("actor", "ghost")).toBe(null);
  });

  it("the outbox lists recent public posts as Create(Article)", async () => {
    vi.mocked(postsRepo.listByAuthor).mockResolvedValue([postWithAuthor({ id: "p1" }, { id: "ada-id" })]);
    vi.mocked(tagsRepo.tagsForPosts).mockResolvedValue(new Map());
    const { items } = (await dispatch("outbox", "ada")) as { items: Create[] };
    expect(items).toHaveLength(1);
    expect(items[0]).toBeInstanceOf(Create);
    expect(((await items[0].getObject()) as Article).id?.href).toBe(`${ORIGIN}/posts/p1`);
  });

  it("a private account's outbox is empty", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ id: "ada-id", username: "ada", isPrivate: true }));
    expect(await dispatch("outbox", "ada")).toEqual({ items: [] });
    expect(postsRepo.listByAuthor).not.toHaveBeenCalled();
  });

  it("the followers collection lists local and remote followers", async () => {
    vi.mocked(followsRepo.localFollowerUsernames).mockResolvedValue(["bea"]);
    vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue([BOB]);
    const { items } = (await dispatch("followers", "ada")) as { items: { id: URL }[] };
    expect(items.map((i) => i.id.href)).toEqual([`${ORIGIN}/users/bea`, BOB]);
  });

  // BUG: the web profile hides a private account's follower list from anyone
  // who isn't an approved follower (follows.followersOf returns []), but the
  // ActivityPub followers collection serves the full list to any anonymous
  // fetch of /users/<name>/followers.
  it.fails("BUG: a private account's followers are not served to the public", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ id: "ada-id", username: "ada", isPrivate: true }));
    vi.mocked(followsRepo.localFollowerUsernames).mockResolvedValue(["bea"]);
    vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue([BOB]);
    const result = (await dispatch("followers", "ada")) as { items: unknown[] } | null;
    expect(result === null || result.items.length === 0).toBe(true);
  });

  it("a public reading list is served as an OrderedCollection; a private one is not", async () => {
    vi.mocked(listsRepo.findById).mockResolvedValue({
      id: "l1",
      userId: "ada-id",
      visibility: "public",
      title: "Reads",
      description: "",
    } as never);
    vi.mocked(listsRepo.itemRefs).mockResolvedValue([
      { id: "p1", remote: false, apId: null },
      { id: "p2", remote: true, apId: "https://remote.example/posts/2" },
    ] as never);
    const list = (await dispatch("object:/users/{identifier}/lists/{listId}", {
      identifier: "ada",
      listId: "l1",
    })) as OrderedCollection;
    expect(list).toBeInstanceOf(OrderedCollection);
    expect(list.totalItems).toBe(2);
    vi.mocked(listsRepo.findById).mockResolvedValue({ id: "l1", userId: "ada-id", visibility: "private" } as never);
    expect(await dispatch("object:/users/{identifier}/lists/{listId}", { identifier: "ada", listId: "l1" })).toBe(null);
  });

  it("a comment Note is served only when it is federable", async () => {
    vi.mocked(noteContext).mockResolvedValue(null);
    expect(
      await dispatch("object:/users/{identifier}/comments/{commentId}", { identifier: "ada", commentId: "c1" }),
    ).toBe(null);
    vi.mocked(noteContext).mockResolvedValue({
      comment: { id: "c1", content: "hi", createdAt: new Date(0) },
      noteId: `${ADA}/comments/c1`,
      inReplyTo: `${ORIGIN}/posts/p1`,
      postUrl: `${ORIGIN}/posts/p1`,
      postAuthorId: "ada-id",
      postApId: null,
    } as never);
    const note = (await dispatch("object:/users/{identifier}/comments/{commentId}", {
      identifier: "ada",
      commentId: "c1",
    })) as Note;
    expect(note).toBeInstanceOf(Note);
    expect(note.content?.toString()).toBe("<p>hi</p>");
  });
});

test("every inbox activity type the module handles has a listener", () => {
  for (const type of [Follow, Undo, Block, Accept, Create, Announce, Update, Delete]) {
    expect(captured.listeners.has(type)).toBe(true);
  }
});
