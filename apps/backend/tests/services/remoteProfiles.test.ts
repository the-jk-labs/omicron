// SPDX-License-Identifier: AGPL-3.0-or-later
// Read-side federation. The outbound fetches (federation/remote.ts) are the
// network boundary and are stubbed; the negative cache and single-flight
// coalescing (federation/outboundGuard.ts) are real, so every test uses its own
// handle to keep their in-process state apart.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postWithAuthor, remoteActorRow, uuid } from "../fixtures.ts";

vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/relations.ts"));
vi.mock(import("@/db/repositories/remoteActors.ts"));
vi.mock(import("@/db/repositories/tags.ts"));
vi.mock(import("@/federation/remote.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import { config } from "@/config.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import { fetchOutboxPosts, resolveActor } from "@/federation/remote.ts";
import { DEFAULT_PAGE_SIZE, decodeCursor } from "@/lib/pagination.ts";
import { queue } from "@/queue/queue.ts";
import { follow, getPosts, getProfile, getProfileView, unfollow } from "@/services/remoteProfiles.ts";

let n = 0;
const handle = () => `user${++n}-${Math.random().toString(36).slice(2)}@remote.example`;

const fresh = (h: string) => remoteActorRow({ id: `id-${h}`, handle: h, fetchedAt: new Date() });
const stale = (h: string) => remoteActorRow({ id: `id-${h}`, handle: h, fetchedAt: new Date(Date.now() - 3_600_000) });

const originalMissMax = config.RL_REMOTE_MISS_MAX;

beforeEach(() => {
  vi.mocked(resolveActor).mockResolvedValue(null);
  vi.mocked(fetchOutboxPosts).mockResolvedValue();
  vi.mocked(relationsRepo.hasRemote).mockResolvedValue(false);
  vi.mocked(followsRepo.isFollowingRemote).mockResolvedValue(false);
  vi.mocked(tagsRepo.tagsForRemoteActor).mockResolvedValue([]);
  vi.mocked(postsRepo.listByRemoteActor).mockResolvedValue([]);
});

afterEach(() => {
  config.RL_REMOTE_MISS_MAX = originalMissMax;
});

describe("getProfile", () => {
  it("serves a fresh cached actor without any outbound work", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(fresh(h));
    expect((await getProfile(h, "ip")).handle).toBe(h);
    expect(resolveActor).not.toHaveBeenCalled();
  });

  it("resolves an uncached actor", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(undefined);
    vi.mocked(resolveActor).mockResolvedValue(fresh(h));
    expect((await getProfile(h)).handle).toBe(h);
    expect(resolveActor).toHaveBeenCalledWith(h);
  });

  it("refreshes a stale actor, and serves the stale copy if the refresh fails", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(stale(h));
    vi.mocked(resolveActor).mockResolvedValue(null);
    expect((await getProfile(h)).id).toBe(`id-${h}`);
    expect(resolveActor).toHaveBeenCalledOnce();
  });

  it("negatively caches a failed resolution so it is not repeated", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(undefined);
    await expect(getProfile(h)).rejects.toMatchObject({ status: 404, message: "Remote user not found." });
    await expect(getProfile(h)).rejects.toMatchObject({ status: 404 });
    expect(resolveActor).toHaveBeenCalledOnce();
  });

  it("a negatively cached handle still serves stale data when there is some", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(undefined);
    await getProfile(h).catch(() => {});
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(stale(h));
    expect((await getProfile(h)).handle).toBe(h);
    expect(resolveActor).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent lookups of the same handle into one resolution", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(undefined);
    let release!: (a: ReturnType<typeof fresh>) => void;
    vi.mocked(resolveActor).mockReturnValue(new Promise((r) => (release = r)) as never);
    const all = Promise.all([getProfile(h), getProfile(h), getProfile(h)]);
    await vi.waitFor(() => expect(resolveActor).toHaveBeenCalled());
    release(fresh(h));
    expect((await all).map((a) => a.handle)).toEqual([h, h, h]);
    expect(resolveActor).toHaveBeenCalledOnce();
  });

  // #128: a cache miss performs outbound work, so it counts against a tighter
  // per-caller cap than a plain cached read.
  describe("cache-miss budget", () => {
    it("never meters fresh cache hits", async () => {
      config.RL_REMOTE_MISS_MAX = 2;
      const h = handle();
      vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(fresh(h));
      const key = `no-miss-${Math.random()}`;
      for (let i = 0; i < 10; i++) await expect(getProfile(h, key)).resolves.toBeDefined();
    });

    it("refuses excessive misses with 429 before any outbound work", async () => {
      config.RL_REMOTE_MISS_MAX = 2;
      vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(undefined);
      const key = `miss-${Math.random()}`;
      for (let i = 0; i < 2; i++) await expect(getProfile(handle(), key)).rejects.toMatchObject({ status: 404 });
      await expect(getProfile(handle(), key)).rejects.toMatchObject({ status: 429 });
      expect(resolveActor).toHaveBeenCalledTimes(2);
    });

    it("internal callers without a key are never metered", async () => {
      config.RL_REMOTE_MISS_MAX = 1;
      vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(undefined);
      for (let i = 0; i < 3; i++) await expect(getProfile(handle())).rejects.toMatchObject({ status: 404 });
    });
  });
});

