// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Age-based pruning of the remote actor/post cache, against a real database.
//
// A hostile instance can grow the remote_actors/posts tables without bound by
// serving many distinct, valid actors and outboxes to the anonymous browsing
// path. The remote-cache GC is the counterweight: it forgets cached actors
// that are stale (past the retention window) and no longer referenced by any
// of a local user's durable edges. The "referenced" predicate lives in SQL
// (remoteActorsRepo.listPrunable) and can only be asserted against a database.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { sql } from "@/db/client.ts";
import { db } from "@/db/client.ts";
import { blocks, follows, mutes, notifications, posts, recommendations, remoteActors } from "@/db/schema.ts";
import { sweep } from "@/services/remoteCacheGc.ts";
import { closeDb, mkPost, mkUser, resetDb } from "./harness.ts";

const DAY = 24 * 3_600_000;

// The retention window the sweep uses; test rows are aged well past it.
const CUTOFF_DAYS = 30;

// Inserts a cached remote actor with an explicitly backdated `fetchedAt` so its
// staleness is under our control, unlike the default now().
async function mkRemoteActor(handle: string, ageDays: number) {
  const [row] = await db
    .insert(remoteActors)
    .values({
      apId: `https://${handle.split("@")[1]}/users/${handle.split("@")[0]}`,
      handle,
      username: handle.split("@")[0],
      host: handle.split("@")[1],
      displayName: handle,
      fetchedAt: new Date(Date.now() - ageDays * DAY),
    })
    .returning();
  return row;
}

// A remote post owned by an actor (persisted the way fetchOutboxPosts writes).
async function mkRemotePost(actorId: string, apId: string) {
  return await db.insert(posts).values({
    remoteActorId: actorId,
    apId,
    title: apId,
    contentHtml: `<p>${apId}</p>`,
    apType: "Article",
    remote: true,
  });
}

async function resetRemoteTables() {
  // resetDb truncates users/posts/follows/... but not the remote-actor half of
  // the graph, so clear it explicitly for this suite.
  await sql`truncate remote_actors, blocks, mutes, notifications, recommendations restart identity cascade`;
}

async function countActors(handle: string) {
  const rows = await db.select({ id: remoteActors.id }).from(remoteActors).where(eq(remoteActors.handle, handle));
  return rows.length;
}

afterAll(async () => {
  await closeDb();
});

describe("remote-cache GC", () => {
  beforeAll(async () => {
    await resetDb();
    await resetRemoteTables();
  });

  test("prunes a stale actor that nothing references", async () => {
    await mkRemoteActor("orphan@stale.example", CUTOFF_DAYS + 10);
    expect(await sweep()).toBeGreaterThanOrEqual(1);
    expect(await countActors("orphan@stale.example")).toBe(0);
  });

  test("keeps a recently-fetched actor even with no references", async () => {
    await mkRemoteActor("fresh@recent.example", 1);
    await sweep();
    expect(await countActors("fresh@recent.example")).toBe(1);
  });

  test("pruning an actor cascades its cached posts", async () => {
    const actor = await mkRemoteActor("posts@stale.example", CUTOFF_DAYS + 5);
    await mkRemotePost(actor.id, "https://stale.example/posts/1");
    await sweep();
    const remaining = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.apId, "https://stale.example/posts/1"));
    expect(remaining.length).toBe(0);
  });

  test("keeps a stale actor that a local user follows", async () => {
    const user = await mkUser("gc-follower");
    const actor = await mkRemoteActor("followed@stale.example", CUTOFF_DAYS + 5);
    await db.insert(follows).values({ followerId: user.id, remoteFolloweeId: actor.id, approved: true });
    await sweep();
    expect(await countActors("followed@stale.example")).toBe(1);
  });

  test("keeps a stale actor that a local user has muted", async () => {
    const user = await mkUser("gc-muter");
    const actor = await mkRemoteActor("muted@stale.example", CUTOFF_DAYS + 5);
    await db.insert(mutes).values({ userId: user.id, targetRemoteActorId: actor.id });
    await sweep();
    expect(await countActors("muted@stale.example")).toBe(1);
  });

  test("keeps a stale actor that a local user has blocked", async () => {
    const user = await mkUser("gc-blocker");
    const actor = await mkRemoteActor("blocked@stale.example", CUTOFF_DAYS + 5);
    await db.insert(blocks).values({ userId: user.id, targetRemoteActorId: actor.id });
    await sweep();
    expect(await countActors("blocked@stale.example")).toBe(1);
  });

  test("keeps a stale actor referenced by a recommendation", async () => {
    const user = await mkUser("gc-rec");
    const actor = await mkRemoteActor("recommended@stale.example", CUTOFF_DAYS + 5);
    const post = await mkPost(user.id, "rec-target");
    await db.insert(recommendations).values({ postId: post.id, remoteActorId: actor.id });
    await sweep();
    expect(await countActors("recommended@stale.example")).toBe(1);
  });

  test("keeps a stale actor referenced by a notification", async () => {
    const user = await mkUser("gc-notif");
    const actor = await mkRemoteActor("notifying@stale.example", CUTOFF_DAYS + 5);
    await db.insert(notifications).values({
      recipientId: user.id,
      type: "follow",
      remoteActorId: actor.id,
    });
    await sweep();
    expect(await countActors("notifying@stale.example")).toBe(1);
  });
});
