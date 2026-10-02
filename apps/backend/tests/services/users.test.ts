// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { userRow } from "../fixtures.ts";

// Real files in a temp UPLOADS_DIR; writeFile is a pass-through spy so a
// test can inject a disk failure.
vi.mock(import("node:fs/promises"), async (importOriginal) => {
  const fs = await importOriginal();
  return { ...fs, writeFile: vi.fn<typeof fs.writeFile>(fs.writeFile) };
});
vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/db/repositories/profileLinks.ts"));
vi.mock(import("@/db/repositories/tags.ts"));
vi.mock(import("@/db/repositories/uploads.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/followRequests.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import { config } from "@/config.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as linksRepo from "@/db/repositories/profileLinks.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as uploadsRepo from "@/db/repositories/uploads.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { queue } from "@/queue/queue.ts";
import * as followRequests from "@/services/followRequests.ts";
import {
  MAX_AVATAR_BYTES,
  type ProfileLinkInput,
  MAX_CUSTOM_SECTION_LEN,
  profileLinks,
  removeAvatar,
  setAvatar,
  setPrivacy,
  suggestedFollows,
  updateProfile,
} from "@/services/users.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let tmp: string;
const originalUploads = config.UPLOADS_DIR;
const stored = () => (existsSync(config.UPLOADS_DIR) ? readdirSync(config.UPLOADS_DIR) : []);

afterEach(() => {
  config.UPLOADS_DIR = originalUploads;
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "omicron-avatar-"));
  config.UPLOADS_DIR = join(tmp, "uploads");
  vi.mocked(usersRepo.update).mockImplementation(async (id, patch) => userRow({ id, ...patch }));
  vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "me" }));
  vi.mocked(tagsRepo.tagsForUser).mockResolvedValue([]);
  vi.mocked(linksRepo.listForUser).mockResolvedValue([]);
  vi.mocked(uploadsRepo.createWithinQuota).mockResolvedValue({ ok: true });
  vi.mocked(uploadsRepo.removeByFilename).mockResolvedValue(undefined);
});

