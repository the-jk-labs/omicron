// SPDX-License-Identifier: AGPL-3.0-or-later
// Actors and outboxes are real Fedify vocab objects (outboxes embedded, so no
// network is touched); DNS is the SSRF guard's boundary and is scripted, and the
// repositories are stubbed.
import {
  Article,
  Create,
  Hashtag,
  Image,
  Note,
  OrderedCollection,
  Person,
  PUBLIC_COLLECTION,
} from "@fedify/fedify/vocab";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { remoteActorRow, userRow } from "../fixtures.ts";
import { fakeContext } from "./fakeContext.ts";

const ORIGIN = "https://blog.example";
const fake = vi.hoisted(() => ({ value: null as unknown }));

vi.mock(import("@/federation/mod.ts"), () => ({
  getFederation: (() => ({ createContext: () => (fake.value as { ctx: unknown }).ctx })) as never,
}));
vi.mock(import("node:dns/promises"), () => ({
  lookup: vi.fn<() => Promise<unknown>>(async () => [{ address: "93.184.216.34", family: 4 }]) as never,
}));
vi.mock(import("@/db/repositories/blockedDomains.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/remoteActors.ts"));
vi.mock(import("@/db/repositories/tags.ts"));
vi.mock(import("@/db/repositories/users.ts"));

import { lookup } from "node:dns/promises";
import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { cacheActor, fetchOutboxPosts, resolveActor } from "@/federation/remote.ts";
import { seedFederationOrigin } from "@/services/federationState.ts";

const f = fakeContext(ORIGIN);
fake.value = f;
seedFederationOrigin(ORIGIN);
(f.ctx as Record<string, unknown>).getDocumentLoader = vi.fn<() => Promise<undefined>>(async () => undefined);

function bob(overrides: Partial<ConstructorParameters<typeof Person>[0]> = {}) {
  return new Person({
    id: new URL("https://remote.example/users/bob"),
    preferredUsername: "bob",
    name: "Bob <b>B</b>",
    summary: "<p>Hi</p>",
    inbox: new URL("https://remote.example/users/bob/inbox"),
    outbox: new URL("https://remote.example/users/bob/outbox"),
    ...overrides,
  });
}

beforeEach(() => {
  vi.mocked(blockedDomainsRepo.isBlocked).mockResolvedValue(false);
  vi.mocked(usersRepo.firstUser).mockResolvedValue(userRow({ username: "ada" }));
  vi.mocked(remoteActorsRepo.upsert).mockImplementation(async (data) => remoteActorRow({ id: "cached", ...data }));
  f.ctx.lookupObject.mockReset();
});

describe("cacheActor", () => {
  test("stores the actor's identity, profile and endpoints", async () => {
    const actor = bob({
      icon: new Image({ url: new URL("https://remote.example/avatar.png") }),
      tags: [new Hashtag({ name: "#Art" }), new Hashtag({ name: "#art" })],
    });
    await cacheActor(actor, "bob@remote.example");
    expect(remoteActorsRepo.upsert).toHaveBeenCalledWith({
      apId: "https://remote.example/users/bob",
      handle: "bob@remote.example",
      username: "bob",
      host: "remote.example",
      displayName: "Bob <b>B</b>",
      bio: "<p>Hi</p>",
      avatarUrl: "https://remote.example/avatar.png",
      inboxUrl: "https://remote.example/users/bob/inbox",
      sharedInboxUrl: null,
      outboxUrl: "https://remote.example/users/bob/outbox",
      followersCount: null,
      followingCount: null,
    });
    // Hashtags are normalized and de-duplicated.
    expect(tagsRepo.setRemoteActorTags).toHaveBeenCalledWith("cached", ["art"]);
  });

  test("derives the handle from the actor when none is given", async () => {
    await cacheActor(bob({ id: new URL("https://remote.example:8443/users/bob") }));
    expect(vi.mocked(remoteActorsRepo.upsert).mock.calls[0][0].handle).toBe("bob@remote.example:8443");
  });

  test("falls back to the username for a missing name, and 'unknown' for a missing username", async () => {
    await cacheActor(bob({ name: null, preferredUsername: null }));
    expect(vi.mocked(remoteActorsRepo.upsert).mock.calls[0][0]).toMatchObject({
      username: "unknown",
      displayName: "unknown",
    });
  });
});

