// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import * as tagsRepo from "@/db/repositories/tags.ts";
import {
  closeDb,
  follow,
  followTag,
  mkPost,
  mkRemoteActor,
  mkRemotePost,
  mkTag,
  mkUser,
  resetDb,
} from "../../harness.ts";

const byText = (a: unknown, b: unknown) => String(a).localeCompare(String(b));

afterAll(closeDb);
beforeEach(resetDb);

const at = (n: number) => new Date(Date.UTC(2026, 0, n));

describe("post tags", () => {
  test("replace the post's set, deduplicated, resolving aliases, alphabetical on read", async () => {
    const ada = await mkUser("ada");
    const [p1, p2] = [await mkPost(ada.id, "p1"), await mkPost(ada.id, "p2")];
    await mkTag("unix");
    await tagsRepo.createAlias("linux-ish", "unix");
    await tagsRepo.setPostTags(p1.id, ["zig", "linux-ish", "unix", "zig"]);
    expect(await tagsRepo.tagsForPost(p1.id)).toEqual([
      { slug: "unix", name: "unix" },
      { slug: "zig", name: "zig" },
    ]);
    await tagsRepo.setPostTags(p1.id, ["deno"]);
    expect((await tagsRepo.tagsForPost(p1.id)).map((t) => t.slug)).toEqual(["deno"]);
    await tagsRepo.setPostTags(p1.id, []);
    expect(await tagsRepo.tagsForPost(p1.id)).toEqual([]);

    await tagsRepo.setPostTags(p2.id, ["deno"]);
    const many = await tagsRepo.tagsForPosts([p1.id, p2.id]);
    expect([...many.keys()]).toEqual([p2.id]);
    expect((await tagsRepo.tagsForPosts([])).size).toBe(0);
  });
});

describe("aliases and merges", () => {
  test("an alias resolves to its target; an alias cannot shadow a real tag or point nowhere", async () => {
    await mkTag("perseid");
    await tagsRepo.createAlias("perceid", "perseid");
    await tagsRepo.createAlias("perceid", "perseid");
    expect(await tagsRepo.resolveAlias("perceid")).toBe("perseid");
    expect(await tagsRepo.resolveAlias("other")).toBe("other");
    expect((await tagsRepo.findBySlug("perceid"))?.slug).toBe("perseid");
    expect(await tagsRepo.findBySlug("missing")).toBe(null);
    expect((await tagsRepo.findAlias("perceid"))?.aliasSlug).toBe("perceid");
    expect(await tagsRepo.listAliases()).toEqual([expect.objectContaining({ aliasSlug: "perceid", slug: "perseid" })]);
    await expect(tagsRepo.createAlias("x", "missing")).rejects.toThrow('Target tag "missing" not found');
    await mkTag("real");
    await expect(tagsRepo.createAlias("real", "perseid")).rejects.toThrow("already a real tag");
  });

  test("merging moves every kind of edge, leaves an alias and drops the source", async () => {
    const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
    const eve = await mkRemoteActor("eve@remote.example");
    const post = await mkPost(ada.id, "p");
    const both = await mkPost(ada.id, "both");
    await tagsRepo.setPostTags(post.id, ["js"]);
    await tagsRepo.setPostTags(both.id, ["js", "javascript"]);
    await tagsRepo.setUserTags(ada.id, ["js"]);
    await tagsRepo.setRemoteActorTags(eve.id, ["js"]);
    const js = await tagsRepo.findBySlug("js");
    const javascript = await tagsRepo.findBySlug("javascript");
    await tagsRepo.follow(bob.id, js!.id);
    await tagsRepo.follow(ada.id, js!.id);
    await tagsRepo.follow(ada.id, javascript!.id);

    await tagsRepo.mergeTags("js", "javascript");

    expect((await tagsRepo.tagsForPost(post.id)).map((t) => t.slug)).toEqual(["javascript"]);
    expect((await tagsRepo.tagsForPost(both.id)).map((t) => t.slug)).toEqual(["javascript"]);
    expect((await tagsRepo.tagsForUser(ada.id)).map((t) => t.slug)).toEqual(["javascript"]);
    expect((await tagsRepo.tagsForRemoteActor(eve.id)).map((t) => t.slug)).toEqual(["javascript"]);
    expect(await tagsRepo.followerCount(javascript!.id)).toBe(2);
    expect(await tagsRepo.resolveAlias("js")).toBe("javascript");
    expect((await tagsRepo.findBySlug("js"))?.id).toBe(javascript!.id);
  });

  test("merge refuses a self-merge or a missing tag", async () => {
    await mkTag("a");
    await expect(tagsRepo.mergeTags("a", "a")).rejects.toThrow("same");
    await expect(tagsRepo.mergeTags("missing", "a")).rejects.toThrow('Source tag "missing" not found');
    await expect(tagsRepo.mergeTags("a", "missing")).rejects.toThrow('Target tag "missing" not found');
  });
});

