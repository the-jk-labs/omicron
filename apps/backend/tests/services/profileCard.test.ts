// SPDX-License-Identifier: AGPL-3.0-or-later
// Caching on real files in a temp UPLOADS_DIR; the drawing is covered by
// tests/lib/profileCard.test.ts, so the renderer is stubbed here.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userRow } from "../fixtures.ts";

vi.mock(import("@/lib/profileCard.ts"));
vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/instanceSetup.ts"));

import { config } from "@/config.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { renderProfileCard } from "@/lib/profileCard.ts";
import { getAppDomain } from "@/services/instanceSetup.ts";
import { profileCard } from "@/services/profileCard.ts";

const byText = (a: unknown, b: unknown) => String(a).localeCompare(String(b));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 9]);
const AVATAR = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]);
let tmp: string;
const originalUploads = config.UPLOADS_DIR;
const cards = () => readdirSync(join(tmp, "og-profiles"));

function setFollowers(n: number) {
  vi.mocked(followsRepo.counts).mockResolvedValue({ followers: n, following: 0 });
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "omicron-pcard-"));
  config.UPLOADS_DIR = tmp;
  vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ username: "ada", displayName: "Ada", bio: "Hi" }));
  setFollowers(1);
  vi.mocked(postsRepo.countsByAuthor).mockResolvedValue({ draft: 3, scheduled: 0, published: 2 });
  vi.mocked(getAppDomain).mockResolvedValue("blog.example");
  vi.mocked(renderProfileCard).mockResolvedValue(JPEG);
});

afterEach(() => {
  config.UPLOADS_DIR = originalUploads;
  rmSync(tmp, { recursive: true, force: true });
});

test("draws the public header with pluralised stats (published posts only)", async () => {
  expect(await profileCard("ada")).toEqual(JPEG);
  expect(renderProfileCard).toHaveBeenCalledWith(
    { displayName: "Ada", handle: "@ada", bio: "Hi", stats: "2 articles · 1 follower", site: "blog.example" },
    null,
  );
  expect(cards()).toEqual([expect.stringMatching(/^ada-[0-9a-f]{16}\.jpg$/)]);
});

test("singular and zero counts read naturally", async () => {
  vi.mocked(postsRepo.countsByAuthor).mockResolvedValue({ draft: 0, scheduled: 0, published: 1 });
  setFollowers(0);
  await profileCard("ada");
  expect(vi.mocked(renderProfileCard).mock.calls[0][0].stats).toBe("1 article · 0 followers");
});

test("reads a locally stored avatar off disk", async () => {
  writeFileSync(join(tmp, "a1.png"), AVATAR);
  vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ username: "ada", avatarUrl: "/api/uploads/a1.png" }));
  await profileCard("ada");
  expect(new Uint8Array(vi.mocked(renderProfileCard).mock.calls[0][1]!)).toEqual(AVATAR);
});

test.for(["https://cdn.example/a.png", "/api/uploads/../../etc/passwd", "/api/uploads/missing.png"])(
  "falls back to initials for avatar %j",
  async (avatarUrl) => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ username: "ada", avatarUrl }));
    await profileCard("ada");
    expect(vi.mocked(renderProfileCard).mock.calls[0][1]).toBe(null);
  },
);

test("serves the cached card until something drawn changes", async () => {
  await profileCard("ada");
  await profileCard("ada");
  expect(renderProfileCard).toHaveBeenCalledTimes(1);
  setFollowers(2);
  await profileCard("ada");
  expect(renderProfileCard).toHaveBeenCalledTimes(2);
});

test("a new render reaps this profile's superseded cards, and only this profile's", async () => {
  mkdirSync(join(tmp, "og-profiles"));
  writeFileSync(join(tmp, "og-profiles", "ada-0000000000000000.jpg"), "old");
  writeFileSync(join(tmp, "og-profiles", "adam-0000000000000000.jpg"), "someone else");
  writeFileSync(join(tmp, "og-profiles", "bob-0000000000000000.jpg"), "someone else");
  await profileCard("ada");
  // "ada-" sorts before "adam-", so the expected order is already sorted.
  expect(cards().toSorted(byText)).toEqual([
    expect.stringMatching(/^ada-[0-9a-f]{16}\.jpg$/),
    "adam-0000000000000000.jpg",
    "bob-0000000000000000.jpg",
  ]);
  expect(existsSync(join(tmp, "og-profiles", "ada-0000000000000000.jpg"))).toBe(false);
});

test.for([
  ["an unknown", undefined],
  ["a suspended", userRow({ suspendedAt: new Date() })],
  ["a deleted", userRow({ deletedAt: new Date() })],
])("%s account is a 404", async ([, user]) => {
  vi.mocked(usersRepo.findByUsername).mockResolvedValue(user as never);
  await expect(profileCard("ada")).rejects.toMatchObject({ status: 404 });
});

test("a name the font cannot draw yields null and caches nothing", async () => {
  vi.mocked(renderProfileCard).mockResolvedValue(null);
  expect(await profileCard("ada")).toBe(null);
  expect(existsSync(join(tmp, "og-profiles"))).toBe(false);
});

test("a cache directory that cannot be created still returns the card", async () => {
  writeFileSync(join(tmp, "og-profiles"), "not a directory");
  expect(await profileCard("ada")).toEqual(JPEG);
});
