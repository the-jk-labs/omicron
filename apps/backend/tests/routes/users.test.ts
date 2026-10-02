// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { postWithAuthor, userRow } from "../fixtures.ts";
import { mount } from "./harness.ts";

vi.mock(import("@/db/repositories/tags.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/engagement.ts"));
vi.mock(import("@/services/followRequests.ts"));
vi.mock(import("@/services/follows.ts"));
vi.mock(import("@/services/posts.ts"));
vi.mock(import("@/services/recommendations.ts"));
vi.mock(import("@/services/relations.ts"));
vi.mock(import("@/services/users.ts"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    updateProfile: vi.fn<typeof mod.updateProfile>(),
    setPrivacy: vi.fn<typeof mod.setPrivacy>(),
    setAvatar: vi.fn<typeof mod.setAvatar>(),
    removeAvatar: vi.fn<typeof mod.removeAvatar>(),
    suggestedFollows: vi.fn<typeof mod.suggestedFollows>(),
    profileLinks: vi.fn<typeof mod.profileLinks>(),
  };
});

import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { notFound } from "@/lib/http.ts";
import { userRoutes } from "@/routes/users.ts";
import { enrichPosts } from "@/services/engagement.ts";
import * as followRequestsService from "@/services/followRequests.ts";
import * as followsService from "@/services/follows.ts";
import * as postsService from "@/services/posts.ts";
import * as recommendationsService from "@/services/recommendations.ts";
import * as relationsService from "@/services/relations.ts";
import * as usersService from "@/services/users.ts";

const api = mount("/api/users", userRoutes);
const bob = userRow({ id: "bob", username: "bob", customSection: "# Secret", customSectionHtml: "<h1>Secret</h1>" });

beforeEach(() => {
  api.signOut();
  vi.mocked(tagsRepo.tagsForUser).mockResolvedValue([]);
  vi.mocked(usersService.profileLinks).mockResolvedValue([]);
  vi.mocked(enrichPosts).mockImplementation(async (rows) => rows.map((r) => ({ id: r.post.id })) as never);
});

describe("auth guards", () => {
  test.for([
    ["GET", "/api/users/me/follow-requests"],
    ["POST", "/api/users/me/follow-requests/r1/approve"],
    ["POST", "/api/users/me/follow-requests/r1/reject"],
    ["POST", "/api/users/me/avatar"],
    ["DELETE", "/api/users/me/avatar"],
    ["GET", "/api/users/me/muted"],
    ["GET", "/api/users/me/blocked"],
    ["DELETE", "/api/users/me/followers/ann"],
    ["POST", "/api/users/bob/follow"],
    ["DELETE", "/api/users/bob/follow"],
    ["POST", "/api/users/bob/mute"],
    ["DELETE", "/api/users/bob/mute"],
    ["POST", "/api/users/bob/block"],
    ["DELETE", "/api/users/bob/block"],
  ])("%s %s requires a signed-in user", async ([method, path]) => {
    expect((await api.request(path, { method })).status).toBe(401);
  });

  test.for([
    ["PATCH", "/api/users/me", {}],
    ["POST", "/api/users/me/custom-section/preview", { customSection: "x" }],
    ["PATCH", "/api/users/me/privacy", { isPrivate: true }],
  ] as const)("%s %s requires a signed-in user", async ([method, path, body]) => {
    expect((await api.json(path, method, body)).status).toBe(401);
  });
});

