import { eq } from "drizzle-orm";
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Scheduled publishing, against a real database.
//
// Two things here cannot be checked any other way. The first is the
// `posts_publish_at_status_ck` constraint, which is the only thing standing
// between a bug and a scheduled post that never publishes (no due time) or a
// published one that federates again on every tick (a due time it kept). The
// second is `claimDue`'s `for update skip locked`, whose whole purpose is what
// happens when two backend processes sweep at the same instant — a race that a
// unit test cannot stage.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { db } from "@/db/client.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import { notifications, posts } from "@/db/schema.ts";
import { sweep } from "@/services/scheduledPosts.ts";
import { closeDb, mkPost, mkUser, resetDb } from "./harness.ts";

function read(id: string) {
  return db
    .select()
    .from(posts)
    .where(eq(posts.id, id))
    .then((r) => r[0]);
}

const HOUR = 3_600_000;

afterAll(async () => {
  await closeDb();
});

describe("the sweeper publishes exactly what has come due", () => {
  let author: Awaited<ReturnType<typeof mkUser>>;
  let draftedAt: Date;
  let due: Awaited<ReturnType<typeof mkPost>>;
  let later: Awaited<ReturnType<typeof mkPost>>;
  let draft: Awaited<ReturnType<typeof mkPost>>;

  beforeAll(async () => {
    await resetDb();
    author = await mkUser("writer");

    // Drafted a week ago and scheduled for a minute ago — the shape every
    // scheduled post really has, and what makes the date assertion below
    // unambiguous rather than a race against the clock.
    draftedAt = new Date(Date.now() - 7 * 24 * HOUR);
    due = await mkPost(author.id, "due", {
      status: "scheduled",
      publishAt: new Date(Date.now() - 60_000),
      createdAt: draftedAt,
    });
    later = await mkPost(author.id, "later", {
      status: "scheduled",
      publishAt: new Date(Date.now() + HOUR),
    });
    draft = await mkPost(author.id, "draft", { status: "draft" });
  });

  test("a post past its time is claimed and published", async () => {
    const claimed = await postsRepo.claimDue();
    expect(claimed.map((r) => r.id)).toEqual([due.id]);
    // The author comes back with the row, because the sweeper needs it to
    // address the "your post is live" notification.
    expect(claimed[0].authorId).toBe(author.id);

    const row = await read(due.id);
    expect(row.status).toBe("published");
    // Cleared as it publishes, or the constraint below would fail and every
    // later tick would claim it again.
    expect(row.publishAt).toBe(null);
  });

  test("publishing dates the post from now, not from when it was written", async () => {
    const row = await read(due.id);
    // Left at the drafting date the post would land a week down the timeline,
    // where nobody would ever see it — the whole reason the claim restamps it.
    expect(row.createdAt.getTime()).not.toBe(draftedAt.getTime());
    expect(row.createdAt.getTime()).toBeGreaterThan(Date.now() - HOUR);
    expect(row.updatedAt.getTime()).toBe(row.createdAt.getTime());
  });

  test("a post still in the future is left alone", async () => {
    const row = await read(later.id);
    expect(row.status).toBe("scheduled");
    expect(row.publishAt?.getTime()).toBe(later.publishAt?.getTime());
  });

  test("a plain draft is never touched", async () => {
    expect((await read(draft.id)).status).toBe("draft");
  });

  test("a second sweep claims nothing", async () => {
    expect(await postsRepo.claimDue()).toEqual([]);
  });
});

describe("a post is claimed by exactly one sweeper", () => {
  let author: Awaited<ReturnType<typeof mkUser>>;
  const ids: string[] = [];

  beforeAll(async () => {
    await resetDb();
    author = await mkUser("writer");

    // Enough rows that two concurrent sweeps genuinely overlap; a single row
    // would pass even if the query serialised them by luck.
    ids.length = 0;
    for (let i = 0; i < 20; i++) {
      const p = await mkPost(author.id, `due-${i}`, {
        status: "scheduled",
        publishAt: new Date(Date.now() - 60_000),
      });
      ids.push(p.id);
    }
  });

  test("concurrent claims partition the work, never duplicate it", async () => {
    // This is the double-federation guard. Without `skip locked` both calls
    // would return the same rows and remote instances would receive every one
    // of these articles twice.
    const [a, b] = await Promise.all([postsRepo.claimDue(), postsRepo.claimDue()]);
    const claimed = [...a, ...b].map((r) => r.id);
    expect(claimed.length, "every due post was claimed once").toBe(ids.length);
    expect(new Set(claimed).size, "no post was claimed twice").toBe(ids.length);
  });

  test("and all of them are published afterwards", async () => {
    const rows = await db.select().from(posts);
    expect(rows.filter((r) => r.status === "published").length).toBe(ids.length);
    expect(rows.filter((r) => r.publishAt !== null).length).toBe(0);
  });
});

