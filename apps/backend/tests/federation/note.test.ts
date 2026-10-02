// SPDX-License-Identifier: AGPL-3.0-or-later
// Federated replies: the URI scheme shared by the Note dispatcher, outbound
// delivery and inbox routing must agree, only public-post comments may
// federate in either direction, and inbound Notes are stored only under the
// guards in note.ts. Repositories are stubbed; Notes are real Fedify vocab
// objects and the Fedify context is reduced to the one call made on it
// (lookupObject).
import { Note, Person, PUBLIC_COLLECTION } from "@fedify/fedify/vocab";
import { beforeEach, describe, expect, it, test, vi } from "vitest";
import { commentRow, postWithAuthor, remoteActorRow, remotePostWithAuthor, userRow } from "../fixtures.ts";

vi.mock(import("@/db/repositories/comments.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/relations.ts"));
vi.mock(import("@/db/repositories/remoteActors.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/db/repositories/notifications.ts"));
vi.mock(import("@/federation/remote.ts"));

import * as commentsRepo from "@/db/repositories/comments.ts";
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import {
  commentApUri,
  findCommentByApUri,
  findPostByApUri,
  ingestNote,
  ingestNoteDelete,
  ingestNoteUpdate,
  isCommentFederable,
  noteContext,
  noteText,
  parseLocalCommentRef,
  parseLocalPostRef,
  postApUri,
  repliesPayload,
} from "@/federation/note.ts";
import { cacheActor } from "@/federation/remote.ts";
import { htmlToText, textToNoteHtml } from "@/lib/html.ts";
import { seedFederationOrigin } from "@/services/federationState.ts";

const ORIGIN = "https://blog.example";
seedFederationOrigin(ORIGIN);

const POST_ID = "52683dce-2d3a-4b1c-9e5f-123456789abc";
const bobActor = new Person({ id: new URL("https://remote.example/users/bob") });
const bobCached = remoteActorRow({ id: "actor-bob", apId: "https://remote.example/users/bob" });
const localPost = postWithAuthor({ id: POST_ID }, { id: "author" });

const ctx = { lookupObject: vi.fn<(uri: string | URL) => Promise<unknown>>() };

function note(overrides: Partial<ConstructorParameters<typeof Note>[0]> = {}) {
  return new Note({
    id: new URL("https://remote.example/notes/1"),
    attribution: new URL("https://remote.example/users/bob"),
    content: "<p>Great <b>post</b> &amp; thanks</p>",
    to: PUBLIC_COLLECTION,
    replyTarget: new URL(`${ORIGIN}/posts/${POST_ID}`),
    ...overrides,
  });
}

beforeEach(() => {
  ctx.lookupObject.mockResolvedValue(bobActor);
  vi.mocked(commentsRepo.findByApId).mockResolvedValue(undefined as never);
  vi.mocked(postsRepo.findByApId).mockResolvedValue(undefined);
  vi.mocked(postsRepo.findById).mockImplementation(async (id) => (id === POST_ID ? localPost : null));
  vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "author" }));
  vi.mocked(cacheActor).mockResolvedValue(bobCached);
  vi.mocked(relationsRepo.hasRemote).mockResolvedValue(false);
  vi.mocked(commentsRepo.createRemote).mockImplementation(async (data) => commentRow({ id: "new", ...data }));
});

describe("findPostByApUri", () => {
  test("an exact cached apId wins", async () => {
    vi.mocked(postsRepo.findByApId).mockResolvedValue({ id: "cached" } as never);
    vi.mocked(postsRepo.findById).mockResolvedValue(remotePostWithAuthor({ id: "cached" }));
    expect((await findPostByApUri("https://remote.example/posts/9"))?.post.id).toBe("cached");
  });

  test("our own /posts/{id} address resolves a local post", async () => {
    expect((await findPostByApUri(`${ORIGIN}/posts/${POST_ID}`))?.post.id).toBe(POST_ID);
  });

  test("a /posts/ path on another origin is not ours", async () => {
    expect(await findPostByApUri(`https://evil.example/posts/${POST_ID}`)).toBe(null);
  });
});

describe("findCommentByApUri", () => {
  test("exact apId first, then our own comment path", async () => {
    vi.mocked(commentsRepo.findByApId).mockResolvedValueOnce(commentRow({ id: "by-ap" }));
    expect((await findCommentByApUri("https://remote.example/notes/1"))?.id).toBe("by-ap");
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ id: "local" }));
    expect((await findCommentByApUri(`${ORIGIN}/users/ada/comments/local`))?.id).toBe("local");
    expect(commentsRepo.findById).toHaveBeenCalledWith("local");
  });

  test("a foreign origin or a non-comment path is null", async () => {
    expect(await findCommentByApUri("https://evil.example/users/ada/comments/x")).toBe(null);
    expect(await findCommentByApUri(`${ORIGIN}/posts/x`)).toBe(null);
  });
});

