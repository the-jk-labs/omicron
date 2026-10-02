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
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import * as recsRepo from "@/db/repositories/recommendations.ts";
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

// A cast shared by the assertions: the repo functions return rows whose `post`
// is the full column set, and the helper only needs the id.
type Rows = readonly { post: { id: string } }[];
type Post = Awaited<ReturnType<typeof mkPost>>;
type User = Awaited<ReturnType<typeof mkUser>>;

afterAll(async () => {
  await closeDb();
});

describe("feeds: a private author reaches only approved followers", () => {
  let priv: User;
  let privPost: Post;
  let pubPost: Post;
  let approved: User;
  let pending: User;
  let stranger: User;

  beforeAll(async () => {
    await resetDb();

    priv = await mkUser("priv", { isPrivate: true });
    const pub = await mkUser("pub");
    approved = await mkUser("approved");
    pending = await mkUser("pending");
    stranger = await mkUser("stranger");

    privPost = await mkPost(priv.id, "private-post");
    pubPost = await mkPost(pub.id, "public-post");

    // Everyone follows #rust; nobody follows the private author except
    // `approved`, whose follow is approved, and `pending`, whose is not.
    const rust = await mkTag("rust");
    await tagPost(privPost.id, rust.id);
    await tagPost(pubPost.id, rust.id);
    for (const u of [priv, approved, pending, stranger]) await followTag(u.id, rust.id);
    await follow(approved.id, priv.id, true);
    await follow(pending.id, priv.id, false);
  });

  const feed = (id: string) => postsRepo.listFeed(id, null) as unknown as Promise<Rows>;

  test("the followed-tag branch does not leak a private author's post", async () => {
    expect(includesPost(await feed(stranger.id), privPost.id)).toBe(false);
  });

  test("a pending follow request leaks nothing", async () => {
    expect(includesPost(await feed(pending.id), privPost.id)).toBe(false);
  });

  test("an approved follower still receives it", async () => {
    expect(includesPost(await feed(approved.id), privPost.id)).toBe(true);
  });

  test("the author still sees their own post via the tag branch", async () => {
    expect(includesPost(await feed(priv.id), privPost.id)).toBe(true);
  });

  test("a public author's post still reaches a stranger by tag", async () => {
    expect(includesPost(await feed(stranger.id), pubPost.id)).toBe(true);
  });
});

describe("feeds: recommending cannot widen a post's audience", () => {
  let privPost: Post;
  let pubPost: Post;
  let stranger: User;
  let approved: User;

  beforeAll(async () => {
    await resetDb();

    const priv = await mkUser("priv", { isPrivate: true });
    const pub = await mkUser("pub");
    const booster = await mkUser("booster");
    stranger = await mkUser("stranger");
    approved = await mkUser("approved");

    privPost = await mkPost(priv.id, "private-post");
    pubPost = await mkPost(pub.id, "public-post");

    // `booster` recommends both. `stranger` and `approved` follow `booster`;
    // only `approved` is also an approved follower of the private author.
    await recommend(booster.id, privPost.id);
    await recommend(booster.id, pubPost.id);
    await follow(stranger.id, booster.id, true);
    await follow(approved.id, booster.id, true);
    await follow(approved.id, priv.id, true);
  });

  const recFeed = (id: string) => recsRepo.listFeedFor(id, null) as unknown as Promise<Rows>;

  test("a boost of a private author's post does not reach a non-follower", async () => {
    expect(includesPost(await recFeed(stranger.id), privPost.id)).toBe(false);
  });

  test("it does reach a follower of that author", async () => {
    expect(includesPost(await recFeed(approved.id), privPost.id)).toBe(true);
  });

  test("a boost of a public post reaches everyone following the booster", async () => {
    expect(includesPost(await recFeed(stranger.id), pubPost.id)).toBe(true);
  });
});

describe("public listings exclude unpublished posts and suspended authors", () => {
  let live: Post;
  let rust: Awaited<ReturnType<typeof mkTag>>;
  let hiddenFromEveryone: Post[];

  beforeAll(async () => {
    await resetDb();

    const author = await mkUser("author");
    const suspended = await mkUser("suspended", { suspended: true });
    const priv = await mkUser("priv", { isPrivate: true });

    const draft = await mkPost(author.id, "draft-post", { status: "draft" });
    // A post waiting for its moment is as private as a draft, and is here for the
    // same reason every other row in this suite is: it is a post status that must
    // be filtered by predicates written before it existed.
    const scheduled = await mkPost(author.id, "scheduled-post", { status: "scheduled" });
    live = await mkPost(author.id, "live-post");
    const bySuspended = await mkPost(suspended.id, "suspended-post");
    const byPrivate = await mkPost(priv.id, "private-post");

    rust = await mkTag("rust");
    for (const p of [draft, scheduled, live, bySuspended, byPrivate]) await tagPost(p.id, rust.id);
    // Trending now requires >=3 posts by >=3 distinct authors to filter
    // personal/joke tags — add two more visible posts by different authors so
    // the tag is eligible and the visible-only assertion remains meaningful.
    const author2 = await mkUser("author2");
    const author3 = await mkUser("author3");
    const live2 = await mkPost(author2.id, "live-post-2");
    const live3 = await mkPost(author3.id, "live-post-3");
    for (const p of [live2, live3]) await tagPost(p.id, rust.id);

    hiddenFromEveryone = [draft, scheduled, bySuspended, byPrivate];
  });

  test("listGlobal shows only the one published post", async () => {
    const rows = (await postsRepo.listGlobal(null, null)) as unknown as Rows;
    expect(includesPost(rows, live.id)).toBe(true);
    for (const hidden of hiddenFromEveryone) {
      expect(includesPost(rows, hidden.id), `leaked ${hidden.slug}`).toBe(false);
    }
  });

  test("listByTag agrees with it", async () => {
    const rows = (await postsRepo.listByTag("rust", null, null)) as unknown as Rows;
    expect(includesPost(rows, live.id)).toBe(true);
    for (const hidden of hiddenFromEveryone) {
      expect(includesPost(rows, hidden.id), `leaked ${hidden.slug}`).toBe(false);
    }
  });

  test("the tag's advertised count matches the listing it labels", async () => {
    // how many posts are being withheld (#55). Three visible posts: `live`
    // plus the two extra authors seeded above for trending eligibility.
    expect(await tagsRepo.postCount(rust.id, null)).toBe(3);
  });

  test("trending ranks the tag by visible posts only", async () => {
    expect((await tagsRepo.trending(5))[0]?.postCount).toBe(3);
  });
});

