// SPDX-License-Identifier: AGPL-3.0-or-later
// Lookups, writes and the listings not already covered by visibility.test.ts
// (which owns the cross-listing visibility rules).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { db } from "@/db/client.ts";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as likesRepo from "@/db/repositories/likes.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import { posts } from "@/db/schema.ts";
import { closeDb, follow, mkComment, mkPost, mkRemoteActor, mkRemotePost, mkUser, resetDb } from "../../harness.ts";

const byText = (a: unknown, b: unknown) => String(a).localeCompare(String(b));

afterAll(closeDb);
beforeEach(resetDb);

const at = (n: number) => new Date(Date.UTC(2026, 0, n));
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

function write(authorId: string, fields: Partial<typeof posts.$inferInsert> = {}) {
  return postsRepo.create({ authorId, title: "T", contentHtml: "<p>x</p>", ...fields });
}

describe("lookups", () => {
  test("findById takes a full UUID or a hex prefix (case-insensitive), oldest match first", async () => {
    const ada = await mkUser("ada");
    const post = await mkPost(ada.id, "p");
    expect((await postsRepo.findById(post.id))?.post.id).toBe(post.id);
    expect((await postsRepo.findById(post.id.slice(0, 8).toUpperCase()))?.post.id).toBe(post.id);
    expect((await postsRepo.findById(post.id))?.localAuthor?.username).toBe("ada");
    expect(await postsRepo.findById("ffffffff-ffff-ffff-ffff-ffffffffffff")).toBe(null);
  });

  // Route params and remote inReplyTo URLs reach this lookup raw, so `%` and `_`
  // must never act as LIKE wildcards, nor a short prefix match some post.
  test("findById matches nothing for a LIKE wildcard or a too-short prefix", async () => {
    const post = await mkPost((await mkUser("ada")).id, "p");
    for (const id of ["%", "_", "________", `${post.id.slice(0, 7)}%`, post.id.slice(0, 7)]) {
      expect(await postsRepo.findById(id)).toBe(null);
    }
  });

  test("by author slug, by retired slug, by apId, by external id", async () => {
    const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
    const post = await mkPost(ada.id, "hello");
    await mkPost(bob.id, "hello");
    expect((await postsRepo.findByAuthorSlug("ada", "hello"))?.post.id).toBe(post.id);
    expect(await postsRepo.findByAuthorSlug("ada", "nope")).toBe(null);

    await postsRepo.setSlug(post.id, ada.id, "hello-world");
    expect(await postsRepo.findIdByHistorySlug("ada", "hello")).toBe(post.id);
    expect(await postsRepo.findIdByHistorySlug("bob", "hello")).toBe(null);

    const eve = await mkRemoteActor("eve@remote.example");
    const remote = await mkRemotePost(eve.id, "https://remote.example/p/1");
    expect((await postsRepo.findByApId("https://remote.example/p/1"))?.id).toBe(remote.id);

    const ingested = await write(ada.id, { externalId: "cms-1" });
    expect((await postsRepo.findByExternalId(ada.id, "cms-1"))?.id).toBe(ingested.id);
    expect(await postsRepo.findByExternalId(bob.id, "cms-1")).toBeUndefined();
  });
});

