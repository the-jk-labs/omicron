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
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { closeDb, mkComment, mkPost, mkSession, mkUser, resetDb } from "./harness.ts";

const DAY = 24 * 3_600_000;

afterAll(async () => {
  await closeDb();
});

describe("local post count is what this instance actually published", () => {
  let author: Awaited<ReturnType<typeof mkUser>>;

  beforeAll(async () => {
    await resetDb();
    author = await mkUser("writer");

    await mkPost(author.id, "published");
    await mkPost(author.id, "draft", { status: "draft" });
    await mkPost(author.id, "scheduled", { status: "scheduled" });
  });

  test("counts published posts, never drafts or scheduled ones", async () => {
    expect(await postsRepo.countLocalPublished()).toBe(1);
  });

  test("a private author's posts are still this node's", async () => {
    const hermit = await mkUser("hermit", { isPrivate: true });
    await mkPost(hermit.id, "behind-a-lock");
    expect(await postsRepo.countLocalPublished()).toBe(2);
  });

  test("a post flagged as another instance's is not ours to count", async () => {
    // A real federated row carries no local author at all, so the join alone
    // would drop it. This asserts the `remote` predicate in its own right —
    // the guard that still holds if a post is ever ingested against a local
    // account (a CMS bridge, an import).
    await mkPost(author.id, "someone-elses", { remote: true });
    expect(await postsRepo.countLocalPublished()).toBe(2);
  });

  test("a suspended author's work is withdrawn from the count", async () => {
    const banned = await mkUser("banned", { suspended: true });
    await mkPost(banned.id, "gone");
    expect(await postsRepo.countLocalPublished()).toBe(2);
  });
});

describe("responses are counted, sign-ins are windowed", () => {
  let author: Awaited<ReturnType<typeof mkUser>>;
  let reader: Awaited<ReturnType<typeof mkUser>>;
  let post: Awaited<ReturnType<typeof mkPost>>;

  beforeAll(async () => {
    await resetDb();
    author = await mkUser("writer");
    reader = await mkUser("reader");
    post = await mkPost(author.id, "post");
  });

  test("every response on the instance counts once", async () => {
    await mkComment(post.id, reader.id);
    await mkComment(post.id, author.id);
    expect(await commentsRepo.countAll()).toBe(2);
  });

  test("an account is active in a window it signed in during", async () => {
    // Two sign-ins for one account, three months apart: inside the half-year
    // window and outside the month one, and it must count once either way.
    await mkSession(author.id, new Date(Date.now() - 90 * DAY));
    await mkSession(author.id, new Date(Date.now() - 91 * DAY));
    await mkSession(reader.id, new Date(Date.now() - 2 * DAY));

    const month = new Date(Date.now() - 30 * DAY);
    const halfYear = new Date(Date.now() - 180 * DAY);
    expect(await usersRepo.countActiveSince(month)).toBe(1);
    expect(await usersRepo.countActiveSince(halfYear)).toBe(2);
  });

  test("an account that has never signed in is not active", async () => {
    await mkUser("lurker");
    expect(await usersRepo.countUsers()).toBe(3);
    expect(await usersRepo.countActiveSince(new Date(Date.now() - 180 * DAY))).toBe(2);
  });
});
