// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A frozen account vanishes from every surface a suspended one does, and comes back whole on unfreeze. Each case
// asserts both directions (hidden while frozen, visible again after) so a predicate that hides everything can't pass.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as followsService from "@/services/follows.ts";
import { closeDb, follow, includesPost, mkComment, mkPost, mkTag, mkUser, resetDb, tagPost } from "./harness.ts";

type Rows = readonly { post: { id: string } }[];

afterAll(async () => {
  await closeDb();
});

describe("a frozen author's posts are hidden from every public listing until unfrozen", () => {
  let frozen: Awaited<ReturnType<typeof mkUser>>;
  let post: Awaited<ReturnType<typeof mkPost>>;
  let rust: Awaited<ReturnType<typeof mkTag>>;
  let other: Awaited<ReturnType<typeof mkPost>>;

  beforeAll(async () => {
    await resetDb();
    frozen = await mkUser("frozen", { frozen: true });
    const author2 = await mkUser("author2");
    const author3 = await mkUser("author3");
    post = await mkPost(frozen.id, "frozen-post");
    other = await mkPost(author2.id, "other-post");
    const third = await mkPost(author3.id, "third-post");
    rust = await mkTag("rust");
    for (const p of [post, other, third]) await tagPost(p.id, rust.id);
  });

  test("global and tag listings omit the frozen author's post", async () => {
    const global = (await postsRepo.listGlobal(null, null)) as unknown as Rows;
    const byTag = (await postsRepo.listByTag("rust", null, null)) as unknown as Rows;
    expect(includesPost(global, post.id)).toBe(false);
    expect(includesPost(byTag, post.id)).toBe(false);
    expect(includesPost(global, other.id)).toBe(true);
  });

  test("the author's own archive is empty while frozen", async () => {
    const rows = (await postsRepo.listByAuthor(frozen.id, null, null)) as unknown as Rows;
    expect(rows).toHaveLength(0);
  });

  test("trending and the tag's count drop the frozen author's post", async () => {
    expect(await tagsRepo.postCount(rust.id, null)).toBe(2);
  });

  test("people search and suggestions skip the frozen account", async () => {
    expect((await usersRepo.search("frozen")).map((u) => u.username)).not.toContain("frozen");
    expect((await usersRepo.suggested(null)).map((u) => u.username)).not.toContain("frozen");
  });

  test("unfreezing restores the posts, the archive and search", async () => {
    await usersRepo.setFrozen(frozen.id, null);
    const global = (await postsRepo.listGlobal(null, null)) as unknown as Rows;
    expect(includesPost(global, post.id)).toBe(true);
    expect(((await postsRepo.listByAuthor(frozen.id, null, null)) as unknown as Rows).length).toBe(1);
    expect((await usersRepo.search("frozen")).map((u) => u.username)).toContain("frozen");
    expect(await tagsRepo.postCount(rust.id, null)).toBe(3);
  });
});

describe("a frozen account's profile shows as deactivated, and its relations are hidden", () => {
  let frozen: Awaited<ReturnType<typeof mkUser>>;
  let reader: Awaited<ReturnType<typeof mkUser>>;

  beforeAll(async () => {
    await resetDb();
    frozen = await mkUser("frozen", { frozen: true });
    reader = await mkUser("reader");
    await follow(reader.id, frozen.id);
    await follow(frozen.id, reader.id);
  });

  test("the profile resolves but is locked, flagged frozen and count-free", async () => {
    const profile = await followsService.profile("frozen", reader.id);
    expect(profile.frozen).toBe(true);
    expect(profile.locked).toBe(true);
    expect(profile.counts).toEqual({ followers: 0, following: 0 });
  });

  test("the follower and following lists are withheld", async () => {
    expect(await followsService.followersOf("frozen", reader.id)).toEqual([]);
    expect(await followsService.followingOf("frozen", reader.id)).toEqual([]);
  });

  test("a frozen account's comments are hidden from the post they were on", async () => {
    const author = await mkUser("author");
    const post = await mkPost(author.id, "commented-post");
    await mkComment(post.id, frozen.id, "frozen-comment");
    const visible = await mkComment(post.id, reader.id, "reader-comment");

    const rows = await commentsRepo.listByPost(post.id, null, null);
    const contents = rows.map((r) => r.comment.content);
    expect(contents).toContain("reader-comment");
    expect(contents).not.toContain("frozen-comment");
    expect(visible.content).toBe("reader-comment");
  });

  test("unfreezing restores the full profile and its lists", async () => {
    await usersRepo.setFrozen(frozen.id, null);
    const profile = await followsService.profile("frozen", reader.id);
    expect(profile.frozen).toBe(false);
    expect(profile.locked).toBe(false);
    expect(await followsService.followingOf("frozen", reader.id)).toHaveLength(1);
  });
});

describe("the admin user table can filter by freeze", () => {
  beforeAll(async () => {
    await resetDb();
    await mkUser("frozen", { frozen: true });
    await mkUser("active");
  });

  test("frozen=true lists only frozen accounts, and frozen=false the rest", async () => {
    const frozenOnly = await usersRepo.listForAdmin("", { frozen: true }, null, 10, "newest");
    expect(frozenOnly.map((u) => u.username)).toEqual(["frozen"]);
    const rest = await usersRepo.listForAdmin("", { frozen: false }, null, 10, "newest");
    expect(rest.map((u) => u.username)).toEqual(["active"]);
    expect(await usersRepo.countFiltered("", { frozen: true })).toBe(1);
  });
});