describe("writes", () => {
  test("a remote post is upserted by apId, refreshing only its content", async () => {
    const eve = await mkRemoteActor("eve@remote.example");
    const data = {
      remoteActorId: eve.id,
      apId: "https://remote.example/p/1",
      title: "First",
      contentHtml: "<p>1</p>",
      apType: "Article",
      language: "en",
      createdAt: at(1),
    };
    const first = await postsRepo.upsertRemotePost(data);
    expect(first).toMatchObject({ remote: true, authorId: null, status: "published", language: "en" });
    const again = await postsRepo.upsertRemotePost({ ...data, title: "Second", language: undefined, createdAt: at(9) });
    expect(again.id).toBe(first.id);
    expect(again).toMatchObject({ title: "Second", language: null, createdAt: at(1) });
  });

  test("ingest upserts by (author, external id); the key is per author", async () => {
    const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
    const base = { title: "v1", contentHtml: "<p>1</p>", externalId: "doc" };
    const first = await postsRepo.upsertByExternalId({ ...base, authorId: ada.id });
    const second = await postsRepo.upsertByExternalId({ ...base, authorId: ada.id, title: "v2" });
    const bobs = await postsRepo.upsertByExternalId({ ...base, authorId: bob.id });
    expect(second.id).toBe(first.id);
    expect(second.title).toBe("v2");
    expect(bobs.id).not.toBe(first.id);
  });

  test("update and touch stamp updatedAt", async () => {
    const ada = await mkUser("ada");
    const post = await mkPost(ada.id, "p", { createdAt: at(1) });
    const updated = await postsRepo.update(post.id, { title: "New" });
    expect(updated.title).toBe("New");
    expect(updated.updatedAt.getTime()).toBeGreaterThan(at(1).getTime());
    await db
      .update(posts)
      .set({ updatedAt: at(1) })
      .where(eq(posts.id, post.id));
    await postsRepo.touch(post.id);
    expect((await postsRepo.findById(post.id))!.post.updatedAt.getTime()).toBeGreaterThan(at(1).getTime());
  });

  test("remove and removeByApId", async () => {
    const ada = await mkUser("ada");
    const eve = await mkRemoteActor("eve@remote.example");
    const local = await mkPost(ada.id, "p");
    await mkRemotePost(eve.id, "https://remote.example/p/1");
    await postsRepo.remove(local.id);
    await postsRepo.removeByApId("https://remote.example/p/1");
    expect(await postsRepo.listAllContent()).toEqual([]);
  });

  test("listAllLocal skips remote posts; listAllContent does not", async () => {
    const ada = await mkUser("ada");
    const eve = await mkRemoteActor("eve@remote.example");
    const local = await mkPost(ada.id, "p");
    await mkRemotePost(eve.id, "https://remote.example/p/1");
    expect((await postsRepo.listAllLocal()).map((p) => p.id)).toEqual([local.id]);
    expect(await postsRepo.listAllContent()).toHaveLength(2);
  });
});

describe("slugs", () => {
  test("slugsLike collects live and retired slugs of the form base / base-n, for one author", async () => {
    const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
    const p1 = await mkPost(ada.id, "hello");
    await mkPost(ada.id, "hello-2");
    await mkPost(ada.id, "hello-world-unrelated");
    await mkPost(ada.id, "helloworld");
    await mkPost(bob.id, "hello-3");
    await postsRepo.setSlug(p1.id, ada.id, "hello-9");
    expect([...(await postsRepo.slugsLike(ada.id, "hello"))].toSorted(byText)).toEqual([
      "hello",
      "hello-2",
      "hello-9",
      "hello-world-unrelated",
    ]);
    // A post's own slugs, live or retired, never block it.
    expect([...(await postsRepo.slugsLike(ada.id, "hello", p1.id))].toSorted(byText)).toEqual([
      "hello-2",
      "hello-world-unrelated",
    ]);
  });

  test("setSlug files the old slug, and moving back reclaims it", async () => {
    const ada = await mkUser("ada");
    const post = await mkPost(ada.id, "a");
    await postsRepo.setSlug(post.id, ada.id, "b");
    await postsRepo.setSlug(post.id, ada.id, "b");
    expect(await postsRepo.findIdByHistorySlug("ada", "a")).toBe(post.id);
    await postsRepo.setSlug(post.id, ada.id, "a");
    expect((await postsRepo.findByAuthorSlug("ada", "a"))?.post.id).toBe(post.id);
    expect(await postsRepo.findIdByHistorySlug("ada", "a")).toBe(null);
    expect(await postsRepo.findIdByHistorySlug("ada", "b")).toBe(post.id);
  });

  test("listWithoutSlug: local, titled, slugless, oldest first", async () => {
    const ada = await mkUser("ada");
    const eve = await mkRemoteActor("eve@remote.example");
    const older = await write(ada.id, { createdAt: at(1) });
    const newer = await write(ada.id, { createdAt: at(2) });
    await write(ada.id, { title: null });
    await mkPost(ada.id, "has-slug");
    await mkRemotePost(eve.id, "https://remote.example/p/1");
    expect((await postsRepo.listWithoutSlug(10)).map((p) => p.id)).toEqual([older.id, newer.id]);
    expect(await postsRepo.listWithoutSlug(1)).toHaveLength(1);
  });
});