describe("ingestNote", () => {
  test("stores a public reply to a local post as flattened text and notifies the author", async () => {
    const comment = await ingestNote(ctx as never, note());
    expect(commentsRepo.createRemote).toHaveBeenCalledWith({
      postId: POST_ID,
      remoteActorId: "actor-bob",
      parentId: null,
      content: "Great post & thanks",
      apId: "https://remote.example/notes/1",
      createdAt: undefined,
    });
    expect(comment?.id).toBe("new");
    expect(notificationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "author", type: "comment", remoteActorId: "actor-bob", postId: POST_ID }),
    );
  });

  test("redelivery returns the stored comment without writing", async () => {
    vi.mocked(commentsRepo.findByApId).mockResolvedValue(commentRow({ id: "old" }));
    expect((await ingestNote(ctx as never, note()))?.id).toBe("old");
    expect(commentsRepo.createRemote).not.toHaveBeenCalled();
  });

  test("a followers-only Note is never stored", async () => {
    expect(await ingestNote(ctx as never, note({ to: new URL("https://remote.example/users/bob/followers") }))).toBe(
      undefined,
    );
    expect(commentsRepo.createRemote).not.toHaveBeenCalled();
  });

  test("a Note whose id is not on its author's origin is refused (impersonation)", async () => {
    expect(await ingestNote(ctx as never, note({ id: new URL("https://other.example/notes/1") }))).toBe(undefined);
  });

  test("an echo of our own Note is ignored", async () => {
    ctx.lookupObject.mockResolvedValue(new Person({ id: new URL(`${ORIGIN}/users/ada`) }));
    expect(await ingestNote(ctx as never, note({ id: new URL(`${ORIGIN}/users/ada/comments/1`) }))).toBe(undefined);
  });

  test("a Note that replies to nothing of ours is ordinary traffic", async () => {
    expect(
      await ingestNote(ctx as never, note({ replyTarget: new URL("https://remote.example/notes/elsewhere") })),
    ).toBe(undefined);
  });

  test("a reply on a private author's or unpublished post stays out", async () => {
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "author", isPrivate: true }));
    expect(await ingestNote(ctx as never, note())).toBe(undefined);
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "author" }));
    vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: POST_ID, status: "draft" }, { id: "author" }));
    expect(await ingestNote(ctx as never, note())).toBe(undefined);
    expect(commentsRepo.createRemote).not.toHaveBeenCalled();
  });

  test("an author who blocked the replier never receives the reply", async () => {
    vi.mocked(relationsRepo.hasRemote).mockResolvedValue(true);
    expect(await ingestNote(ctx as never, note())).toBe(undefined);
  });

  test("a Note with nothing renderable is dropped", async () => {
    expect(await ingestNote(ctx as never, note({ content: "<p>  </p>" }))).toBe(undefined);
  });

  test("an over-long body is capped at 2000 characters", async () => {
    await ingestNote(ctx as never, note({ content: `<p>${"x".repeat(5000)}</p>` }));
    expect(vi.mocked(commentsRepo.createRemote).mock.calls[0][0].content).toHaveLength(2000);
  });

  test("a reply to a comment flattens to its top-level parent and pings its local author", async () => {
    vi.mocked(commentsRepo.findByApId).mockImplementation(async (href) =>
      href === "https://remote.example/notes/parent"
        ? commentRow({ id: "child", postId: POST_ID, parentId: "top", authorId: "carol" })
        : (undefined as never),
    );
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ id: "top", authorId: "carol" }));
    await ingestNote(ctx as never, note({ replyTarget: new URL("https://remote.example/notes/parent") }));
    expect(vi.mocked(commentsRepo.createRemote).mock.calls[0][0].parentId).toBe("top");
    expect(vi.mocked(notificationsRepo.create).mock.calls.map(([n]) => [n.type, n.recipientId])).toEqual([
      ["comment", "author"],
      ["reply", "carol"],
    ]);
  });

  test("keeps the remote publish time", async () => {
    await ingestNote(ctx as never, note({ published: Temporal.Instant.from("2026-01-02T03:04:05Z") }));
    expect(vi.mocked(commentsRepo.createRemote).mock.calls[0][0].createdAt).toEqual(new Date("2026-01-02T03:04:05Z"));
  });
});

