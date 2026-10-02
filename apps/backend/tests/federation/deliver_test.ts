// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Note } from "@fedify/fedify/vocab";
import { Article, Create, Delete, Person, PUBLIC_COLLECTION, Tombstone, Update } from "@fedify/fedify/vocab";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { commentRow, postWithAuthor, remotePostWithAuthor, userRow } from "../fixtures.ts";
import { fakeContext } from "./fakeContext.ts";

const ORIGIN = "https://blog.example";
const fake = vi.hoisted(() => ({ value: null as unknown }));

vi.mock(import("@/federation/mod.ts"), () => ({
  getFederation: (() => ({ createContext: () => (fake.value as { ctx: unknown }).ctx })) as never,
}));
vi.mock(import("@/db/repositories/blockedDomains.ts"));
vi.mock(import("@/db/repositories/comments.ts"));
vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/tags.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/db/repositories/profileLinks.ts"));
vi.mock(import("@/db/repositories/readingLists.ts"));

import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as linksRepo from "@/db/repositories/profileLinks.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import {
  deliverActorUpdate,
  deliverComment,
  deliverCommentDelete,
  deliverPost,
  deliverPostDelete,
} from "@/federation/deliver.ts";
import { hostMatchesDomain } from "@/lib/domain.ts";
import { seedFederationOrigin } from "@/services/federationState.ts";

const f = fakeContext(ORIGIN);
fake.value = f;
seedFederationOrigin(ORIGIN);

const BOB = "https://remote.example/users/bob";
const CAROL = "https://other.example/users/carol";
const ADA = `${ORIGIN}/users/ada`;
const POST_ID = "52683dce-2d3a-4b1c-9e5f-123456789abc";

const ada = userRow({ id: "ada-id", username: "ada" });
const author = userRow({ id: "author-id", username: "writer" });

beforeEach(() => {
  f.reset();
  f.remote(BOB);
  f.remote(CAROL);
  vi.mocked(usersRepo.findById).mockImplementation(((id: string) =>
    Promise.resolve(id === "ada-id" ? ada : id === "author-id" ? author : undefined)) as never);
  vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue([BOB]);
  vi.mocked(blockedDomainsRepo.isBlocked).mockResolvedValue(false);
  vi.mocked(tagsRepo.tagsForPost).mockResolvedValue([]);
  vi.mocked(tagsRepo.tagsForUser).mockResolvedValue([]);
  vi.mocked(linksRepo.listForUser).mockResolvedValue([]);
  vi.mocked(listsRepo.listForUser).mockResolvedValue([]);
  vi.mocked(postsRepo.findById).mockResolvedValue(
    postWithAuthor({ id: POST_ID, title: "Hi" }, { id: "ada-id", username: "ada" }),
  );
});

describe("deliverPost", () => {
  test("a public author's post goes out as Create(Article): to Public, cc followers", async () => {
    await deliverPost(POST_ID);
    const { sender, recipients, activity } = f.sent[0];
    expect([sender, recipients]).toEqual(["ada", [BOB]]);
    expect(activity).toBeInstanceOf(Create);
    expect(activity.id?.href).toBe(`${ORIGIN}/posts/${POST_ID}/activity`);
    expect(activity.toIds.map((u) => u.href)).toEqual([PUBLIC_COLLECTION.href]);
    const article = (await activity.getObject()) as Article;
    expect(article).toBeInstanceOf(Article);
    expect(article.id?.href).toBe(`${ORIGIN}/posts/${POST_ID}`);
    expect(article.ccIds.map((u) => u.href)).toEqual([`${ADA}/followers`]);
  });

  test("a private author's post is addressed to followers only, never Public", async () => {
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "ada-id", username: "ada", isPrivate: true }));
    await deliverPost(POST_ID);
    const { activity } = f.sent[0];
    const article = (await activity.getObject()) as Article;
    const everyone = [...activity.toIds, ...activity.ccIds, ...article.toIds, ...article.ccIds].map((u) => u.href);
    expect(everyone).not.toContain(PUBLIC_COLLECTION.href);
    expect(article.toIds.map((u) => u.href)).toEqual([`${ADA}/followers`]);
    // The replies collection is public, so a followers-only Article never names it.
    expect(article.repliesId).toBe(null);
  });

  test("an edit goes out as Update with a fresh id and the same Article id", async () => {
    await deliverPost(POST_ID, "update");
    await deliverPost(POST_ID, "update");
    const [a, b] = f.sent.map((s) => s.activity);
    expect(a).toBeInstanceOf(Update);
    expect(a.id?.href).not.toBe(b.id?.href);
    expect(((await a.getObject()) as Article).id?.href).toBe(`${ORIGIN}/posts/${POST_ID}`);
  });

  test("skips followers on a defederated domain", async () => {
    vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue([BOB, CAROL]);
    vi.mocked(blockedDomainsRepo.isBlocked).mockImplementation(async (host) => host === "remote.example");
    await deliverPost(POST_ID);
    expect(f.sent[0].recipients).toEqual([CAROL]);
  });

  // BUG: like the inbox, the fan-out checks new URL(uri).host, which keeps the
  // port, so a follower on a defederated domain's non-default port still gets
  // every post.
  test.fails("BUG: skips followers on a defederated domain's non-default port", async () => {
    const PORTED = "https://remote.example:8443/users/eve";
    f.remote(PORTED);
    vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue([PORTED, CAROL]);
    vi.mocked(blockedDomainsRepo.isBlocked).mockImplementation(async (host) =>
      hostMatchesDomain(host, "remote.example"),
    );
    await deliverPost(POST_ID);
    expect(f.sent[0].recipients).toEqual([CAROL]);
  });

  test("skips unparseable and unresolvable follower URIs", async () => {
    vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue(["not a url", "https://gone.example/u/x", BOB]);
    await deliverPost(POST_ID);
    expect(f.sent[0].recipients).toEqual([BOB]);
  });

  test.for([
    ["a missing post", null],
    ["a remote post", remotePostWithAuthor({ id: POST_ID })],
  ])("never federates %s", async ([, row]) => {
    vi.mocked(postsRepo.findById).mockResolvedValue(row as never);
    await deliverPost(POST_ID);
    expect(f.sent).toEqual([]);
  });

  test("nothing goes out without remote followers", async () => {
    vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue([]);
    await deliverPost(POST_ID);
    expect(f.sent).toEqual([]);
  });
});