describe("author management", () => {
  test("drafts newest first, scheduled soonest first, published newest first, with counts", async () => {
    const ada = await mkUser("ada");
    const d1 = await mkPost(ada.id, "d1", { status: "draft", createdAt: at(1) });
    const d2 = await mkPost(ada.id, "d2", { status: "draft", createdAt: at(2) });
    const later = await mkPost(ada.id, "later", { status: "scheduled", publishAt: hoursAgo(-48) });
    const sooner = await mkPost(ada.id, "sooner", { status: "scheduled", publishAt: hoursAgo(-24) });
    const pub = await mkPost(ada.id, "pub");

    expect((await postsRepo.listDraftsByAuthor(ada.id, null)).map((r) => r.post.id)).toEqual([d2.id, d1.id]);
    const scheduled = await postsRepo.listScheduledByAuthor(ada.id, null, 1);
    expect(scheduled.map((r) => r.post.id)).toEqual([sooner.id, later.id]);
    const after = await postsRepo.listScheduledByAuthor(
      ada.id,
      { createdAt: scheduled[0].post.publishAt!.toISOString(), id: sooner.id },
      1,
    );
    expect(after.map((r) => r.post.id)).toEqual([later.id]);
    expect((await postsRepo.listPublishedByAuthor(ada.id, null)).map((r) => r.post.id)).toEqual([pub.id]);
    expect(await postsRepo.countsByAuthor(ada.id)).toEqual({ draft: 2, scheduled: 2, published: 1 });
    expect((await postsRepo.listRecentByAuthor(ada.id, 2)).map((p) => p.slug)).toHaveLength(2);
    expect((await postsRepo.publishedBriefByAuthor(ada.id)).map((p) => p.slug)).toEqual(["pub"]);
  });

  test("countLocalByAuthors groups local posts per author", async () => {
    const [ada, bob, cy] = [await mkUser("ada"), await mkUser("bob"), await mkUser("cy")];
    await mkPost(ada.id, "a1");
    await mkPost(ada.id, "a2", { status: "draft" });
    await mkPost(bob.id, "b1");
    const counts = await postsRepo.countLocalByAuthors([ada.id, bob.id, cy.id]);
    expect(Object.fromEntries(counts)).toEqual({ [ada.id]: 2, [bob.id]: 1 });
    expect((await postsRepo.countLocalByAuthors([])).size).toBe(0);
  });

  test("claimDue publishes due posts once, restamping them to now", async () => {
    const ada = await mkUser("ada");
    const due = await mkPost(ada.id, "due", { status: "scheduled", publishAt: hoursAgo(1) });
    await mkPost(ada.id, "future", { status: "scheduled", publishAt: hoursAgo(-1) });
    const now = new Date();
    expect(await postsRepo.claimDue(50, now)).toEqual([{ id: due.id, authorId: ada.id }]);
    expect(await postsRepo.claimDue(50, now)).toEqual([]);
    const row = (await postsRepo.findById(due.id))!.post;
    expect(row).toMatchObject({ status: "published", publishAt: null, createdAt: now });
  });
});

async function localTitles(filter: { mode: "show" | "hide"; langs: string[] } | null) {
  return (await postsRepo.listLocal(null, null, 20, filter)).map((r) => r.post.title ?? "").toSorted(byText);
}

