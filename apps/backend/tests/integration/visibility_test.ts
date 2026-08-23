// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Visibility regression suite.
//
// Every case here is a bug that actually shipped. #41 (public reading lists
// serving drafts and private-account posts) and the five gaps found auditing
// every `posts` query afterwards (#55) were all found by inspection, because
// nothing in CI could execute a SQL predicate. This is that missing check.
//
// The invariant under test: any listing that can reach another user's post
// must apply `isPublished`, `notSuspended`, `notHidden(viewer)` and
// `visibleToViewer(viewer)`. A leak is a listing returning a post it should
// have filtered.
//
// Each case asserts both directions. A predicate that hides everything would
// pass a leak test and fail the "still visible" one, which is the mistake this
// suite is most likely to be asked to catch in future.
import { assertEquals, assertFalse } from "@std/assert";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as recsRepo from "@/db/repositories/recommendations.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import {
  addToList,
  closeDb,
  follow,
  followTag,
  includesPost,
  mkList,
  mkPost,
  mkTag,
  mkUser,
  recommend,
  resetDb,
  tagPost,
} from "./harness.ts";

const opts = { sanitizeResources: false, sanitizeOps: false };

// A cast shared by the assertions: the repo functions return rows whose `post`
// is the full column set, and the helper only needs the id.
type Rows = readonly { post: { id: string } }[];

Deno.test("feeds: a private author reaches only approved followers", opts, async (t) => {
  await resetDb();

  const priv = await mkUser("priv", { isPrivate: true });
  const pub = await mkUser("pub");
  const approved = await mkUser("approved");
  const pending = await mkUser("pending");
  const stranger = await mkUser("stranger");

  const privPost = await mkPost(priv.id, "private-post");
  const pubPost = await mkPost(pub.id, "public-post");

  // Everyone follows #rust; nobody follows the private author except
  // `approved`, whose follow is approved, and `pending`, whose is not.
  const rust = await mkTag("rust");
  await tagPost(privPost.id, rust.id);
  await tagPost(pubPost.id, rust.id);
  for (const u of [priv, approved, pending, stranger]) await followTag(u.id, rust.id);
  await follow(approved.id, priv.id, true);
  await follow(pending.id, priv.id, false);

  const feed = (id: string) => postsRepo.listFeed(id, null) as unknown as Promise<Rows>;

  await t.step("the followed-tag branch does not leak a private author's post", async () => {
    assertFalse(includesPost(await feed(stranger.id), privPost.id));
  });

  await t.step("a pending follow request leaks nothing", async () => {
    assertFalse(includesPost(await feed(pending.id), privPost.id));
  });

  await t.step("an approved follower still receives it", async () => {
    assertEquals(includesPost(await feed(approved.id), privPost.id), true);
  });

  await t.step("the author still sees their own post via the tag branch", async () => {
    assertEquals(includesPost(await feed(priv.id), privPost.id), true);
  });

  await t.step("a public author's post still reaches a stranger by tag", async () => {
    assertEquals(includesPost(await feed(stranger.id), pubPost.id), true);
  });
});

Deno.test("feeds: recommending cannot widen a post's audience", opts, async (t) => {
  await resetDb();

  const priv = await mkUser("priv", { isPrivate: true });
  const pub = await mkUser("pub");
  const booster = await mkUser("booster");
  const stranger = await mkUser("stranger");
  const approved = await mkUser("approved");

  const privPost = await mkPost(priv.id, "private-post");
  const pubPost = await mkPost(pub.id, "public-post");

  // `booster` recommends both. `stranger` and `approved` follow `booster`;
  // only `approved` is also an approved follower of the private author.
  await recommend(booster.id, privPost.id);
  await recommend(booster.id, pubPost.id);
  await follow(stranger.id, booster.id, true);
  await follow(approved.id, booster.id, true);
  await follow(approved.id, priv.id, true);

  const recFeed = (id: string) => recsRepo.listFeedFor(id, null) as unknown as Promise<Rows>;

  await t.step("a boost of a private author's post does not reach a non-follower", async () => {
    assertFalse(includesPost(await recFeed(stranger.id), privPost.id));
  });

  await t.step("it does reach a follower of that author", async () => {
    assertEquals(includesPost(await recFeed(approved.id), privPost.id), true);
  });

  await t.step("a boost of a public post reaches everyone following the booster", async () => {
    assertEquals(includesPost(await recFeed(stranger.id), pubPost.id), true);
  });
});