describe("updateProfile", () => {
  test("patches only the provided columns and federates an actor update", async () => {
    const out = await updateProfile("me", { displayName: "  Ada L.  ", bio: " hi " });
    expect(usersRepo.update).toHaveBeenCalledWith("me", { displayName: "Ada L.", bio: "hi" });
    expect(out.user.displayName).toBe("Ada L.");
    expect(queue.add).toHaveBeenCalledWith("federate_actor_update", { userId: "me" });
  });

  test("a tags/links-only update reads the user instead of an empty UPDATE", async () => {
    await updateProfile("me", { tags: ["#Deno"] });
    expect(usersRepo.update).not.toHaveBeenCalled();
    expect(usersRepo.findById).toHaveBeenCalledWith("me");
    expect(tagsRepo.setUserTags).toHaveBeenCalledWith("me", ["deno"]);
  });

  test.for(["", "   ", "x".repeat(61)])("refuses display name %j", async (displayName) => {
    await expect(updateProfile("me", { displayName })).rejects.toMatchObject({ status: 400 });
  });

  test("accepts a 60-character display name", async () => {
    await expect(updateProfile("me", { displayName: "x".repeat(60) })).resolves.toBeDefined();
  });

  test("bounds the bio at 500 characters", async () => {
    await expect(updateProfile("me", { bio: "x".repeat(500) })).resolves.toBeDefined();
    await expect(updateProfile("me", { bio: "x".repeat(501) })).rejects.toMatchObject({ status: 400 });
  });

  test("measures the bio limit after trimming", async () => {
    await expect(updateProfile("me", { bio: `${"x".repeat(499)}\n\n` })).resolves.toBeDefined();
  });

  test("an empty public email clears it; a malformed one is refused", async () => {
    await updateProfile("me", { publicEmail: "   " });
    expect(usersRepo.update).toHaveBeenCalledWith("me", { publicEmail: "" });
    for (const bad of ["nope", "a@b", "a b@c.d", "@c.d", `${"x".repeat(250)}@c.de`]) {
      await expect(updateProfile("me", { publicEmail: bad })).rejects.toMatchObject({ status: 400 });
    }
    await updateProfile("me", { publicEmail: " hi@example.com " });
    expect(usersRepo.update).toHaveBeenLastCalledWith("me", { publicEmail: "hi@example.com" });
  });

  test("renders and sanitizes the custom section on write", async () => {
    await updateProfile("me", { customSection: "  # Hi\n\n<script>alert(1)</script>  " });
    const patch = vi.mocked(usersRepo.update).mock.calls[0][1] as { customSection: string; customSectionHtml: string };
    expect(patch.customSection).toBe("# Hi\n\n<script>alert(1)</script>");
    expect(patch.customSectionHtml).toContain("<h1");
    expect(patch.customSectionHtml).not.toContain("<script");
  });

  test("bounds the custom section", async () => {
    await expect(updateProfile("me", { customSection: "x".repeat(MAX_CUSTOM_SECTION_LEN) })).resolves.toBeDefined();
    await expect(updateProfile("me", { customSection: "x".repeat(MAX_CUSTOM_SECTION_LEN + 1) })).rejects.toMatchObject({
      status: 400,
    });
  });

  test("caps profile tags at ten distinct ones", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => `t${i}`);
    await expect(updateProfile("me", { tags: ten })).resolves.toBeDefined();
    await expect(updateProfile("me", { tags: [...ten, "t10"] })).rejects.toMatchObject({ status: 400 });
  });

  test("validates and normalizes links", async () => {
    await updateProfile("me", {
      links: [
        { platform: "github", url: "github.com/ada", label: "  Code  " },
        { platform: "xmpp", url: "xmpp:ada@jabber.org" },
      ],
    });
    expect(linksRepo.replaceForUser).toHaveBeenCalledWith("me", [
      { platform: "github", url: "https://github.com/ada", label: "Code" },
      { platform: "xmpp", url: "xmpp:ada@jabber.org", label: "" },
    ]);
  });

  test("truncates a long link label rather than refusing it", async () => {
    await updateProfile("me", { links: [{ platform: "website", url: "example.com", label: "x".repeat(100) }] });
    expect(vi.mocked(linksRepo.replaceForUser).mock.calls[0][1][0].label).toHaveLength(60);
  });

  test.for([
    [{ platform: "myspace", url: "example.com" }, "Unknown link type."],
    [{ platform: "github", url: "javascript:alert(1)" }, "Each link needs a valid web address."],
    [{ platform: "github" }, "Each link needs a valid web address."],
  ])("refuses link %o", async ([link, message]) => {
    await expect(updateProfile("me", { links: [link as ProfileLinkInput] })).rejects.toMatchObject({
      status: 400,
      message,
    });
  });

  test("refuses more than ten links", async () => {
    const links = Array.from({ length: 11 }, () => ({ platform: "website", url: "example.com" }));
    await expect(updateProfile("me", { links })).rejects.toMatchObject({ status: 400 });
  });

  test("an empty link list clears them", async () => {
    await updateProfile("me", { links: [] });
    expect(linksRepo.replaceForUser).toHaveBeenCalledWith("me", []);
  });

  test("a rejected update leaves the profile tags untouched", async () => {
    await updateProfile("me", { tags: ["new"], links: [{ platform: "myspace", url: "x.com" }] }).catch(() => {});
    expect(tagsRepo.setUserTags).not.toHaveBeenCalled();
  });
});

describe("setPrivacy", () => {
  test("going private changes only the flag", async () => {
    await setPrivacy("me", true);
    expect(usersRepo.update).toHaveBeenCalledWith("me", { isPrivate: true });
    expect(followsRepo.pendingInboundEdges).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith("federate_actor_update", { userId: "me" });
  });

  test("going public approves every pending request", async () => {
    vi.mocked(followsRepo.pendingInboundEdges).mockResolvedValue([{ id: "f1" }, { id: "f2" }] as never);
    await setPrivacy("me", false);
    expect(vi.mocked(followRequests.approve).mock.calls).toEqual([
      ["me", "f1"],
      ["me", "f2"],
    ]);
  });
});

