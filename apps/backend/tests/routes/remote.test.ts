// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { remoteActorRow } from "../fixtures.ts";
import { mount } from "./harness.ts";

vi.mock(import("@/services/remoteProfiles.ts"));
vi.mock(import("@/services/relations.ts"));
vi.mock(import("@/services/recommendations.ts"));
vi.mock(import("@/services/engagement.ts"));

import { config } from "@/config.ts";
import { remoteRoutes } from "@/routes/remote.ts";
import { enrichPosts } from "@/services/engagement.ts";
import { seedFederationRunning } from "@/services/federationState.ts";
import * as recommendationsService from "@/services/recommendations.ts";
import * as relationsService from "@/services/relations.ts";
import * as remoteProfilesService from "@/services/remoteProfiles.ts";

const api = mount("/api/remote", remoteRoutes);
const actor = remoteActorRow({
  id: "a1",
  handle: "bob@x.example",
  displayName: "<p>Bob</p>",
  bio: "<p>Hi &amp; bye</p>",
});
let ip = 0;
const fromIp = () => ({ "x-forwarded-for": `198.51.100.${++ip % 250}` });

beforeEach(() => {
  api.signOut();
  seedFederationRunning(true);
  vi.mocked(remoteProfilesService.getProfileView).mockResolvedValue({
    actor,
    isFollowing: false,
    isMuted: false,
    isBlocked: false,
    tags: [],
  });
  vi.mocked(remoteProfilesService.getProfile).mockResolvedValue(actor);
  vi.mocked(remoteProfilesService.getPosts).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(recommendationsService.listByRemoteActor).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(enrichPosts).mockResolvedValue([]);
});

afterEach(() => {
  seedFederationRunning(false);
});

test("every route 404s while federation is off", async () => {
  seedFederationRunning(false);
  const res = await api.request("/api/remote/users/bob@x.example");
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "Federation is disabled." });
  expect(remoteProfilesService.getProfileView).not.toHaveBeenCalled();
});

describe("profile", () => {
  test("serializes the remote actor with HTML flattened to text", async () => {
    const body = await (await api.request("/api/remote/users/bob@x.example", { headers: fromIp() })).json();
    expect(body.user).toMatchObject({ username: "bob@x.example", displayName: "Bob", bio: "Hi & bye", remote: true });
    expect(body).toMatchObject({ isFollowing: false, isMuted: false, isBlocked: false });
  });

  test("an anonymous caller is metered by IP, a signed-in one by account", async () => {
    await api.request("/api/remote/users/bob@x.example", { headers: { "x-forwarded-for": "203.0.113.5" } });
    expect(remoteProfilesService.getProfileView).toHaveBeenLastCalledWith("bob@x.example", null, "ip:203.0.113.5");
    api.signIn();
    await api.request("/api/remote/users/bob@x.example");
    expect(remoteProfilesService.getProfileView).toHaveBeenLastCalledWith("bob@x.example", "me", "u:me");
  });

  test("anonymous profile lookups are capped per IP", async () => {
    const headers = fromIp();
    for (let i = 0; i < config.RL_REMOTE_MAX; i++) {
      expect((await api.request("/api/remote/users/bob@x.example", { headers })).status).toBe(200);
    }
    expect((await api.request("/api/remote/users/bob@x.example", { headers })).status).toBe(429);
  });

  test("signed-in lookups are not held to the anonymous discovery cap", async () => {
    api.signIn();
    for (let i = 0; i < config.RL_REMOTE_MAX + 2; i++) {
      expect((await api.request("/api/remote/users/bob@x.example")).status).toBe(200);
    }
  });

  test("anonymous GET /users/:handle/posts counts against the discovery budget", async () => {
    const headers = fromIp();
    for (let i = 0; i < config.RL_REMOTE_MAX; i++) {
      await api.request("/api/remote/users/bob@x.example/posts", { headers });
    }
    expect((await api.request("/api/remote/users/bob@x.example/posts", { headers })).status).toBe(429);
  });
});

describe("posts and recommendations", () => {
  test("posts pass the cursor, viewer and caller key", async () => {
    await api.request("/api/remote/users/bob@x.example/posts", { headers: { "x-forwarded-for": "203.0.113.9" } });
    expect(remoteProfilesService.getPosts).toHaveBeenCalledWith("bob@x.example", null, null, "ip:203.0.113.9");
  });

  test("recommendations resolve the actor first", async () => {
    api.signIn();
    expect(await (await api.request("/api/remote/users/bob@x.example/recommendations")).json()).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(recommendationsService.listByRemoteActor).toHaveBeenCalledWith("a1", "me", null);
  });
});

describe("relations", () => {
  test.for([
    ["POST", "follow"],
    ["DELETE", "follow"],
    ["POST", "mute"],
    ["DELETE", "mute"],
    ["POST", "block"],
    ["DELETE", "block"],
  ])("%s /%s requires a signed-in user", async ([method, what]) => {
    expect((await api.request(`/api/remote/users/bob@x.example/${what}`, { method })).status).toBe(401);
  });

  test("follow answers 201; unfollow 200", async () => {
    api.signIn();
    vi.mocked(remoteProfilesService.follow).mockResolvedValue();
    vi.mocked(remoteProfilesService.unfollow).mockResolvedValue();
    expect((await api.request("/api/remote/users/bob@x.example/follow", { method: "POST" })).status).toBe(201);
    expect((await api.request("/api/remote/users/bob@x.example/follow", { method: "DELETE" })).status).toBe(200);
    expect(remoteProfilesService.follow).toHaveBeenCalledWith("me", "bob@x.example");
  });

  test("mute and block toggle through the relations service", async () => {
    api.signIn();
    vi.mocked(relationsService.setRemote).mockResolvedValue();
    await api.request("/api/remote/users/bob@x.example/mute", { method: "POST" });
    await api.request("/api/remote/users/bob@x.example/mute", { method: "DELETE" });
    await api.request("/api/remote/users/bob@x.example/block", { method: "POST" });
    await api.request("/api/remote/users/bob@x.example/block", { method: "DELETE" });
    expect(vi.mocked(relationsService.setRemote).mock.calls).toEqual([
      ["mute", "me", "bob@x.example", true],
      ["mute", "me", "bob@x.example", false],
      ["block", "me", "bob@x.example", true],
      ["block", "me", "bob@x.example", false],
    ]);
  });
});