Deno.test("public listings exclude unpublished posts and suspended authors", opts, async (t) => {
  await resetDb();

  const author = await mkUser("author");
  const suspended = await mkUser("suspended", { suspended: true });
  const priv = await mkUser("priv", { isPrivate: true });

  const draft = await mkPost(author.id, "draft-post", { status: "draft" });
  // A post waiting for its moment is as private as a draft, and is here for the
  // same reason every other row in this suite is: it is a post status that must
  // be filtered by predicates written before it existed.
  const scheduled = await mkPost(author.id, "scheduled-post", { status: "scheduled" });
  const live = await mkPost(author.id, "live-post");
  const bySuspended = await mkPost(suspended.id, "suspended-post");
  const byPrivate = await mkPost(priv.id, "private-post");

  const rust = await mkTag("rust");
  for (const p of [draft, scheduled, live, bySuspended, byPrivate]) await tagPost(p.id, rust.id);
  // Trending now requires >=3 posts by >=3 distinct authors to filter
  // personal/joke tags — add two more visible posts by different authors so
  // the tag is eligible and the visible-only assertion remains meaningful.
  const author2 = await mkUser("author2");
  const author3 = await mkUser("author3");
  const live2 = await mkPost(author2.id, "live-post-2");
  const live3 = await mkPost(author3.id, "live-post-3");
  for (const p of [live2, live3]) await tagPost(p.id, rust.id);

  const hiddenFromEveryone = [draft, scheduled, bySuspended, byPrivate];

  await t.step("listGlobal shows only the one published post", async () => {
    const rows = await postsRepo.listGlobal(null, null) as unknown as Rows;
    assertEquals(includesPost(rows, live.id), true);
    for (const hidden of hiddenFromEveryone) {
      assertFalse(includesPost(rows, hidden.id), `leaked ${hidden.slug}`);
    }
  });

  await t.step("listByTag agrees with it", async () => {
    const rows = await postsRepo.listByTag("rust", null, null) as unknown as Rows;
    assertEquals(includesPost(rows, live.id), true);
    for (const hidden of hiddenFromEveryone) {
      assertFalse(includesPost(rows, hidden.id), `leaked ${hidden.slug}`);
    }
  });

  await t.step("the tag's advertised count matches the listing it labels", async () => {
    // A count taken over a wider set than the list beneath it tells the reader
    // how many posts are being withheld (#55).
    assertEquals(await tagsRepo.postCount(rust.id, null), 1);
  });

  await t.step("trending ranks the tag by visible posts only", async () => {
    assertEquals((await tagsRepo.trending(5))[0]?.postCount, 3);
  });
});

Deno.test("reading lists: a public list is filtered like any other listing", opts, async (t) => {
  await resetDb();

  const owner = await mkUser("owner");
  const author = await mkUser("author");
  const priv = await mkUser("priv", { isPrivate: true });
  const suspended = await mkUser("suspended", { suspended: true });
  const stranger = await mkUser("stranger");

  const live = await mkPost(author.id, "live-post");
  const draft = await mkPost(author.id, "draft-post", { status: "draft" });
  const byPrivate = await mkPost(priv.id, "private-post");
  const bySuspended = await mkPost(suspended.id, "suspended-post");

  const list = await mkList(owner.id, "Saved", "public");
  for (const p of [live, draft, byPrivate, bySuspended]) await addToList(list.id, p.id);

  await t.step("an anonymous reader sees only the publishable post (#41)", async () => {
    const rows = await listsRepo.listItems(list.id, null, null) as unknown as Rows;
    assertEquals(includesPost(rows, live.id), true);
    for (const hidden of [draft, byPrivate, bySuspended]) {
      assertFalse(includesPost(rows, hidden.id), `leaked ${hidden.slug}`);
    }
  });

  await t.step("a signed-in stranger sees the same", async () => {
    const rows = await listsRepo.listItems(list.id, stranger.id, null) as unknown as Rows;
    assertEquals(rows.length, 1);
  });

  await t.step("the item count does not leak what the list is hiding", async () => {
    const counts = await listsRepo.itemCountsFor([list.id], null);
    assertEquals(counts.get(list.id), 1);
  });

  await t.step("the federated collection filters as anonymous", async () => {
    const refs = await listsRepo.itemRefs(list.id);
    assertEquals(refs.length, 1);
    assertEquals(refs[0].id, live.id);
  });

  await t.step("the owner's own draft is not exempted", async () => {
    // The owner may read their draft on its own page; a *public* list is a
    // published surface, so it filters for them too.
    const rows = await listsRepo.listItems(list.id, owner.id, null) as unknown as Rows;
    assertFalse(includesPost(rows, draft.id));
  });
});

Deno.test("the sitemap publishes nothing a crawler cannot read", opts, async (t) => {
  await resetDb();

  const author = await mkUser("author");
  const priv = await mkUser("priv", { isPrivate: true });
  const suspended = await mkUser("suspended", { suspended: true });

  const live = await mkPost(author.id, "live-post");
  const draft = await mkPost(author.id, "draft-post", { status: "draft" });
  // Listing a scheduled post would hand a crawler the URL, title and author of
  // something nobody is meant to read yet — and the page 404s, so the entry is
  // worse than useless even ignoring the leak.
  const scheduled = await mkPost(author.id, "scheduled-post", { status: "scheduled" });
  const byPrivate = await mkPost(priv.id, "private-post");
  const bySuspended = await mkPost(suspended.id, "suspended-post");

  const entries = await postsRepo.listSitemapEntries();
  const ids = new Set(entries.map((e) => e.id));

  await t.step("only the published post is listed", () => {
    assertEquals(ids.has(live.id), true);
    for (const hidden of [draft, scheduled, byPrivate, bySuspended]) {
      assertFalse(ids.has(hidden.id), `leaked ${hidden.slug}`);
    }
  });

  await t.step("the count matches what is listed", async () => {
    assertEquals(await postsRepo.countSitemapEntries(), 1);
  });

  await t.step("private and suspended authors get no profile entry", async () => {
    const profiles = (await postsRepo.listSitemapProfiles()).map((p) => p.username);
    assertEquals(profiles, ["author"]);
  });
});

// Runs last: closes the shared pool so the process exits cleanly.
Deno.test("teardown", opts, async () => {
  await closeDb();
});
