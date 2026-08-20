// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The numbers this instance publishes to the fediverse, against a real database.
//
// NodeInfo's usage block is the one place aggregate counts leave the instance,
// and each one is a SQL predicate with a judgement call inside it: a draft is
// not a post, another instance's article is not ours, a suspended author's work
// is withdrawn, and a private author's is still this node's output. Nothing but
// a database can tell whether those predicates say what the comments above them
// claim, and getting one wrong is not visible from inside — it just publishes a
// wrong number to every directory that asks.
import { assertEquals } from "@std/assert";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { closeDb, mkComment, mkPost, mkSession, mkUser, resetDb } from "./harness.ts";

const opts = { sanitizeResources: false, sanitizeOps: false };

const DAY = 24 * 3_600_000;

Deno.test("local post count is what this instance actually published", opts, async (t) => {
  await resetDb();
  const author = await mkUser("writer");

  await mkPost(author.id, "published");
  await mkPost(author.id, "draft", { status: "draft" });
  await mkPost(author.id, "scheduled", { status: "scheduled" });

  await t.step("counts published posts, never drafts or scheduled ones", async () => {
    assertEquals(await postsRepo.countLocalPublished(), 1);
  });

  await t.step("a private author's posts are still this node's", async () => {
    const hermit = await mkUser("hermit", { isPrivate: true });
    await mkPost(hermit.id, "behind-a-lock");
    assertEquals(await postsRepo.countLocalPublished(), 2);
  });

  await t.step("a post flagged as another instance's is not ours to count", async () => {
    // A real federated row carries no local author at all, so the join alone
    // would drop it. This asserts the `remote` predicate in its own right —
    // the guard that still holds if a post is ever ingested against a local
    // account (a CMS bridge, an import).
    await mkPost(author.id, "someone-elses", { remote: true });
    assertEquals(await postsRepo.countLocalPublished(), 2);
  });

  await t.step("a suspended author's work is withdrawn from the count", async () => {
    const banned = await mkUser("banned", { suspended: true });
    await mkPost(banned.id, "gone");
    assertEquals(await postsRepo.countLocalPublished(), 2);
  });
});

Deno.test("responses are counted, sign-ins are windowed", opts, async (t) => {
  await resetDb();
  const author = await mkUser("writer");
  const reader = await mkUser("reader");
  const post = await mkPost(author.id, "post");

  await t.step("every response on the instance counts once", async () => {
    await mkComment(post.id, reader.id);
    await mkComment(post.id, author.id);
    assertEquals(await commentsRepo.countAll(), 2);
  });

  await t.step("an account is active in a window it signed in during", async () => {
    // Two sign-ins for one account, three months apart: inside the half-year
    // window and outside the month one, and it must count once either way.
    await mkSession(author.id, new Date(Date.now() - 90 * DAY));
    await mkSession(author.id, new Date(Date.now() - 91 * DAY));
    await mkSession(reader.id, new Date(Date.now() - 2 * DAY));

    const month = new Date(Date.now() - 30 * DAY);
    const halfYear = new Date(Date.now() - 180 * DAY);
    assertEquals(await usersRepo.countActiveSince(month), 1);
    assertEquals(await usersRepo.countActiveSince(halfYear), 2);
  });

  await t.step("an account that has never signed in is not active", async () => {
    await mkUser("lurker");
    assertEquals(await usersRepo.countUsers(), 3);
    assertEquals(await usersRepo.countActiveSince(new Date(Date.now() - 180 * DAY)), 2);
  });

  await closeDb();
});