describe("ingestNoteUpdate / ingestNoteDelete", () => {
  test("the author's edit re-flattens the stored text", async () => {
    vi.mocked(commentsRepo.findByApId).mockResolvedValue(commentRow({ id: "c1", remoteActorId: "actor-bob" }));
    vi.mocked(remoteActorsRepo.findByApId).mockResolvedValue(bobCached);
    await ingestNoteUpdate(ctx as never, note({ content: "<p>edited</p>" }));
    expect(commentsRepo.update).toHaveBeenCalledWith("c1", "edited");
  });

  test("someone else's edit is ignored", async () => {
    vi.mocked(commentsRepo.findByApId).mockResolvedValue(commentRow({ id: "c1", remoteActorId: "actor-bob" }));
    vi.mocked(remoteActorsRepo.findByApId).mockResolvedValue(remoteActorRow({ id: "actor-mallory" }));
    await ingestNoteUpdate(ctx as never, note());
    expect(commentsRepo.update).not.toHaveBeenCalled();
  });

  test("a local comment can never be edited from outside", async () => {
    vi.mocked(commentsRepo.findByApId).mockResolvedValue(commentRow({ id: "c1", authorId: "ada" }));
    await ingestNoteUpdate(ctx as never, note());
    expect(commentsRepo.update).not.toHaveBeenCalled();
  });

  test("delete drops only the deleter's own cached reply", async () => {
    vi.mocked(commentsRepo.findByApId).mockResolvedValue(commentRow({ id: "c1", remoteActorId: "actor-bob" }));
    vi.mocked(remoteActorsRepo.findByApId).mockResolvedValue(bobCached);
    await ingestNoteDelete("https://remote.example/notes/1", "https://remote.example/users/bob");
    expect(commentsRepo.remove).toHaveBeenCalledWith("c1");
    vi.mocked(remoteActorsRepo.findByApId).mockResolvedValue(remoteActorRow({ id: "actor-mallory" }));
    vi.mocked(commentsRepo.remove).mockClear();
    await ingestNoteDelete("https://remote.example/notes/1", "https://evil.example/users/mallory");
    expect(commentsRepo.remove).not.toHaveBeenCalled();
  });
});

describe("noteContext", () => {
  test("mints the stable Note id once and threads under the post", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(
      commentRow({ id: "c1", postId: POST_ID, authorId: "ada", apId: null }),
    );
    vi.mocked(usersRepo.findById).mockImplementation(((id: string) =>
      Promise.resolve(id === "ada" ? userRow({ id: "ada", username: "ada" }) : userRow({ id: "author" }))) as never);
    const out = await noteContext(ORIGIN, "ada", "c1");
    expect(out).toMatchObject({
      noteId: `${ORIGIN}/users/ada/comments/c1`,
      inReplyTo: `${ORIGIN}/posts/${POST_ID}`,
      postUrl: `${ORIGIN}/posts/${POST_ID}`,
      postAuthorId: "author",
      postApId: null,
    });
    expect(commentsRepo.setApId).toHaveBeenCalledWith("c1", `${ORIGIN}/users/ada/comments/c1`);
  });

  test("a reply threads under its parent's Note", async () => {
    vi.mocked(commentsRepo.findById).mockImplementation(async (id) =>
      id === "c2"
        ? commentRow({ id: "c2", postId: POST_ID, authorId: "ada", parentId: "c1", apId: "existing" })
        : commentRow({ id: "c1", apId: "https://remote.example/notes/parent" }),
    );
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "ada", username: "ada" }));
    const out = await noteContext(ORIGIN, "ada", "c2");
    expect(out?.inReplyTo).toBe("https://remote.example/notes/parent");
    expect(commentsRepo.setApId).not.toHaveBeenCalled();
  });

  test("is null for a remote comment, a mismatched identifier, or a private post", async () => {
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ authorId: null, remoteActorId: "x" }));
    expect(await noteContext(ORIGIN, "ada", "c1")).toBe(null);
    vi.mocked(commentsRepo.findById).mockResolvedValue(commentRow({ id: "c1", postId: POST_ID, authorId: "ada" }));
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "ada", username: "ada" }));
    expect(await noteContext(ORIGIN, "someone-else", "c1")).toBe(null);
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "ada", username: "ada", isPrivate: true }));
    expect(await noteContext(ORIGIN, "ada", "c1")).toBe(null);
  });
});

