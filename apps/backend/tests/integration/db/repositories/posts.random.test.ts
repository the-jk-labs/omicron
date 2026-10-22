// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, expect, test } from "vitest";
import { db } from "@/db/client.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as recsRepo from "@/db/repositories/recommendations.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import { follows } from "@/db/schema.ts";
import {
  closeDb,
  follow,
  followTag,
  mkPost,
  mkRemoteActor,
  mkRemotePost,
  mkTag,
  mkUser,
  recommend,
  resetDb,
  tagPost,
} from "../../harness.ts";

afterAll(closeDb);
beforeEach(resetDb);

const random = (scope: postsRepo.RandomPostScope = "global", viewer: string | null = null) =>
  postsRepo.findRandom(scope, viewer, null);

test("an empty archive has no random post", async () => {
  expect(await random()).toBe(null);
});

test("filters the full archive before sampling, including posts older than a feed page", async () => {
  const author = await mkUser("author");
  const old = await postsRepo.create({
    authorId: author.id,
    title: "Old",
    contentHtml: "<p>x</p>",
    language: "en",
    createdAt: new Date("2000-01-01"),
  });
  for (let i = 0; i < 50; i++) {
    await postsRepo.create({ authorId: author.id, title: `Recent ${i}`, contentHtml: "<p>x</p>", language: "az" });
  }
  expect((await postsRepo.findRandom("global", null, { mode: "show", langs: ["en"] }))?.post.id).toBe(old.id);
  expect((await postsRepo.findRandom("local", null, { mode: "hide", langs: ["az"] }))?.post.id).toBe(old.id);
  expect(await postsRepo.findRandom("global", null, { mode: "show", langs: ["tr"] })).toBe(null);
});

test("unknown-language posts remain eligible in both filter modes", async () => {
  const author = await mkUser("author");
  const post = await mkPost(author.id, "unknown");
  for (const mode of ["show", "hide"] as const) {
    expect((await postsRepo.findRandom("global", null, { mode, langs: ["en"] }))?.post.id).toBe(post.id);
  }
});

test("Local excludes remote posts and Global excludes microblog Notes", async () => {
  const actor = await mkRemoteActor("writer@remote.example");
  await mkRemotePost(actor.id, "https://remote.example/note", { apType: "Note" });
  expect(await random()).toBe(null);
  const article = await mkRemotePost(actor.id, "https://remote.example/article");
  expect((await random())?.post.id).toBe(article.id);
  expect(await random("local")).toBe(null);
});

test.for(["local", "global", "for-you"] as const)("%s excludes unpublished and withdrawn posts", async (scope) => {
  const viewer = await mkUser("viewer");
  const author = await mkUser("author");
  const suspended = await mkUser("suspended", { suspended: true });
  const deleted = await mkUser("deleted", { deleted: true });
  for (const user of [author, suspended, deleted]) await follow(viewer.id, user.id);
  await mkPost(author.id, "draft", { status: "draft" });
  await mkPost(author.id, "scheduled", { status: "scheduled" });
  await mkPost(suspended.id, "withdrawn");
  await mkPost(deleted.id, "removed");
  expect(await random(scope, viewer.id)).toBe(null);
  const visible = await mkPost(author.id, "visible");
  expect((await random(scope, viewer.id))?.post.id).toBe(visible.id);
});

test("private posts require an approved follow, including a recommended post", async () => {
  const author = await mkUser("private", { isPrivate: true });
  const viewer = await mkUser("viewer");
  const booster = await mkUser("booster");
  const post = await mkPost(author.id, "private-post");
  await follow(viewer.id, booster.id);
  await recommend(booster.id, post.id);
  await follow(viewer.id, author.id, false);
  expect(await random()).toBe(null);
  for (const scope of ["global", "local", "for-you"] as const) {
    expect(await random(scope, viewer.id)).toBe(null);
  }
  const approved = await mkUser("approved");
  await follow(approved.id, author.id);
  for (const scope of ["global", "local", "for-you"] as const) {
    expect((await random(scope, approved.id))?.post.id).toBe(post.id);
    expect((await random(scope, author.id))?.post.id).toBe(post.id);
  }
});