describe("reading lists: a public list is filtered like any other listing", () => {
  let owner: User;
  let stranger: User;
  let live: Post;
  let draft: Post;
  let byPrivate: Post;
  let bySuspended: Post;
  let list: Awaited<ReturnType<typeof mkList>>;

  beforeAll(async () => {
    await resetDb();

    owner = await mkUser("owner");
    const author = await mkUser("author");
    const priv = await mkUser("priv", { isPrivate: true });
    const suspended = await mkUser("suspended", { suspended: true });
    stranger = await mkUser("stranger");

    live = await mkPost(author.id, "live-post");
    draft = await mkPost(author.id, "draft-post", { status: "draft" });
    byPrivate = await mkPost(priv.id, "private-post");
    bySuspended = await mkPost(suspended.id, "suspended-post");

    list = await mkList(owner.id, "Saved", "public");
    for (const p of [live, draft, byPrivate, bySuspended]) await addToList(list.id, p.id);
  });

  test("an anonymous reader sees only the publishable post (#41)", async () => {
    const rows = (await listsRepo.listItems(list.id, null, null)) as unknown as Rows;
    expect(includesPost(rows, live.id)).toBe(true);
    for (const hidden of [draft, byPrivate, bySuspended]) {
      expect(includesPost(rows, hidden.id), `leaked ${hidden.slug}`).toBe(false);
    }
  });

  test("a signed-in stranger sees the same", async () => {
    const rows = (await listsRepo.listItems(list.id, stranger.id, null)) as unknown as Rows;
    expect(rows.length).toBe(1);
  });

  test("the item count does not leak what the list is hiding", async () => {
    const counts = await listsRepo.itemCountsFor([list.id], null);
    expect(counts.get(list.id)).toBe(1);
  });

  test("the federated collection filters as anonymous", async () => {
    const refs = await listsRepo.itemRefs(list.id);
    expect(refs.length).toBe(1);
    expect(refs[0].id).toBe(live.id);
  });

  test("the owner's own draft is not exempted", async () => {
    // The owner may read their draft on its own page; a *public* list is a
    // published surface, so it filters for them too.
    const rows = (await listsRepo.listItems(list.id, owner.id, null)) as unknown as Rows;
    expect(includesPost(rows, draft.id)).toBe(false);
  });
});

describe("the sitemap publishes nothing a crawler cannot read", () => {
  let ids: Set<string>;
  let live: Post;
  let draft: Post;
  let scheduled: Post;
  let byPrivate: Post;
  let bySuspended: Post;

  beforeAll(async () => {
    await resetDb();

    const author = await mkUser("author");
    const priv = await mkUser("priv", { isPrivate: true });
    const suspended = await mkUser("suspended", { suspended: true });

    live = await mkPost(author.id, "live-post");
    draft = await mkPost(author.id, "draft-post", { status: "draft" });
    // Listing a scheduled post would hand a crawler the URL, title and author of
    // something nobody is meant to read yet — and the page 404s, so the entry is
    // worse than useless even ignoring the leak.
    scheduled = await mkPost(author.id, "scheduled-post", { status: "scheduled" });
    byPrivate = await mkPost(priv.id, "private-post");
    bySuspended = await mkPost(suspended.id, "suspended-post");

    const entries = await postsRepo.listSitemapEntries();
    ids = new Set(entries.map((e) => e.id));
  });

  test("only the published post is listed", () => {
    expect(ids.has(live.id)).toBe(true);
    for (const hidden of [draft, scheduled, byPrivate, bySuspended]) {
      expect(ids.has(hidden.id), `leaked ${hidden.slug}`).toBe(false);
    }
  });

  test("the count matches what is listed", async () => {
    expect(await postsRepo.countSitemapEntries()).toBe(1);
  });

  test("private and suspended authors get no profile entry", async () => {
    const profiles = (await postsRepo.listSitemapProfiles()).map((p) => p.username);
    expect(profiles).toEqual(["author"]);
  });
});