describe("listings", () => {
  test("the language filter: show or hide known languages; unknown always passes", async () => {
    const ada = await mkUser("ada");
    await write(ada.id, { title: "en", language: "en" });
    await write(ada.id, { title: "tr", language: "tr" });
    await write(ada.id, { title: "none", language: null });
    expect(await localTitles(null)).toEqual(["en", "none", "tr"]);
    expect(await localTitles({ mode: "show", langs: ["en"] })).toEqual(["en", "none"]);
    expect(await localTitles({ mode: "hide", langs: ["en"] })).toEqual(["none", "tr"]);
    expect(await localTitles({ mode: "hide", langs: [] })).toEqual(["en", "none", "tr"]);
    expect(
      (await postsRepo.listGlobal(null, null, 20, { mode: "show", langs: ["tr"] }))
        .map((r) => r.post.title)
        .toSorted(byText),
    ).toEqual(["none", "tr"]);
  });

  test("global, local and author timelines page on (created_at, id)", async () => {
    const ada = await mkUser("ada");
    const eve = await mkRemoteActor("eve@remote.example");
    const a = await mkPost(ada.id, "a", { createdAt: at(1) });
    const b = await mkPost(ada.id, "b", { createdAt: at(2) });
    const r = await mkRemotePost(eve.id, "https://remote.example/p/1", { createdAt: at(3) });
    expect((await postsRepo.listGlobal(null, null)).map((x) => x.post.id)).toEqual([r.id, b.id, a.id]);
    expect((await postsRepo.listLocal(null, null)).map((x) => x.post.id)).toEqual([b.id, a.id]);
    const page = await postsRepo.listByAuthor(ada.id, null, { createdAt: at(2).toISOString(), id: b.id });
    expect(page.map((x) => x.post.id)).toEqual([a.id]);
    expect((await postsRepo.listByRemoteActor(eve.id, null, null)).map((x) => x.post.id)).toEqual([r.id]);
  });

  test("a remote actor's posts exclude Notes and actors the viewer muted", async () => {
    const viewer = await mkUser("v");
    const eve = await mkRemoteActor("eve@remote.example");
    await mkRemotePost(eve.id, "https://remote.example/n/1", { apType: "Note" });
    const article = await mkRemotePost(eve.id, "https://remote.example/p/1");
    expect((await postsRepo.listByRemoteActor(eve.id, viewer.id, null)).map((x) => x.post.id)).toEqual([article.id]);
    await relationsRepo.addRemote("mute", viewer.id, eve.id);
    expect(await postsRepo.listByRemoteActor(eve.id, viewer.id, null)).toEqual([]);
  });

  test("full-text search ranks by relevance, narrows by tag and by author", async () => {
    const [ada, bob] = [await mkUser("ada"), await mkUser("bob_writer")];
    const titled = await write(ada.id, { title: "Deno runtime", contentHtml: "<p>other</p>" });
    const bodied = await write(bob.id, { title: "Other", contentHtml: "<p>about <b>deno</b> here</p>" });
    await write(ada.id, { title: "Unrelated", contentHtml: "<p>nothing</p>" });
    await write(ada.id, { title: "Deno draft", status: "draft" });
    await tagsRepo.setPostTags(bodied.id, ["runtime"]);

    expect((await postsRepo.searchPosts(null, "deno")).map((r) => r.post.id)).toEqual([titled.id, bodied.id]);
    expect((await postsRepo.searchPosts(null, "deno", 20, { tag: "runtime" })).map((r) => r.post.id)).toEqual([
      bodied.id,
    ]);
    expect((await postsRepo.searchPosts(null, "deno", 20, { author: "WRITER" })).map((r) => r.post.id)).toEqual([
      bodied.id,
    ]);
    // LIKE wildcards in the author filter are literal: "_" must not match any one character.
    expect(await postsRepo.searchPosts(null, "deno", 20, { author: "a_a" })).toEqual([]);
    expect((await postsRepo.searchPosts(null, "deno", 20, { author: "b_w" })).map((r) => r.post.id)).toEqual([
      bodied.id,
    ]);
    // Stray syntax never throws.
    await expect(postsRepo.searchPosts(null, '"unterminated -or (')).resolves.toBeInstanceOf(Array);
  });

  test("by tag: published Articles carrying the slug", async () => {
    const ada = await mkUser("ada");
    const tagged = await mkPost(ada.id, "t");
    await mkPost(ada.id, "untagged");
    await tagsRepo.setPostTags(tagged.id, ["deno"]);
    expect((await postsRepo.listByTag("deno", null, null)).map((r) => r.post.id)).toEqual([tagged.id]);
    expect(await postsRepo.listByTag("missing", null, null)).toEqual([]);
  });
});