describe("own profile", () => {
  test("PATCH /me returns the public view (never the email)", async () => {
    api.signIn();
    vi.mocked(usersService.updateProfile).mockResolvedValue({
      user: userRow({ id: "me", displayName: "New", email: "secret@example.test" }),
      tags: [],
      links: [],
    });
    const body = await (await api.json("/api/users/me", "PATCH", { displayName: "New" })).json();
    expect(body.user.displayName).toBe("New");
    expect(body.user).not.toHaveProperty("email");
    expect(usersService.updateProfile).toHaveBeenCalledWith("me", { displayName: "New" });
  });

  test("PATCH /me rejects wrongly-typed fields", async () => {
    api.signIn();
    expect((await api.json("/api/users/me", "PATCH", { tags: "x" })).status).toBe(400);
    expect((await api.json("/api/users/me", "PATCH", { links: [{ url: 1 }] })).status).toBe(400);
    expect(usersService.updateProfile).not.toHaveBeenCalled();
  });

  test("the custom-section preview renders sanitized Markdown and enforces the cap", async () => {
    api.signIn();
    const ok = await (
      await api.json("/api/users/me/custom-section/preview", "POST", { customSection: "**hi**<script>x</script>" })
    ).json();
    expect(ok.html).toContain("<strong>hi</strong>");
    expect(ok.html).not.toContain("<script");
    const big = await api.json("/api/users/me/custom-section/preview", "POST", { customSection: "x".repeat(20_001) });
    expect(big.status).toBe(400);
  });

  test("privacy toggle validates a boolean", async () => {
    api.signIn();
    vi.mocked(usersService.setPrivacy).mockResolvedValue(userRow({ id: "me", isPrivate: true }));
    expect((await (await api.json("/api/users/me/privacy", "PATCH", { isPrivate: true })).json()).user.isPrivate).toBe(
      true,
    );
    expect((await api.json("/api/users/me/privacy", "PATCH", { isPrivate: "yes" })).status).toBe(400);
  });

  test("avatar upload passes the bare content type and the raw bytes", async () => {
    api.signIn();
    vi.mocked(usersService.setAvatar).mockResolvedValue(userRow({ id: "me", avatarUrl: "/api/uploads/a.png" }));
    const res = await api.request("/api/users/me/avatar", {
      method: "POST",
      headers: { "content-type": "image/png; charset=binary" },
      body: new Uint8Array([1, 2, 3]),
    });
    expect((await res.json()).user.avatarUrl).toBe("/api/uploads/a.png");
    expect(usersService.setAvatar).toHaveBeenCalledWith("me", new Uint8Array([1, 2, 3]), "image/png");
  });

  test("avatar removal", async () => {
    api.signIn();
    vi.mocked(usersService.removeAvatar).mockResolvedValue(userRow({ id: "me" }));
    expect((await api.request("/api/users/me/avatar", { method: "DELETE" })).status).toBe(200);
  });

  test("follow requests, mutes, blocks and follower removal", async () => {
    api.signIn();
    vi.mocked(followRequestsService.list).mockResolvedValue([]);
    vi.mocked(relationsService.listRelation).mockResolvedValue([]);
    vi.mocked(followRequestsService.approve).mockResolvedValue();
    vi.mocked(followRequestsService.reject).mockResolvedValue();
    vi.mocked(followsService.removeFollower).mockResolvedValue();
    expect(await (await api.request("/api/users/me/follow-requests")).json()).toEqual({ items: [] });
    await api.request("/api/users/me/follow-requests/r1/approve", { method: "POST" });
    expect(followRequestsService.approve).toHaveBeenCalledWith("me", "r1");
    await api.request("/api/users/me/follow-requests/r1/reject", { method: "POST" });
    expect(followRequestsService.reject).toHaveBeenCalledWith("me", "r1");
    await api.request("/api/users/me/muted");
    await api.request("/api/users/me/blocked");
    expect(vi.mocked(relationsService.listRelation).mock.calls).toEqual([
      ["mute", "me"],
      ["block", "me"],
    ]);
    await api.request("/api/users/me/followers/ann@x.example", { method: "DELETE" });
    expect(followsService.removeFollower).toHaveBeenCalledWith("me", "ann@x.example");
  });

  test("'me' is never captured as a username by the public profile route", async () => {
    api.signIn();
    vi.mocked(followRequestsService.list).mockResolvedValue([]);
    await api.request("/api/users/me/follow-requests");
    expect(followsService.profile).not.toHaveBeenCalled();
  });
});

