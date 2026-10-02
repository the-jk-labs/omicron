// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import { closeDb, mkComment, mkPost, mkRemoteActor, mkUser, resetDb } from "../../harness.ts";

afterAll(closeDb);
beforeEach(resetDb);

const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, n));

async function comment(postId: string, authorId: string, content: string, createdAt: Date, parentId?: string) {
  return commentsRepo.create({ postId, authorId, content, createdAt, parentId });
}

describe("writes", () => {
  test("create, update, apId and lookups", async () => {
    const ada = await mkUser("ada");
    const post = await mkPost(ada.id, "p");
    const c = await mkComment(post.id, ada.id, "hello");
    expect((await commentsRepo.update(c.id, "edited")).content).toBe("edited");
    await commentsRepo.setApId(c.id, "https://blog.example/users/ada/comments/1");
    expect((await commentsRepo.findByApId("https://blog.example/users/ada/comments/1"))?.id).toBe(c.id);
    expect((await commentsRepo.findById(c.id))?.content).toBe("edited");
    expect(await commentsRepo.findById("00000000-0000-0000-0000-000000000000")).toBe(null);
    expect(await commentsRepo.findByApId("https://nowhere")).toBe(null);
  });

  test("a federated reply is ingested once, however often it is delivered", async () => {
    const ada = await mkUser("ada");
    const post = await mkPost(ada.id, "p");
    const eve = await mkRemoteActor("eve@remote.example");
    const data = { postId: post.id, remoteActorId: eve.id, apId: "https://remote.example/n/1", content: "hi" };
    const first = await commentsRepo.createRemote(data);
    const again = await commentsRepo.createRemote({ ...data, content: "changed" });
    expect(again?.id).toBe(first?.id);
    expect(again?.content).toBe("hi");
    expect(await commentsRepo.countAll()).toBe(1);
  });

  test("a comment has exactly one kind of author", async () => {
    const ada = await mkUser("ada");
    const post = await mkPost(ada.id, "p");
    const eve = await mkRemoteActor("eve@remote.example");
    const violation = { cause: expect.objectContaining({ constraint_name: "comments_author_kind_ck" }) };
    await expect(commentsRepo.create({ postId: post.id, content: "x" })).rejects.toMatchObject(violation);
    await expect(
      commentsRepo.create({ postId: post.id, authorId: ada.id, remoteActorId: eve.id, content: "x" }),
    ).rejects.toMatchObject(violation);
  });

  test("deleting a comment cascades its replies", async () => {
    const ada = await mkUser("ada");
    const post = await mkPost(ada.id, "p");
    const top = await comment(post.id, ada.id, "top", at(1));
    await comment(post.id, ada.id, "reply", at(2), top.id);
    await commentsRepo.remove(top.id);
    expect(await commentsRepo.countAll()).toBe(0);
  });
});

describe("listing", () => {
  test("top level newest first with a keyset cursor; replies oldest first", async () => {
    const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
    const post = await mkPost(ada.id, "p");
    const c1 = await comment(post.id, ada.id, "c1", at(1));
    const c2 = await comment(post.id, bob.id, "c2", at(2));
    const c3 = await comment(post.id, ada.id, "c3", at(3));
    const r2 = await comment(post.id, bob.id, "r2", at(5), c1.id);
    const r1 = await comment(post.id, ada.id, "r1", at(4), c1.id);

    const page = await commentsRepo.listByPost(post.id, null, null, 2);
    // limit + 1, so the caller can tell there is a next page.
    expect(page.map((r) => r.comment.id)).toEqual([c3.id, c2.id, c1.id]);
    expect(page[1].author?.username).toBe("bob");
    expect(page[1].remoteActor).toBe(null);

    const next = await commentsRepo.listByPost(post.id, { createdAt: at(2).toISOString(), id: c2.id }, null, 2);
    expect(next.map((r) => r.comment.id)).toEqual([c1.id]);

    expect((await commentsRepo.listReplies([c1.id], null)).map((r) => r.comment.id)).toEqual([r1.id, r2.id]);
    expect(await commentsRepo.listReplies([], null)).toEqual([]);
  });

  test("remote replies carry the cached actor as author", async () => {
    const ada = await mkUser("ada");
    const post = await mkPost(ada.id, "p");
    const eve = await mkRemoteActor("eve@remote.example");
    await commentsRepo.createRemote({ postId: post.id, remoteActorId: eve.id, apId: "https://r/n/1", content: "hi" });
    const [row] = await commentsRepo.listByPost(post.id, null, null);
    expect(row.author).toBe(null);
    expect(row.remoteActor).toMatchObject({ handle: "eve@remote.example", apId: eve.apId });
  });

  test("hides comments across a block in either direction, and remote actors the viewer blocked", async () => {
    const [ada, bob, cy, viewer] = [await mkUser("ada"), await mkUser("bob"), await mkUser("cy"), await mkUser("v")];
    const post = await mkPost(ada.id, "p");
    const eve = await mkRemoteActor("eve@remote.example");
    await comment(post.id, bob.id, "by bob", at(1));
    await comment(post.id, cy.id, "by cy", at(2));
    await comment(post.id, ada.id, "by ada", at(3));
    await commentsRepo.createRemote({ postId: post.id, remoteActorId: eve.id, apId: "https://r/n/1", content: "eve" });
    await relationsRepo.addLocal("block", viewer.id, bob.id);
    await relationsRepo.addLocal("block", cy.id, viewer.id);
    await relationsRepo.addRemote("block", viewer.id, eve.id);

    const seen = (await commentsRepo.listByPost(post.id, null, viewer.id)).map((r) => r.comment.content);
    expect(seen).toEqual(["by ada"]);
    // Guests are unfiltered.
    expect(await commentsRepo.listByPost(post.id, null, null)).toHaveLength(4);
  });

  test("the federated Replies collection: oldest first, top level only, capped; the count is not", async () => {
    const ada = await mkUser("ada");
    const post = await mkPost(ada.id, "p");
    const c1 = await comment(post.id, ada.id, "c1", at(1));
    await comment(post.id, ada.id, "c2", at(2));
    await comment(post.id, ada.id, "c3", at(3));
    await comment(post.id, ada.id, "reply", at(4), c1.id);
    expect((await commentsRepo.listForReplies(post.id, 2)).map((r) => r.comment.content)).toEqual(["c1", "c2"]);
    expect(await commentsRepo.countTopLevel(post.id)).toBe(3);
  });

  test("countsFor counts every comment, replies included, per post", async () => {
    const ada = await mkUser("ada");
    const [p1, p2] = [await mkPost(ada.id, "p1"), await mkPost(ada.id, "p2")];
    const c = await comment(p1.id, ada.id, "c", at(1));
    await comment(p1.id, ada.id, "r", at(2), c.id);
    const counts = await commentsRepo.countsFor([p1.id, p2.id]);
    expect(Object.fromEntries(counts)).toEqual({ [p1.id]: 2 });
    expect((await commentsRepo.countsFor([])).size).toBe(0);
  });
});
