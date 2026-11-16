// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A soft-deleted account must vanish from everyone else's lists and counts the
// moment it is deleted, exactly as it will once the sweeper hard-deletes it and
// the cascades run. The rows stay (the deletion can be reverted), so every read
// that joins a user has to skip deleted ones.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { db } from "@/db/client.ts";
import * as commentLikesRepo from "@/db/repositories/commentLikes.ts";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as likesRepo from "@/db/repositories/likes.ts";
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import * as recommendationsRepo from "@/db/repositories/recommendations.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { users } from "@/db/schema.ts";
import * as follows from "@/services/follows.ts";
import { closeDb, follow, mkComment, mkPost, mkUser, resetDb } from "./harness.ts";

afterAll(closeDb);
beforeEach(resetDb);

const names = (rows: { username: string }[]) => rows.map((r) => r.username).toSorted();

async function softDelete(id: string) {
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
}

describe("follow graph", () => {
  test("a deleted account leaves the follower and following lists and counts", async () => {
    const [ada, bob, gone] = [await mkUser("ada"), await mkUser("bob"), await mkUser("gone")];
    await follow(ada.id, bob.id);
    await follow(ada.id, gone.id);
    await follow(bob.id, ada.id);
    await follow(gone.id, ada.id);
    await softDelete(gone.id);

    expect((await follows.followingOf("ada")).map((a) => a.username)).toEqual(["bob"]);
    expect((await follows.followersOf("ada")).map((a) => a.username)).toEqual(["bob"]);
    expect((await follows.profile("ada", null)).counts).toEqual({ followers: 1, following: 1 });
    expect(await followsRepo.localFollowerUsernames(ada.id)).toEqual(["bob"]);
    expect(await followsRepo.followersSince(ada.id, new Date(0))).toBe(1);
  });

  test("a deleted account's pending follow request is not listed", async () => {
    const ada = await mkUser("ada", { isPrivate: true });
    const [bob, gone] = [await mkUser("bob"), await mkUser("gone")];
    await follow(bob.id, ada.id, false);
    await follow(gone.id, ada.id, false);
    await softDelete(gone.id);

    expect(names(await followsRepo.listLocalFollowRequests(ada.id))).toEqual(["bob"]);
  });

  test("restoring the account brings its edges back", async () => {
    const [ada, gone] = [await mkUser("ada"), await mkUser("gone")];
    await follow(ada.id, gone.id);
    await softDelete(gone.id);
    await db.update(users).set({ deletedAt: null }).where(eq(users.id, gone.id));

    expect((await follows.followingOf("ada")).map((a) => a.username)).toEqual(["gone"]);
    expect((await follows.profile("ada", null)).counts.following).toBe(1);
  });
});

test("mute and block lists skip deleted accounts", async () => {
  const [ada, bob, gone] = [await mkUser("ada"), await mkUser("bob"), await mkUser("gone")];
  for (const kind of ["mute", "block"] as const) {
    await relationsRepo.addLocal(kind, ada.id, bob.id);
    await relationsRepo.addLocal(kind, ada.id, gone.id);
  }
  await softDelete(gone.id);

  expect(names(await relationsRepo.listLocalTargets("mute", ada.id))).toEqual(["bob"]);
  expect(names(await relationsRepo.listLocalTargets("block", ada.id))).toEqual(["bob"]);
});

test("notifications from a deleted account are hidden and not counted", async () => {
  const [ada, bob, gone] = [await mkUser("ada"), await mkUser("bob"), await mkUser("gone")];
  const post = await mkPost(ada.id, "p");
  await notificationsRepo.create({ recipientId: ada.id, type: "like", actorId: bob.id, postId: post.id });
  await notificationsRepo.create({ recipientId: ada.id, type: "like", actorId: gone.id, postId: post.id });
  await softDelete(gone.id);

  const rows = await notificationsRepo.listFor(ada.id, null);
  expect(rows.map((r) => r.actor?.username)).toEqual(["bob"]);
  expect(await notificationsRepo.unreadCount(ada.id)).toBe(1);
});

describe("engagement", () => {
  test("a deleted account's comments are hidden and not counted", async () => {
    const [ada, bob, gone] = [await mkUser("ada"), await mkUser("bob"), await mkUser("gone")];
    const post = await mkPost(ada.id, "p");
    const kept = await mkComment(post.id, bob.id);
    const dropped = await mkComment(post.id, gone.id);
    await commentsRepo.create({ postId: post.id, authorId: gone.id, parentId: kept.id, content: "reply" });
    // A live reply under the deleted account's comment goes with it, as the purge cascade would.
    await commentsRepo.create({ postId: post.id, authorId: bob.id, parentId: dropped.id, content: "orphan" });
    await softDelete(gone.id);

    expect((await commentsRepo.listByPost(post.id, null, null)).map((r) => r.comment.id)).toEqual([kept.id]);
    expect(await commentsRepo.listReplies([kept.id, dropped.id], null)).toEqual([]);
    expect((await commentsRepo.listForReplies(post.id)).map((r) => r.comment.id)).toEqual([kept.id]);
    expect(await commentsRepo.countTopLevel(post.id)).toBe(1);
    expect((await commentsRepo.countsFor([post.id])).get(post.id)).toBe(1);
    expect(await commentsRepo.countSince([post.id], new Date(0))).toBe(1);
  });

  test("a deleted account's likes are not counted", async () => {
    const [ada, bob, gone] = [await mkUser("ada"), await mkUser("bob"), await mkUser("gone")];
    const post = await mkPost(ada.id, "p");
    const comment = await mkComment(post.id, ada.id);
    for (const u of [bob, gone]) {
      await likesRepo.add(post.id, u.id);
      await commentLikesRepo.add(comment.id, u.id);
    }
    await softDelete(gone.id);

    expect((await likesRepo.statsFor([post.id], null)).get(post.id)?.count).toBe(1);
    expect(await likesRepo.countSince([post.id], new Date(0))).toBe(1);
    expect((await commentLikesRepo.statsFor([comment.id], null)).get(comment.id)?.count).toBe(1);
  });
});

test("who-to-follow follower counts skip deleted followers", async () => {
  const [ada, bob, gone] = [await mkUser("ada"), await mkUser("bob"), await mkUser("gone")];
  await follow(bob.id, ada.id);
  await follow(gone.id, ada.id);
  await softDelete(gone.id);

  const rows = await usersRepo.suggested(null);
  expect(rows.find((r) => r.username === "ada")?.followerCount).toBe(1);
  expect(rows.map((r) => r.username)).not.toContain("gone");
});

test("a deleted account's recommendations leave followers' feeds and counts", async () => {
  const [ada, bob, gone, author] = [
    await mkUser("ada"),
    await mkUser("bob"),
    await mkUser("gone"),
    await mkUser("author"),
  ];
  const post = await mkPost(author.id, "p");
  await follow(ada.id, bob.id);
  await follow(ada.id, gone.id);
  await recommendationsRepo.add(post.id, bob.id);
  await recommendationsRepo.add(post.id, gone.id);
  await softDelete(gone.id);

  const feed = await recommendationsRepo.listFeedFor(ada.id, null);
  expect(feed.map((r) => r.recommenderUsername)).toEqual(["bob"]);
  expect((await recommendationsRepo.statsFor([post.id], null)).get(post.id)?.count).toBe(1);
});