describe("getProfileView", () => {
  it("reports follow and mute state for the viewer", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(fresh(h));
    vi.mocked(followsRepo.isFollowingRemote).mockResolvedValue(true);
    vi.mocked(relationsRepo.hasRemote).mockImplementation(async (kind) => kind === "mute");
    vi.mocked(tagsRepo.tagsForRemoteActor).mockResolvedValue([{ slug: "art", name: "Art" }]);
    expect(await getProfileView(h, "me")).toEqual({
      actor: expect.objectContaining({ handle: h }),
      isFollowing: true,
      isMuted: true,
      isBlocked: false,
      tags: [{ slug: "art", name: "Art" }],
    });
  });

  it("an anonymous viewer gets no relation state", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(fresh(h));
    expect(await getProfileView(h, null)).toMatchObject({ isFollowing: false, isMuted: false });
    expect(relationsRepo.hasRemote).not.toHaveBeenCalled();
  });

  it("an actor the viewer blocked reads as not found", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(fresh(h));
    vi.mocked(relationsRepo.hasRemote).mockImplementation(async (kind) => kind === "block");
    await expect(getProfileView(h, "me")).rejects.toMatchObject({ status: 404 });
  });
});

describe("follow / unfollow", () => {
  it("records the edge, crawls recent posts and federates a Follow", async () => {
    const h = handle();
    const actor = fresh(h);
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(actor);
    await follow("me", h);
    expect(followsRepo.createRemoteFollowing).toHaveBeenCalledWith("me", actor.id);
    expect(fetchOutboxPosts).toHaveBeenCalledWith(h, actor.id);
    expect(queue.add).toHaveBeenCalledWith("send_follow", { followerId: "me", targetActor: actor.apId });
  });

  it("refuses to follow an actor the viewer blocked", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(fresh(h));
    vi.mocked(relationsRepo.hasRemote).mockResolvedValue(true);
    await expect(follow("me", h)).rejects.toMatchObject({ status: 403 });
    expect(followsRepo.createRemoteFollowing).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("unfollowing removes the edge and federates Undo(Follow)", async () => {
    const h = handle();
    const actor = fresh(h);
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(actor);
    await unfollow("me", h);
    expect(followsRepo.removeRemoteFollowing).toHaveBeenCalledWith("me", actor.id);
    expect(queue.add).toHaveBeenCalledWith("send_unfollow", { followerId: "me", targetActor: actor.apId });
  });

  it("unfollowing an unknown actor is a 404 and never resolves it", async () => {
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(undefined);
    await expect(unfollow("me", handle())).rejects.toMatchObject({ status: 404 });
    expect(resolveActor).not.toHaveBeenCalled();
  });
});

const rows = (k: number) =>
  Array.from({ length: k }, (_, i) =>
    postWithAuthor({ id: uuid(i), createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 59 - i)) }),
  );

describe("getPosts", () => {
  it("re-crawls a stale actor's outbox on the first page", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(stale(h));
    vi.mocked(resolveActor).mockResolvedValue(stale(h));
    await getPosts(h, null);
    expect(fetchOutboxPosts).toHaveBeenCalledOnce();
  });

  it("crawls a fresh actor once when nothing is cached yet", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(fresh(h));
    await getPosts(h, null);
    expect(fetchOutboxPosts).toHaveBeenCalledOnce();
  });

  it("does not crawl a fresh actor that already has posts, nor on later pages", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(fresh(h));
    vi.mocked(postsRepo.listByRemoteActor).mockResolvedValue(rows(1));
    await getPosts(h, null);
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(stale(h));
    vi.mocked(resolveActor).mockResolvedValue(stale(h));
    await getPosts(h, { createdAt: "2026-01-01T00:00:00.000Z", id: "x" });
    expect(fetchOutboxPosts).not.toHaveBeenCalled();
  });

  it("pages with a cursor on the last kept post", async () => {
    const h = handle();
    vi.mocked(remoteActorsRepo.findByHandle).mockResolvedValue(fresh(h));
    const all = rows(DEFAULT_PAGE_SIZE + 1);
    vi.mocked(postsRepo.listByRemoteActor).mockResolvedValue(all);
    const page = await getPosts(h, null, "viewer");
    expect(page.items).toHaveLength(DEFAULT_PAGE_SIZE);
    const last = all[DEFAULT_PAGE_SIZE - 1].post;
    expect(decodeCursor(page.nextCursor)).toEqual({ createdAt: last.createdAt.toISOString(), id: last.id });
    expect(postsRepo.listByRemoteActor).toHaveBeenLastCalledWith(`id-${h}`, "viewer", null, DEFAULT_PAGE_SIZE);
  });
});
