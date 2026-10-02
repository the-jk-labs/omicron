// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { db } from "@/db/client.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as recommendationsRepo from "@/db/repositories/recommendations.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import { posts, recommendations, users } from "@/db/schema.ts";
import { closeDb, follow, mkPost, mkRemoteActor, mkRemotePost, mkUser, resetDb } from "../../harness.ts";

const byText = (a: unknown, b: unknown) => String(a).localeCompare(String(b));

afterAll(closeDb);
beforeEach(resetDb);

const at = (n: number) => new Date(Date.UTC(2026, 0, n));

// Pins a recommendation's own timestamp so ordering assertions don't race.
function stamp(postId: string, createdAt: Date) {
  return db.update(recommendations).set({ createdAt }).where(eq(recommendations.postId, postId));
}

describe("edges", () => {
  test("local and remote recommenders, idempotent, with per-viewer stats", async () => {
    const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
    const eve = await mkRemoteActor("eve@remote.example");
    const post = await mkPost(ada.id, "p");
    await recommendationsRepo.add(post.id, bob.id);
    await recommendationsRepo.add(post.id, bob.id);
    await recommendationsRepo.addRemote(post.id, eve.id);
    await recommendationsRepo.addRemote(post.id, eve.id);
    expect((await recommendationsRepo.statsFor([post.id], bob.id)).get(post.id)).toEqual({
      count: 2,
      recommended: true,
    });
    expect((await recommendationsRepo.statsFor([post.id], ada.id)).get(post.id)?.recommended).toBe(false);
    expect((await recommendationsRepo.statsFor([post.id], null)).get(post.id)?.recommended).toBe(false);
    expect((await recommendationsRepo.statsFor([], null)).size).toBe(0);

    await recommendationsRepo.remove(post.id, bob.id);
    await recommendationsRepo.removeRemote(post.id, eve.id);
    expect((await recommendationsRepo.statsFor([post.id], null)).size).toBe(0);
  });
});

describe("a local user's Recommendations tab", () => {
  test("newest-recommended first, paginated on the recommendation's clock", async () => {
    const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
    const [old, fresh] = [await mkPost(ada.id, "old"), await mkPost(ada.id, "fresh")];
    await recommendationsRepo.add(fresh.id, bob.id);
    await recommendationsRepo.add(old.id, bob.id);
    await stamp(fresh.id, at(1));
    await stamp(old.id, at(2));
    const page = await recommendationsRepo.listByUser(bob.id, null, null, 1);
    expect(page.map((r) => r.post.slug)).toEqual(["old", "fresh"]);
    const next = await recommendationsRepo.listByUser(
      bob.id,
      null,
      { createdAt: page[0].recommendedAt.toISOString(), id: page[0].recommendationId },
      1,
    );
    expect(next.map((r) => r.post.slug)).toEqual(["fresh"]);
  });

  test("withholds drafts, suspended or private authors' posts, and hidden authors", async () => {
    const [bob, viewer] = [await mkUser("bob"), await mkUser("viewer")];
    const okAuthor = await mkUser("ok");
    const suspended = await mkUser("sus", { suspended: true });
    const priv = await mkUser("priv", { isPrivate: true });
    const muted = await mkUser("muted");
    const ok = await mkPost(okAuthor.id, "ok");
    for (const p of [
      ok,
      await mkPost(okAuthor.id, "draft", { status: "draft" }),
      await mkPost(suspended.id, "sus"),
      await mkPost(priv.id, "priv"),
      await mkPost(muted.id, "muted"),
    ]) {
      await recommendationsRepo.add(p.id, bob.id);
    }
    await relationsRepo.addLocal("mute", viewer.id, muted.id);
    expect((await recommendationsRepo.listByUser(bob.id, viewer.id, null)).map((r) => r.post.slug)).toEqual(["ok"]);
    // An approved follower of the private author sees that one too.
    await follow(viewer.id, priv.id);
    expect(
      (await recommendationsRepo.listByUser(bob.id, viewer.id, null)).map((r) => r.post.slug).toSorted(byText),
    ).toEqual(["ok", "priv"]);
  });
});

describe("a remote actor's Recommendations tab", () => {
  test("lists the Articles they boosted, Notes excluded", async () => {
    const ada = await mkUser("ada");
    const eve = await mkRemoteActor("eve@remote.example");
    const article = await mkPost(ada.id, "article");
    const note = await mkRemotePost(eve.id, "https://remote.example/n/1", { apType: "Note" });
    await recommendationsRepo.addRemote(article.id, eve.id);
    await recommendationsRepo.addRemote(note.id, eve.id);
    expect((await recommendationsRepo.listByRemoteActor(eve.id, null, null)).map((r) => r.post.id)).toEqual([
      article.id,
    ]);
  });

  test("never lists a local post that is no longer published, or whose author is suspended", async () => {
    const ada = await mkUser("ada");
    const eve = await mkRemoteActor("eve@remote.example");
    const unpublished = await mkPost(ada.id, "unpublished");
    await recommendationsRepo.addRemote(unpublished.id, eve.id);
    await db.update(posts).set({ status: "draft" }).where(eq(posts.id, unpublished.id));
    const sus = await mkUser("sus");
    const susPost = await mkPost(sus.id, "sus");
    await recommendationsRepo.addRemote(susPost.id, eve.id);
    await db.update(users).set({ suspendedAt: new Date() }).where(eq(users.id, sus.id));
    expect(await recommendationsRepo.listByRemoteActor(eve.id, null, null)).toEqual([]);
  });
});

describe("the For-you feed's recommendation stream", () => {
  test("boosts by followed local and remote accounts, with the recommender attached", async () => {
    const [me, bob, stranger, author] = [
      await mkUser("me"),
      await mkUser("bob"),
      await mkUser("stranger"),
      await mkUser("author"),
    ];
    const eve = await mkRemoteActor("eve@remote.example");
    await follow(me.id, bob.id);
    await followsRepo.createRemoteFollowing(me.id, eve.id);
    await followsRepo.approveRemoteFollowing(me.id, eve.id);
    const [p1, p2, p3] = [await mkPost(author.id, "p1"), await mkPost(author.id, "p2"), await mkPost(author.id, "p3")];
    await recommendationsRepo.add(p1.id, bob.id);
    await recommendationsRepo.addRemote(p2.id, eve.id);
    await recommendationsRepo.add(p3.id, stranger.id);
    await stamp(p1.id, at(1));
    await stamp(p2.id, at(2));

    const rows = await recommendationsRepo.listFeedFor(me.id, null);
    expect(rows.map((r) => [r.post.slug, r.recommenderUsername, r.recommenderRemote])).toEqual([
      ["p2", "eve@remote.example", true],
      ["p1", "bob", false],
    ]);
  });

  test("a pending follow contributes nothing, and a private author's post needs its own follow", async () => {
    const [me, bob, priv] = [await mkUser("me"), await mkUser("bob"), await mkUser("priv", { isPrivate: true })];
    const pending = await mkUser("pending");
    await follow(me.id, bob.id);
    await follow(me.id, pending.id, false);
    const privPost = await mkPost(priv.id, "priv");
    const pub = await mkPost(bob.id, "pub");
    await recommendationsRepo.add(privPost.id, bob.id);
    await recommendationsRepo.add(pub.id, pending.id);
    expect(await recommendationsRepo.listFeedFor(me.id, null)).toEqual([]);
  });
});