describe("resolveActor", () => {
  test("resolves via WebFinger with a signed loader and caches", async () => {
    f.ctx.lookupObject.mockResolvedValue(bob());
    const actor = await resolveActor("bob@remote.example");
    expect(actor?.id).toBe("cached");
    expect(f.ctx.lookupObject).toHaveBeenCalledWith(
      "@bob@remote.example",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test.for(["bob@127.0.0.1", "bob@localhost", "bob@10.0.0.5", "bob@[::1]", "bob@intranet", "not-a-handle"])(
    "refuses %s without any lookup (SSRF)",
    async (handle) => {
      expect(await resolveActor(handle)).toBe(null);
      expect(f.ctx.lookupObject).not.toHaveBeenCalled();
    },
  );

  test("refuses a public-looking host that resolves to a private address", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([{ address: "192.168.1.10", family: 4 }] as never);
    expect(await resolveActor("bob@sneaky.example")).toBe(null);
    expect(f.ctx.lookupObject).not.toHaveBeenCalled();
  });

  test("never reaches a defederated domain", async () => {
    vi.mocked(blockedDomainsRepo.isBlocked).mockResolvedValue(true);
    expect(await resolveActor("bob@remote.example")).toBe(null);
    expect(f.ctx.lookupObject).not.toHaveBeenCalled();
  });

  test("a non-actor or a failed lookup is null, never a throw", async () => {
    f.ctx.lookupObject.mockResolvedValue(new Note({ id: new URL("https://remote.example/n/1") }) as never);
    expect(await resolveActor("bob@remote.example")).toBe(null);
    f.ctx.lookupObject.mockRejectedValue(new Error("timeout"));
    expect(await resolveActor("bob@remote.example")).toBe(null);
  });

  // BUG: the actor WebFinger returns is cached under the handle that was
  // *asked for*, without checking it against the actor's own
  // preferredUsername@host (Mastodon round-trips WebFinger for this). A hostile
  // server can answer for ceo@evil.example with someone else's real actor, and
  // the instance then shows that person's profile and posts as @ceo@evil.example.
  test.fails("BUG: refuses an actor whose id is not on the requested handle's host", async () => {
    f.ctx.lookupObject.mockResolvedValue(
      bob({ id: new URL("https://mastodon.social/users/Gargron"), preferredUsername: "Gargron" }),
    );
    expect(await resolveActor("ceo@evil.example")).toBe(null);
  });
});

function article(id: string, overrides: Partial<ConstructorParameters<typeof Article>[0]> = {}) {
  return new Article({
    id: new URL(id),
    name: "Title",
    content: "<p>Body<script>alert(1)</script></p>",
    to: PUBLIC_COLLECTION,
    published: Temporal.Instant.from("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}

describe("fetchOutboxPosts", () => {
  function withOutbox(items: unknown[]) {
    f.ctx.lookupObject.mockResolvedValue(bob({ outbox: new OrderedCollection({ items: items as never }) }));
  }

  test("caches public Articles (bare or wrapped in Create) with sanitized HTML", async () => {
    withOutbox([
      article("https://remote.example/posts/1"),
      new Create({ id: new URL("https://remote.example/c/2"), object: article("https://remote.example/posts/2") }),
    ]);
    await fetchOutboxPosts("bob@remote.example", "actor-1");
    const calls = vi.mocked(postsRepo.upsertRemotePost).mock.calls.map(([d]) => d);
    expect(calls.map((d) => d.apId)).toEqual(["https://remote.example/posts/1", "https://remote.example/posts/2"]);
    expect(calls[0]).toMatchObject({ remoteActorId: "actor-1", title: "Title", apType: "Article" });
    expect(calls[0].contentHtml).not.toContain("<script");
    expect(calls[0].createdAt).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  test("skips Notes, followers-only Articles, and Articles from another origin", async () => {
    withOutbox([
      new Note({ id: new URL("https://remote.example/notes/1"), content: "short", to: PUBLIC_COLLECTION }),
      article("https://remote.example/posts/private", { to: new URL("https://remote.example/users/bob/followers") }),
      article("https://other.example/posts/stolen"),
      article("https://remote.example/posts/ok"),
    ]);
    await fetchOutboxPosts("bob@remote.example", "actor-1");
    expect(vi.mocked(postsRepo.upsertRemotePost).mock.calls.map(([d]) => d.apId)).toEqual([
      "https://remote.example/posts/ok",
    ]);
  });

  test("caps a crawl at 20 posts", async () => {
    withOutbox(Array.from({ length: 30 }, (_, i) => article(`https://remote.example/posts/${i}`)));
    await fetchOutboxPosts("bob@remote.example", "actor-1");
    expect(postsRepo.upsertRemotePost).toHaveBeenCalledTimes(20);
  });

  test("never crawls a blocked or private host, and swallows failures", async () => {
    await fetchOutboxPosts("bob@127.0.0.1", "a");
    vi.mocked(blockedDomainsRepo.isBlocked).mockResolvedValue(true);
    await fetchOutboxPosts("bob@remote.example", "a");
    expect(f.ctx.lookupObject).not.toHaveBeenCalled();
    vi.mocked(blockedDomainsRepo.isBlocked).mockResolvedValue(false);
    f.ctx.lookupObject.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(fetchOutboxPosts("bob@remote.example", "a")).resolves.toBeUndefined();
  });
});