describe("counts and discovery", () => {
  async function seed() {
    const [ada, priv, sus] = [
      await mkUser("ada"),
      await mkUser("priv", { isPrivate: true }),
      await mkUser("sus", { suspended: true }),
    ];
    const eve = await mkRemoteActor("eve@remote.example");
    const visible = [
      await mkPost(ada.id, "a1", { createdAt: at(1) }),
      await mkPost(ada.id, "a2", { createdAt: at(3) }),
    ];
    const hidden = [
      await mkPost(ada.id, "draft", { status: "draft" }),
      await mkPost(priv.id, "priv"),
      await mkPost(sus.id, "sus"),
      await mkPost(ada.id, "note", { apType: "Note", createdAt: at(2) }),
    ];
    for (const p of [...visible, ...hidden]) await tagsRepo.setPostTags(p.id, ["deno"]);
    await tagsRepo.setPostTags((await mkRemotePost(eve.id, "https://remote.example/p/1")).id, ["deno"]);
    return { ada, priv };
  }

  test("postCount counts what the viewer may read", async () => {
    const { ada, priv } = await seed();
    const deno = await tagsRepo.findBySlug("deno");
    expect(await tagsRepo.postCount(deno!.id, null)).toBe(3);
    const follower = await mkUser("follower");
    await follow(follower.id, priv.id);
    expect(await tagsRepo.postCount(deno!.id, follower.id)).toBe(4);
    expect(await tagsRepo.postCount(deno!.id, ada.id)).toBe(3);
  });

  test("trending ranks by visible use", async () => {
    await seed();
    const ada = await mkUser("ada2");
    await tagsRepo.setPostTags((await mkPost(ada.id, "x")).id, ["rust"]);
    expect(await tagsRepo.trending(5)).toEqual([
      { slug: "deno", name: "deno", postCount: 3 },
      { slug: "rust", name: "rust", postCount: 1 },
    ]);
  });

  test("the sitemap takes tags on more than one visible local post", async () => {
    await seed();
    const ada = await mkUser("ada2");
    await tagsRepo.setPostTags((await mkPost(ada.id, "x")).id, ["single"]);
    const rows = await tagsRepo.listSitemapTags();
    expect(rows.map((r) => r.slug)).toEqual(["deno"]);
    // Typed Date, but the raw `max()` arrives as Postgres timestamp text.
    expect(new Date(rows[0].lastPostAt)).toEqual(at(3));
  });

  test("search is a substring match ranked by use; suggest also tolerates typos", async () => {
    const ada = await mkUser("ada");
    await tagsRepo.setPostTags((await mkPost(ada.id, "p1")).id, ["perseid", "astronomy"]);
    await tagsRepo.setPostTags((await mkPost(ada.id, "p2")).id, ["astronomy"]);
    expect((await tagsRepo.search("ono", 10)).map((t) => [t.slug, t.postCount])).toEqual([["astronomy", 2]]);
    expect((await tagsRepo.search("e", 1)).map((t) => t.slug)).toEqual(["perseid"]);
    expect((await tagsRepo.suggest("perceid", 10)).map((t) => t.slug)).toContain("perseid");
  });

  // BUG: setPostTags runs for drafts too, and search/suggest (public routes)
  // and the followed-tags list count raw post_tags edges with no visibility
  // predicate. A tag used only on a draft, or on a private account's posts, is
  // listed with its count, so the topic of an unpublished draft can be found
  // by typing a prefix into the public tag search. tagsRepo.postCount's own
  // comment calls a count over a wider set than the list a disclosure.
  test.fails("BUG: search and suggest never surface a tag used only on a draft", async () => {
    const ada = await mkUser("ada");
    await tagsRepo.setPostTags((await mkPost(ada.id, "d", { status: "draft" })).id, ["secret-acquisition"]);
    expect(await tagsRepo.search("secret", 10)).toEqual([]);
    expect(await tagsRepo.suggest("secret", 10)).toEqual([]);
  });

  test.fails("BUG: search counts only posts an anonymous reader can see", async () => {
    await seed();
    expect((await tagsRepo.search("deno", 10))[0].postCount).toBe(3);
  });
});

describe("tag follows and profile tags", () => {
  test("follow is idempotent; the followed list is newest-followed first with counts", async () => {
    const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
    const [a, b] = [await mkTag("a"), await mkTag("b")];
    await tagsRepo.follow(ada.id, a.id);
    await tagsRepo.follow(ada.id, a.id);
    await followTag(ada.id, b.id);
    await tagsRepo.setPostTags((await mkPost(bob.id, "p")).id, ["a"]);
    expect(await tagsRepo.isFollowing(ada.id, a.id)).toBe(true);
    expect(await tagsRepo.followerCount(a.id)).toBe(1);
    const followed = await tagsRepo.listFollowedByUser(ada.id);
    expect(followed.map((t) => [t.slug, t.postCount]).toSorted(byText)).toEqual([
      ["a", 1],
      ["b", 0],
    ]);
    await tagsRepo.unfollow(ada.id, a.id);
    expect(await tagsRepo.isFollowing(ada.id, a.id)).toBe(false);
  });

  test("profile tags are replaced wholesale, for local users and remote actors", async () => {
    const ada = await mkUser("ada");
    const eve = await mkRemoteActor("eve@remote.example");
    await tagsRepo.setUserTags(ada.id, ["one", "two"]);
    await tagsRepo.setUserTags(ada.id, ["three"]);
    expect(await tagsRepo.tagsForUser(ada.id)).toEqual([{ slug: "three", name: "three" }]);
    await tagsRepo.setUserTags(ada.id, []);
    expect(await tagsRepo.tagsForUser(ada.id)).toEqual([]);
    await tagsRepo.setRemoteActorTags(eve.id, ["art"]);
    await tagsRepo.setRemoteActorTags(eve.id, ["art", "music"]);
    expect((await tagsRepo.tagsForRemoteActor(eve.id)).map((t) => t.slug).toSorted(byText)).toEqual(["art", "music"]);
    await tagsRepo.setRemoteActorTags(eve.id, []);
    expect(await tagsRepo.tagsForRemoteActor(eve.id)).toEqual([]);
  });
});