describe("public profiles", () => {
  test("suggested follows are public", async () => {
    vi.mocked(usersService.suggestedFollows).mockResolvedValue([]);
    expect(await (await api.request("/api/users/suggested")).json()).toEqual({ items: [] });
    expect(usersService.suggestedFollows).toHaveBeenCalledWith(null);
  });

  test("a profile carries counts and relation state", async () => {
    vi.mocked(followsService.profile).mockResolvedValue({
      user: bob,
      counts: { followers: 1, following: 2 },
      followState: "none",
      isFollowing: false,
      isMuted: false,
      isBlocked: false,
      locked: false,
    } as never);
    const body = await (await api.request("/api/users/bob")).json();
    expect(body).toMatchObject({ counts: { followers: 1, following: 2 }, followState: "none", locked: false });
    expect(body.user.customSection).toBe("# Secret");
    expect(body.user).not.toHaveProperty("email");
  });

  test("a locked profile withholds the custom section", async () => {
    vi.mocked(followsService.profile).mockResolvedValue({
      user: bob,
      counts: { followers: 0, following: 0 },
      followState: "none",
      isFollowing: false,
      isMuted: false,
      isBlocked: false,
      locked: true,
    } as never);
    const body = await (await api.request("/api/users/bob")).json();
    expect(body.user.customSection).toBe("");
    expect(body.user.customSectionHtml).toBe("");
  });

  test("an unknown profile is a 404", async () => {
    vi.mocked(followsService.profile).mockRejectedValue(notFound("User not found."));
    expect((await api.request("/api/users/ghost")).status).toBe(404);
  });

  test("followers / following", async () => {
    vi.mocked(followsService.followersOf).mockResolvedValue([]);
    vi.mocked(followsService.followingOf).mockResolvedValue([]);
    api.signIn();
    await api.request("/api/users/bob/followers");
    await api.request("/api/users/bob/following");
    expect(followsService.followersOf).toHaveBeenCalledWith("bob", "me");
    expect(followsService.followingOf).toHaveBeenCalledWith("bob", "me");
  });

  test("posts and recommendations 404 for an unknown user", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(undefined);
    expect((await api.request("/api/users/ghost/posts")).status).toBe(404);
    expect((await api.request("/api/users/ghost/recommendations")).status).toBe(404);
  });

  test("posts and recommendations page for the viewer", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(bob);
    vi.mocked(postsService.listByAuthor).mockResolvedValue({ items: [postWithAuthor({ id: "p1" })], nextCursor: null });
    vi.mocked(recommendationsService.listByUser).mockResolvedValue({ items: [], nextCursor: null });
    expect(await (await api.request("/api/users/bob/posts")).json()).toEqual({
      items: [{ id: "p1" }],
      nextCursor: null,
    });
    await api.request("/api/users/bob/recommendations");
    expect(postsService.listByAuthor).toHaveBeenCalledWith("bob", null, null);
    expect(recommendationsService.listByUser).toHaveBeenCalledWith("bob", null, null);
  });

  test("a deleted account's posts tab is not found", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ id: "bob", deletedAt: new Date() }));
    vi.mocked(postsService.listByAuthor).mockResolvedValue({ items: [], nextCursor: null });
    expect((await api.request("/api/users/bob/posts")).status).toBe(404);
  });
});

describe("relations", () => {
  test("follow answers 201 with the resulting state", async () => {
    api.signIn();
    vi.mocked(followsService.follow).mockResolvedValue({ state: "requested" });
    const res = await api.request("/api/users/bob/follow", { method: "POST" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, state: "requested" });
  });

  test("unfollow, mute, unmute, block, unblock", async () => {
    api.signIn();
    vi.mocked(followsService.unfollow).mockResolvedValue();
    vi.mocked(relationsService.setLocal).mockResolvedValue();
    await api.request("/api/users/bob/follow", { method: "DELETE" });
    expect(followsService.unfollow).toHaveBeenCalledWith("me", "bob");
    expect((await api.request("/api/users/bob/mute", { method: "POST" })).status).toBe(201);
    expect((await api.request("/api/users/bob/mute", { method: "DELETE" })).status).toBe(200);
    expect((await api.request("/api/users/bob/block", { method: "POST" })).status).toBe(201);
    expect((await api.request("/api/users/bob/block", { method: "DELETE" })).status).toBe(200);
    expect(vi.mocked(relationsService.setLocal).mock.calls).toEqual([
      ["mute", "me", "bob", true],
      ["mute", "me", "bob", false],
      ["block", "me", "bob", true],
      ["block", "me", "bob", false],
    ]);
  });
});