test.for(["local", "global", "for-you"] as const)(
  "%s respects AI preferences and local mutes/blocks in both directions",
  async (scope) => {
    const viewer = await mkUser("viewer", { showAiAssistedPosts: false });
    const assisted = await mkUser("assisted");
    const muted = await mkUser("muted");
    const blocked = await mkUser("blocked");
    const blocker = await mkUser("blocker");
    for (const author of [assisted, muted, blocked, blocker]) await follow(viewer.id, author.id);
    await mkPost(assisted.id, "ai", { aiAssisted: true });
    for (const author of [muted, blocked, blocker]) await mkPost(author.id, "hidden");
    await relationsRepo.addLocal("mute", viewer.id, muted.id);
    await relationsRepo.addLocal("block", viewer.id, blocked.id);
    await relationsRepo.addLocal("block", blocker.id, viewer.id);
    expect(await random(scope, viewer.id)).toBe(null);
    const human = await mkPost(assisted.id, "human");
    expect((await random(scope, viewer.id))?.post.id).toBe(human.id);
  },
);

test("remote mutes and blocks exclude cached articles", async () => {
  const viewer = await mkUser("viewer");
  for (const kind of ["mute", "block"] as const) {
    const actor = await mkRemoteActor(`${kind}@remote.example`);
    await mkRemotePost(actor.id, `https://remote.example/${kind}`);
    await relationsRepo.addRemote(kind, viewer.id, actor.id);
  }
  expect(await random("global", viewer.id)).toBe(null);
});

test("For you includes followed remote authors but not pending follows", async () => {
  const viewer = await mkUser("viewer");
  const pending = await mkUser("pending");
  const actor = await mkRemoteActor("author@remote.example");
  const post = await mkRemotePost(actor.id, "https://remote.example/article");
  await db.insert(follows).values([
    { followerId: viewer.id, remoteFolloweeId: actor.id, approved: true },
    { followerId: pending.id, remoteFolloweeId: actor.id, approved: false },
  ]);
  expect((await random("for-you", viewer.id))?.post.id).toBe(post.id);
  expect(await random("for-you", pending.id)).toBe(null);
});

test("For you includes own posts, followed authors, followed tags and recommendations, not strangers", async () => {
  const viewer = await mkUser("viewer");
  const stranger = await mkUser("stranger");
  const followed = await mkUser("followed");
  await follow(viewer.id, followed.id);
  const unrelated = await mkPost(stranger.id, "unrelated");
  expect(await random("for-you", viewer.id)).toBe(null);
  expect(await random("for-you")).toBe(null);

  for (const source of ["own", "followed", "tag", "recommendation", "remote-recommendation"] as const) {
    const post = await mkPost(source === "own" ? viewer.id : source === "followed" ? followed.id : stranger.id, source);
    if (source === "tag") {
      const tag = await mkTag("reading");
      await followTag(viewer.id, tag.id);
      await tagPost(post.id, tag.id);
    }
    if (source === "recommendation") await recommend(followed.id, post.id);
    if (source === "remote-recommendation") {
      const actor = await mkRemoteActor("recommender@remote.example");
      await db.insert(follows).values({ followerId: viewer.id, remoteFolloweeId: actor.id, approved: true });
      await recsRepo.addRemote(post.id, actor.id);
    }
    expect((await random("for-you", viewer.id))?.post.id).toBe(post.id);
    await postsRepo.remove(post.id);
  }
  expect((await postsRepo.findById(unrelated.id))?.post.id).toBe(unrelated.id);
});

test("rolls can select both old and new posts without recency ranking", async () => {
  const author = await mkUser("author");
  const old = await mkPost(author.id, "old", { createdAt: new Date("2000-01-01") });
  const recent = await mkPost(author.id, "recent");
  const selected = new Set<string>();
  for (let i = 0; i < 100; i++) selected.add((await random())!.post.id);
  expect(selected).toEqual(new Set([old.id, recent.id]));
});