describe("trending", () => {
  test("engagement within the window outranks recency; self-engagement and old posts don't count", async () => {
    const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
    const engaged = await mkPost(ada.id, "engaged", { createdAt: hoursAgo(5) });
    const selfLiked = await mkPost(ada.id, "self", { createdAt: hoursAgo(4) });
    await mkPost(ada.id, "fresh", { createdAt: hoursAgo(1) });
    const ancient = await mkPost(ada.id, "ancient", { createdAt: hoursAgo(24 * 40) });
    await likesRepo.add(engaged.id, bob.id);
    await mkComment(engaged.id, bob.id);
    await likesRepo.add(selfLiked.id, ada.id);
    await mkComment(selfLiked.id, ada.id);
    await likesRepo.add(ancient.id, bob.id);

    expect((await postsRepo.listTrending(null, 10)).map((r) => r.post.slug)).toEqual(["engaged", "fresh", "self"]);
    expect(await postsRepo.listTrending(null, 1)).toHaveLength(1);
  });

  // BUG: the comment count excludes the author's own replies with
  // `comments.author_id != posts.author_id`. A federated reply has a null
  // author_id, so that comparison is NULL and the reply is never counted: a
  // local post discussed across the fediverse scores as if nobody replied.
  test.fails("BUG: federated replies count toward a local post's trending score", async () => {
    const ada = await mkUser("ada");
    const eve = await mkRemoteActor("eve@remote.example");
    const discussed = await mkPost(ada.id, "discussed", { createdAt: hoursAgo(5) });
    await mkPost(ada.id, "fresh", { createdAt: hoursAgo(1) });
    await commentsRepo.createRemote({
      postId: discussed.id,
      remoteActorId: eve.id,
      apId: "https://remote.example/n/1",
      content: "great",
    });
    expect((await postsRepo.listTrending(null, 10)).map((r) => r.post.slug)).toEqual(["discussed", "fresh"]);
  });
});

describe("related posts and the sitemap", () => {
  test("related: most shared tags first, then recency; only public live local posts", async () => {
    const [ada, priv] = [await mkUser("ada"), await mkUser("priv", { isPrivate: true })];
    const eve = await mkRemoteActor("eve@remote.example");
    const reading = await mkPost(ada.id, "reading");
    const two = await mkPost(ada.id, "two", { createdAt: at(1) });
    const one = await mkPost(ada.id, "one", { createdAt: at(2) });
    const draft = await mkPost(ada.id, "draft", { status: "draft" });
    const hidden = await mkPost(priv.id, "hidden");
    const remote = await mkRemotePost(eve.id, "https://remote.example/p/1");
    await tagsRepo.setPostTags(reading.id, ["a", "b"]);
    await tagsRepo.setPostTags(two.id, ["a", "b"]);
    for (const p of [one, draft, hidden, remote]) await tagsRepo.setPostTags(p.id, ["a"]);
    expect((await postsRepo.listRelated(reading.id, 5)).map((r) => r.post.slug)).toEqual(["two", "one"]);

    const recent = await postsRepo.listRecentExcluding(reading.id, 10);
    expect(recent.map((r) => r.post.slug).toSorted(byText)).toEqual(["one", "two"]);
  });

  test("sitemap entries page newest first; counts agree; NodeInfo counts private authors too", async () => {
    const [ada, priv] = [await mkUser("ada"), await mkUser("priv", { isPrivate: true })];
    await mkPost(ada.id, "old", { createdAt: at(1) });
    await mkPost(ada.id, "new", { createdAt: at(2) });
    await mkPost(priv.id, "priv");
    expect((await postsRepo.listSitemapEntries()).map((e) => e.slug)).toEqual(["new", "old"]);
    expect(await postsRepo.listSitemapEntries(2)).toEqual([]);
    expect(await postsRepo.countSitemapEntries()).toBe(2);
    expect(await postsRepo.countLocalPublished()).toBe(3);
    expect((await postsRepo.listSitemapProfiles()).map((p) => p.username)).toEqual(["ada"]);
  });
});

test("an approved follower reads a private author's timeline; a pending one does not", async () => {
  const [priv, fan, asker] = [await mkUser("priv", { isPrivate: true }), await mkUser("fan"), await mkUser("asker")];
  await mkPost(priv.id, "p");
  await follow(fan.id, priv.id);
  await follow(asker.id, priv.id, false);
  expect(await postsRepo.listByAuthor(priv.id, fan.id, null)).toHaveLength(1);
  expect(await postsRepo.listByAuthor(priv.id, asker.id, null)).toEqual([]);
  expect(await postsRepo.listByAuthor(priv.id, priv.id, null)).toHaveLength(1);
});