describe("deliverPostDelete", () => {
  test("sends a Tombstone with the Article's id", async () => {
    await deliverPostDelete(POST_ID, "ada-id");
    const { activity } = f.sent[0];
    expect(activity).toBeInstanceOf(Delete);
    const tomb = (await activity.getObject()) as Tombstone;
    expect(tomb).toBeInstanceOf(Tombstone);
    expect(tomb.id?.href).toBe(`${ORIGIN}/posts/${POST_ID}`);
  });

  test("is a no-op for a vanished author", async () => {
    await deliverPostDelete(POST_ID, "nobody");
    expect(f.sent).toEqual([]);
  });
});

describe("deliverActorUpdate", () => {
  test("sends Update(Person) of the current profile", async () => {
    await deliverActorUpdate("ada-id");
    const { activity } = f.sent[0];
    expect(activity).toBeInstanceOf(Update);
    const person = (await activity.getObject()) as Person;
    expect(person).toBeInstanceOf(Person);
    expect(person.id?.href).toBe(ADA);
  });
});

describe("deliverComment", () => {
  beforeEach(() => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(
      commentRow({ id: "c1", postId: POST_ID, authorId: "author-id", content: "nice <post>", apId: null }),
    );
    vi.mocked(followsRepo.remoteFollowerActors).mockImplementation(async (id) =>
      id === "author-id" ? [CAROL] : [BOB],
    );
  });

  test("Create(Note) to the commenter's and the post author's followers, deduplicated", async () => {
    vi.mocked(followsRepo.remoteFollowerActors).mockImplementation(async (id) =>
      id === "author-id" ? [CAROL, BOB] : [BOB],
    );
    await deliverComment("c1");
    const { sender, recipients, activity } = f.sent[0];
    expect(sender).toBe("writer");
    expect(recipients.toSorted()).toEqual([BOB, CAROL].toSorted());
    expect(activity).toBeInstanceOf(Create);
    const note = (await activity.getObject()) as Note;
    expect(note.id?.href).toBe(`${ORIGIN}/users/writer/comments/c1`);
    expect(note.content?.toString()).toBe("<p>nice &lt;post&gt;</p>");
    expect(note.replyTargetId?.href).toBe(`${ORIGIN}/posts/${POST_ID}`);
  });

  test("an edit is an Update of the same Note", async () => {
    await deliverComment("c1", "update");
    const { activity } = f.sent[0];
    expect(activity).toBeInstanceOf(Update);
    expect(((await activity.getObject()) as Note).id?.href).toBe(`${ORIGIN}/users/writer/comments/c1`);
  });

  test("a reply to a cached remote post also reaches that post's author", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(
      remotePostWithAuthor({ id: POST_ID, apId: "https://remote.example/posts/7" }),
    );
    f.remote("https://remote.example/posts/7");
    vi.mocked(followsRepo.remoteFollowerActors).mockResolvedValue([]);
    await deliverComment("c1");
    expect(f.sent[0].recipients).toEqual(["https://remote.example/posts/7"]);
  });

  test("a comment on a private author's or a draft post never leaves", async () => {
    vi.mocked(usersRepo.findById).mockImplementation(((id: string) =>
      Promise.resolve(
        id === "author-id" ? author : userRow({ id: "ada-id", username: "ada", isPrivate: true }),
      )) as never);
    await deliverComment("c1");
    vi.mocked(usersRepo.findById).mockImplementation(((id: string) =>
      Promise.resolve(id === "ada-id" ? ada : author)) as never);
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: POST_ID, status: "draft" }, { id: "ada-id" }));
    await deliverComment("c1");
    expect(f.sent).toEqual([]);
  });

  test("a remote or missing comment is never federated by us", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ authorId: null, remoteActorId: "x" }));
    await deliverComment("c1");
    vi.mocked(commentsRepo.findById).mockResolvedValue(null as never);
    await deliverComment("c1");
    expect(f.sent).toEqual([]);
  });
});

describe("deliverCommentDelete", () => {
  test("sends a Tombstone with the comment's Note id", async () => {
    await deliverCommentDelete("c1", "author-id", POST_ID);
    const { activity } = f.sent[0];
    expect(activity).toBeInstanceOf(Delete);
    expect(((await activity.getObject()) as Tombstone).id?.href).toBe(`${ORIGIN}/users/writer/comments/c1`);
  });

  test("never for a post that was not federable", async () => {
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: POST_ID, status: "draft" }, { id: "ada-id" }));
    await deliverCommentDelete("c1", "author-id", POST_ID);
    expect(f.sent).toEqual([]);
  });
});