describe("suggestedFollows", () => {
  const pool = Array.from({ length: 20 }, (_, i) => ({
    id: `u${i}`,
    username: `user${i}`,
    displayName: `User ${i}`,
    avatarUrl: null,
    followerCount: 20 - i,
  }));

  test("picks distinct accounts from the pool with their follower counts", async () => {
    vi.mocked(usersRepo.suggested).mockResolvedValue(pool);
    const out = await suggestedFollows("me");
    expect(out).toHaveLength(3);
    expect(new Set(out.map((s) => s.id)).size).toBe(3);
    for (const s of out) {
      expect(s.remote).toBe(false);
      expect(s.followerCount).toBe(pool.find((p) => p.id === s.id)!.followerCount);
    }
    expect(usersRepo.suggested).toHaveBeenCalledWith("me", 20);
  });

  test("returns the whole pool when it is smaller than asked", async () => {
    vi.mocked(usersRepo.suggested).mockResolvedValue(pool.slice(0, 2));
    expect(await suggestedFollows(null, 5)).toHaveLength(2);
  });

  test("is empty for an empty pool", async () => {
    vi.mocked(usersRepo.suggested).mockResolvedValue([]);
    expect(await suggestedFollows(null)).toEqual([]);
  });

  test("varies between calls", async () => {
    vi.mocked(usersRepo.suggested).mockResolvedValue(pool);
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) for (const s of await suggestedFollows(null)) seen.add(s.id);
    expect(seen.size).toBeGreaterThan(3);
  });
});

test("profileLinks delegates", async () => {
  await profileLinks("me");
  expect(linksRepo.listForUser).toHaveBeenCalledWith("me");
});

describe("setAvatar", () => {
  test("stores the file, points the avatar at it and federates", async () => {
    const user = await setAvatar("me", PNG, "image/png");
    expect(user.avatarUrl).toMatch(/^\/api\/uploads\/[0-9a-f-]{36}\.png$/);
    const filename = user.avatarUrl!.split("/").at(-1);
    expect(stored()).toEqual([filename]);
    expect(new Uint8Array(readFileSync(join(config.UPLOADS_DIR, filename!)))).toEqual(PNG);
    expect(queue.add).toHaveBeenCalledWith("federate_actor_update", { userId: "me" });
  });

  test("refuses an unsupported type, an empty file, a lie about the format, and >2 MB", async () => {
    await expect(setAvatar("me", PNG, "image/svg+xml")).rejects.toMatchObject({ status: 400 });
    await expect(setAvatar("me", new Uint8Array(), "image/png")).rejects.toMatchObject({ status: 400 });
    await expect(setAvatar("me", PNG, "image/jpeg")).rejects.toMatchObject({ status: 400 });
    const big = new Uint8Array(MAX_AVATAR_BYTES + 1);
    big.set(PNG);
    await expect(setAvatar("me", big, "image/png")).rejects.toMatchObject({ status: 400 });
    expect(usersRepo.update).not.toHaveBeenCalled();
  });

  test("a quota breach is a 413 and the avatar is unchanged", async () => {
    vi.mocked(uploadsRepo.createWithinQuota).mockResolvedValue({ ok: false, reason: "user" });
    await expect(setAvatar("me", PNG, "image/png")).rejects.toMatchObject({ status: 413 });
    expect(usersRepo.update).not.toHaveBeenCalled();
  });

  test("a failed write releases the reservation", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("EACCES"));
    await expect(setAvatar("me", PNG, "image/png")).rejects.toThrow("EACCES");
    expect(uploadsRepo.removeByFilename).toHaveBeenCalled();
    expect(usersRepo.update).not.toHaveBeenCalled();
  });
});

test("removeAvatar clears it and federates", async () => {
  expect((await removeAvatar("me")).avatarUrl).toBe(null);
  expect(usersRepo.update).toHaveBeenCalledWith("me", { avatarUrl: null });
  expect(queue.add).toHaveBeenCalledWith("federate_actor_update", { userId: "me" });
});