describe("the database rejects an impossible scheduling state", () => {
  let author: Awaited<ReturnType<typeof mkUser>>;

  beforeAll(async () => {
    await resetDb();
    author = await mkUser("writer");
  });

  async function rejects(label: string, values: Record<string, unknown>) {
    let threw = false;
    try {
      await db.insert(posts).values({
        authorId: author.id,
        title: label,
        contentHtml: "<p>x</p>",
        ...values,
      } as typeof posts.$inferInsert);
    } catch {
      threw = true;
    }
    expect(threw, `expected the CHECK constraint to reject: ${label}`).toBe(true);
  }

  test("scheduled with no due time", async () => {
    // Would be invisible forever: the sweeper's predicate is
    // `publish_at <= now()`, which a NULL never satisfies.
    await rejects("scheduled with no due time", { status: "scheduled", publishAt: null });
  });

  test("published but still claiming to be due", async () => {
    // Harmless-looking, but the next sweep would re-claim and re-federate it.
    await rejects("published with a due time", {
      status: "published",
      publishAt: new Date(Date.now() + HOUR),
    });
  });

  test("a draft carrying a due time", async () => {
    await rejects("draft with a due time", {
      status: "draft",
      publishAt: new Date(Date.now() + HOUR),
    });
  });
});

describe("an author's own scheduled posts list soonest first", () => {
  let author: Awaited<ReturnType<typeof mkUser>>;
  let other: Awaited<ReturnType<typeof mkUser>>;
  let first: Awaited<ReturnType<typeof mkPost>>;
  let second: Awaited<ReturnType<typeof mkPost>>;
  let third: Awaited<ReturnType<typeof mkPost>>;

  beforeAll(async () => {
    await resetDb();
    author = await mkUser("writer");
    other = await mkUser("someone-else");

    third = await mkPost(author.id, "third", {
      status: "scheduled",
      publishAt: new Date(Date.now() + 3 * HOUR),
    });
    first = await mkPost(author.id, "first", {
      status: "scheduled",
      publishAt: new Date(Date.now() + HOUR),
    });
    second = await mkPost(author.id, "second", {
      status: "scheduled",
      publishAt: new Date(Date.now() + 2 * HOUR),
    });
    await mkPost(author.id, "a-draft", { status: "draft" });
    await mkPost(other.id, "not-mine", { status: "scheduled" });
  });

  test("ordered by when they go out, not when they were written", async () => {
    const rows = await postsRepo.listScheduledByAuthor(author.id, null);
    expect(rows.map((r) => r.post.id)).toEqual([first.id, second.id, third.id]);
  });

  test("nobody else's scheduled posts, and no drafts", async () => {
    const rows = await postsRepo.listScheduledByAuthor(author.id, null);
    expect(rows.length).toBe(3);
  });

  test("drafts and published lists exclude scheduled posts", async () => {
    const drafts = await postsRepo.listDraftsByAuthor(author.id, null);
    expect(drafts.map((r) => r.post.title)).toEqual(["a-draft"]);
    expect(await postsRepo.listPublishedByAuthor(author.id, null)).toEqual([]);
  });

  test("the tab counts agree with the lists", async () => {
    expect(await postsRepo.countsByAuthor(author.id)).toEqual({
      draft: 1,
      scheduled: 3,
      published: 0,
    });
  });
});

describe("a swept post tells its author it went out", () => {
  let author: Awaited<ReturnType<typeof mkUser>>;
  let due: Awaited<ReturnType<typeof mkPost>>;

  beforeAll(async () => {
    await resetDb();
    author = await mkUser("writer");
    due = await mkPost(author.id, "due", {
      status: "scheduled",
      publishAt: new Date(Date.now() - 60_000),
    });
    await mkPost(author.id, "later", { status: "scheduled" });
  });

  test("one sweep publishes the due post and notifies the author", async () => {
    expect(await sweep()).toBe(1);

    const notes = await db.select().from(notifications);
    expect(notes.length).toBe(1);
    expect(notes[0].type).toBe("post_published");
    expect(notes[0].recipientId).toBe(author.id);
    expect(notes[0].postId).toBe(due.id);
    // Nobody did this — a timer did. The reader keys off the missing actor to
    // render it as a statement rather than as "<someone> did <something>".
    expect(notes[0].actorId).toBe(null);
  });

  test("a second sweep finds nothing and notifies nobody twice", async () => {
    expect(await sweep()).toBe(0);
    expect((await db.select().from(notifications)).length).toBe(1);
  });
});
