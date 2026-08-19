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
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { db } from "@/db/client.ts";
import { posts } from "@/db/schema.ts";
import { eq } from "drizzle-orm";
import * as postsRepo from "@/db/repositories/posts.ts";
import { closeDb, mkPost, mkUser, resetDb } from "./harness.ts";

const opts = { sanitizeResources: false, sanitizeOps: false };

function read(id: string) {
  return db.select().from(posts).where(eq(posts.id, id)).then((r) => r[0]);
}

const HOUR = 3_600_000;

Deno.test("the sweeper publishes exactly what has come due", opts, async (t) => {
  await resetDb();
  const author = await mkUser("writer");

  // Drafted a week ago and scheduled for a minute ago — the shape every
  // scheduled post really has, and what makes the date assertion below
  // unambiguous rather than a race against the clock.
  const draftedAt = new Date(Date.now() - 7 * 24 * HOUR);
  const due = await mkPost(author.id, "due", {
    status: "scheduled",
    publishAt: new Date(Date.now() - 60_000),
    createdAt: draftedAt,
  });
  const later = await mkPost(author.id, "later", {
    status: "scheduled",
    publishAt: new Date(Date.now() + HOUR),
  });
  const draft = await mkPost(author.id, "draft", { status: "draft" });

  await t.step("a post past its time is claimed and published", async () => {
    const claimed = await postsRepo.claimDue();
    assertEquals(claimed.map((r) => r.id), [due.id]);
    // The author comes back with the row, because the sweeper needs it to
    // address the "your post is live" notification.
    assertEquals(claimed[0].authorId, author.id);

    const row = await read(due.id);
    assertEquals(row.status, "published");
    // Cleared as it publishes, or the constraint below would fail and every
    // later tick would claim it again.
    assertEquals(row.publishAt, null);
  });

  await t.step("publishing dates the post from now, not from when it was written", async () => {
    const row = await read(due.id);
    // Left at the drafting date the post would land a week down the timeline,
    // where nobody would ever see it — the whole reason the claim restamps it.
    assertNotEquals(row.createdAt.getTime(), draftedAt.getTime());
    assert(row.createdAt > new Date(Date.now() - HOUR));
    assertEquals(row.updatedAt.getTime(), row.createdAt.getTime());
  });

  await t.step("a post still in the future is left alone", async () => {
    const row = await read(later.id);
    assertEquals(row.status, "scheduled");
    assertEquals(row.publishAt?.getTime(), later.publishAt?.getTime());
  });

  await t.step("a plain draft is never touched", async () => {
    assertEquals((await read(draft.id)).status, "draft");
  });

  await t.step("a second sweep claims nothing", async () => {
    assertEquals(await postsRepo.claimDue(), []);
  });
});

Deno.test("a post is claimed by exactly one sweeper", opts, async (t) => {
  await resetDb();
  const author = await mkUser("writer");

  // Enough rows that two concurrent sweeps genuinely overlap; a single row
  // would pass even if the query serialised them by luck.
  const ids: string[] = [];
  for (let i = 0; i < 20; i++) {
    const p = await mkPost(author.id, `due-${i}`, {
      status: "scheduled",
      publishAt: new Date(Date.now() - 60_000),
    });
    ids.push(p.id);
  }

  await t.step("concurrent claims partition the work, never duplicate it", async () => {
    // This is the double-federation guard. Without `skip locked` both calls
    // would return the same rows and remote instances would receive every one
    // of these articles twice.
    const [a, b] = await Promise.all([postsRepo.claimDue(), postsRepo.claimDue()]);
    const claimed = [...a, ...b].map((r) => r.id);
    assertEquals(claimed.length, ids.length, "every due post was claimed once");
    assertEquals(new Set(claimed).size, ids.length, "no post was claimed twice");
  });

  await t.step("and all of them are published afterwards", async () => {
    const rows = await db.select().from(posts);
    assertEquals(rows.filter((r) => r.status === "published").length, ids.length);
    assertEquals(rows.filter((r) => r.publishAt !== null).length, 0);
  });
});

Deno.test("the database rejects an impossible scheduling state", opts, async (t) => {
  await resetDb();
  const author = await mkUser("writer");

  async function rejects(label: string, values: Record<string, unknown>) {
    let threw = false;
    try {
      await db.insert(posts).values(
        {
          authorId: author.id,
          title: label,
          contentHtml: "<p>x</p>",
          ...values,
        } as typeof posts.$inferInsert,
      );
    } catch {
      threw = true;
    }
    assert(threw, `expected the CHECK constraint to reject: ${label}`);
  }

  await t.step("scheduled with no due time", async () => {
    // Would be invisible forever: the sweeper's predicate is
    // `publish_at <= now()`, which a NULL never satisfies.
    await rejects("scheduled with no due time", { status: "scheduled", publishAt: null });
  });

  await t.step("published but still claiming to be due", async () => {
    // Harmless-looking, but the next sweep would re-claim and re-federate it.
    await rejects("published with a due time", {
      status: "published",
      publishAt: new Date(Date.now() + HOUR),
    });
  });

  await t.step("a draft carrying a due time", async () => {
    await rejects("draft with a due time", {
      status: "draft",
      publishAt: new Date(Date.now() + HOUR),
    });
  });
});

Deno.test("an author's own scheduled posts list soonest first", opts, async (t) => {
  await resetDb();
  const author = await mkUser("writer");
  const other = await mkUser("someone-else");

  const third = await mkPost(author.id, "third", {
    status: "scheduled",
    publishAt: new Date(Date.now() + 3 * HOUR),
  });
  const first = await mkPost(author.id, "first", {
    status: "scheduled",
    publishAt: new Date(Date.now() + HOUR),
  });
  const second = await mkPost(author.id, "second", {
    status: "scheduled",
    publishAt: new Date(Date.now() + 2 * HOUR),
  });
  await mkPost(author.id, "a-draft", { status: "draft" });
  await mkPost(other.id, "not-mine", { status: "scheduled" });

  await t.step("ordered by when they go out, not when they were written", async () => {
    const rows = await postsRepo.listScheduledByAuthor(author.id, null);
    assertEquals(rows.map((r) => r.post.id), [first.id, second.id, third.id]);
  });

  await t.step("nobody else's scheduled posts, and no drafts", async () => {
    const rows = await postsRepo.listScheduledByAuthor(author.id, null);
    assertEquals(rows.length, 3);
  });

  await t.step("drafts and published lists exclude scheduled posts", async () => {
    const drafts = await postsRepo.listDraftsByAuthor(author.id, null);
    assertEquals(drafts.map((r) => r.post.title), ["a-draft"]);
    assertEquals(await postsRepo.listPublishedByAuthor(author.id, null), []);
  });

  await t.step("the tab counts agree with the lists", async () => {
    assertEquals(await postsRepo.countsByAuthor(author.id), {
      draft: 1,
      scheduled: 3,
      published: 0,
    });
  });
});

Deno.test("teardown", opts, async () => {
  await closeDb();
});
