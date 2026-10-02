// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, expect, test } from "vitest";
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import { closeDb, mkComment, mkPost, mkRemoteActor, mkUser, resetDb } from "../../harness.ts";

afterAll(closeDb);
beforeEach(resetDb);

test("a repeated action collides with its earlier notification instead of duplicating it", async () => {
  const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
  const post = await mkPost(ada.id, "p");
  const like = { recipientId: ada.id, type: "like", actorId: bob.id, postId: post.id };
  expect(await notificationsRepo.create(like)).not.toBe(null);
  // NULLS NOT DISTINCT: the null comment/remote columns still collide.
  expect(await notificationsRepo.create(like)).toBe(null);
  expect(await notificationsRepo.unreadCount(ada.id)).toBe(1);
  // A different target is a different notification.
  expect(await notificationsRepo.create({ ...like, postId: (await mkPost(ada.id, "p2")).id })).not.toBe(null);
});

test("removeMatching deletes exactly the reversed action, null columns matching null", async () => {
  const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
  const post = await mkPost(ada.id, "p");
  const comment = await mkComment(post.id, bob.id);
  await notificationsRepo.create({ recipientId: ada.id, type: "like", actorId: bob.id, postId: post.id });
  await notificationsRepo.create({
    recipientId: ada.id,
    type: "like",
    actorId: bob.id,
    postId: post.id,
    commentId: comment.id,
  });
  await notificationsRepo.removeMatching({ recipientId: ada.id, type: "like", actorId: bob.id, postId: post.id });
  const left = await notificationsRepo.listFor(ada.id, null);
  expect(left.map((r) => r.notification.commentId)).toEqual([comment.id]);
});

test("listing joins the local or remote actor, post title and comment snippet, newest first", async () => {
  const [ada, bob] = [await mkUser("ada"), await mkUser("bob")];
  const eve = await mkRemoteActor("eve@remote.example");
  const post = await mkPost(ada.id, "titled");
  const comment = await mkComment(post.id, bob.id, "nice one");
  await notificationsRepo.create({
    recipientId: ada.id,
    type: "comment",
    actorId: bob.id,
    postId: post.id,
    commentId: comment.id,
    createdAt: new Date(Date.UTC(2026, 0, 1)),
  });
  await notificationsRepo.create({
    recipientId: ada.id,
    type: "follow",
    remoteActorId: eve.id,
    createdAt: new Date(Date.UTC(2026, 0, 2)),
  });

  const [follow, commented] = await notificationsRepo.listFor(ada.id, null);
  expect(follow.actor).toBe(null);
  expect(follow.remoteActor?.handle).toBe("eve@remote.example");
  expect(commented).toMatchObject({
    actor: { username: "bob" },
    remoteActor: null,
    postTitle: "titled",
    commentContent: "nice one",
  });

  const next = await notificationsRepo.listFor(
    ada.id,
    { createdAt: follow.notification.createdAt.toISOString(), id: follow.notification.id },
    1,
  );
  expect(next.map((r) => r.notification.type)).toEqual(["comment"]);
  // Another user's bell is empty.
  expect(await notificationsRepo.listFor(bob.id, null)).toEqual([]);
});

test("read state: one at a time (owner only) or all at once", async () => {
  const [ada, bob, cy] = [await mkUser("ada"), await mkUser("bob"), await mkUser("cy")];
  const first = await notificationsRepo.create({ recipientId: ada.id, type: "follow", actorId: bob.id });
  await notificationsRepo.create({ recipientId: ada.id, type: "follow", actorId: cy.id });
  expect(await notificationsRepo.unreadCount(ada.id)).toBe(2);

  await notificationsRepo.markRead(bob.id, first.id);
  expect(await notificationsRepo.unreadCount(ada.id)).toBe(2);
  await notificationsRepo.markRead(ada.id, first.id);
  expect(await notificationsRepo.unreadCount(ada.id)).toBe(1);
  await notificationsRepo.markAllRead(ada.id);
  expect(await notificationsRepo.unreadCount(ada.id)).toBe(0);
});