describe("repliesPayload", () => {
  test("serves local and remote responses as an OrderedCollection", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ id: "author", username: "ada" }));
    vi.mocked(commentsRepo.listForReplies).mockResolvedValue([
      {
        comment: commentRow({ id: "c1", content: "local <reply>", apId: null }),
        author: { username: "ada" },
        remoteActor: null,
      },
      {
        comment: commentRow({ id: "c2", content: "remote", apId: "https://remote.example/notes/2" }),
        author: null,
        remoteActor: { apId: "https://remote.example/users/bob" },
      },
    ] as never);
    vi.mocked(commentsRepo.countTopLevel).mockResolvedValue(2);
    const payload = (await repliesPayload(ORIGIN, "ada", POST_ID)) as Record<string, unknown>;
    expect(payload.type).toBe("OrderedCollection");
    expect(payload.id).toBe(`${ORIGIN}/users/ada/posts/${POST_ID}/replies`);
    expect(payload.totalItems).toBe(2);
    const items = payload.orderedItems as Record<string, unknown>[];
    expect(items[0]).toMatchObject({ id: `${ORIGIN}/users/ada/comments/c1`, content: "<p>local &lt;reply&gt;</p>" });
    expect(items[1]).toMatchObject({
      id: "https://remote.example/notes/2",
      attributedTo: "https://remote.example/users/bob",
    });
  });

  test("is null for an unknown user, someone else's post, or a private author", async () => {
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(undefined);
    expect(await repliesPayload(ORIGIN, "ghost", POST_ID)).toBe(null);
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ id: "other" }));
    expect(await repliesPayload(ORIGIN, "other", POST_ID)).toBe(null);
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(userRow({ id: "author", isPrivate: true }));
    expect(await repliesPayload(ORIGIN, "ada", POST_ID)).toBe(null);
  });
});

describe("commentApUri / parseLocalCommentRef", () => {
  it("round-trips a local comment URI", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const uri = commentApUri(ORIGIN, "alice", id);
    expect(uri).toBe(`${ORIGIN}/users/alice/comments/${id}`);
    expect(parseLocalCommentRef(uri)).toEqual({ identifier: "alice", commentId: id });
  });

  it("rejects foreign paths and garbage", () => {
    expect(parseLocalCommentRef(`${ORIGIN}/posts/abc`)).toBeNull();
    expect(parseLocalCommentRef(`${ORIGIN}/users/alice`)).toBeNull();
    expect(parseLocalCommentRef("https://mastodon.social/users/bob/statuses/123")).toBeNull();
    expect(parseLocalCommentRef("not a url")).toBeNull();
  });
});

describe("postApUri", () => {
  it("uses the canonical id for a cached remote post", () => {
    expect(postApUri(ORIGIN, { id: "x", remote: true, apId: "https://remote.example/posts/1" })).toBe(
      "https://remote.example/posts/1",
    );
  });

  it("derives the local address otherwise", () => {
    expect(postApUri(ORIGIN, { id: "abc", remote: false, apId: null })).toBe(`${ORIGIN}/posts/abc`);
  });
});

describe("parseLocalPostRef", () => {
  it("resolves our derived post address", () => {
    expect(parseLocalPostRef(`${ORIGIN}/posts/52683dce-2d3a-4b1c-9e5f-123456789abc`)).toBe(
      "52683dce-2d3a-4b1c-9e5f-123456789abc",
    );
  });

  it("rejects comment paths and garbage", () => {
    expect(parseLocalPostRef(`${ORIGIN}/users/alice/comments/x`)).toBeNull();
    expect(parseLocalPostRef("not a url")).toBeNull();
  });
});

describe("isCommentFederable", () => {
  const published = { status: "published" as const };
  it("federates public posts only", () => {
    expect(isCommentFederable({ ...published, remote: false }, false)).toBe(true);
    expect(isCommentFederable({ ...published, remote: true }, false)).toBe(true);
  });

  it("keeps drafts, scheduled posts, and private authors' posts local-only", () => {
    expect(isCommentFederable({ status: "draft", remote: false }, false)).toBe(false);
    expect(isCommentFederable({ status: "scheduled", remote: false }, false)).toBe(false);
    expect(isCommentFederable({ ...published, remote: false }, true)).toBe(false);
  });
});

describe("noteText", () => {
  it("flattens Note HTML to plain text", () => {
    const reply = new Note({ content: '<p><span><a href="https://x/@bob">@bob</a></span> hello <b>there</b></p>' });
    expect(noteText(reply)).toBe("@bob hello there");
  });

  it("is empty for contentless Notes and capped at local max length", () => {
    expect(noteText(new Note({}))).toBe("");
    expect(noteText(new Note({ content: "x".repeat(5000) })).length).toBe(2000);
  });
});

describe("textToNoteHtml", () => {
  it("escapes markup and round-trips through htmlToText", () => {
    const text = "hello <script>alert(1)</script>\nsecond line";
    const html = textToNoteHtml(text);
    expect(html).not.toContain("<script>");
    expect(htmlToText(html)).toBe("hello <script>alert(1)</script>\nsecond line");
  });
});
