// SPDX-License-Identifier: AGPL-3.0-or-later
// Row factories for unit tests that stub the repository layer. Each returns a
// complete, valid row so a test only spells out the fields it is about.
import type { CommentWithAuthor } from "@/db/repositories/comments.ts";
import type { PostWithAuthor } from "@/db/repositories/posts.ts";
import type { Comment, Post, RemoteActor, User } from "@/db/schema.ts";

const T0 = new Date("2026-01-01T00:00:00.000Z");

export function userRow(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    username: "ada",
    displayUsername: "ada",
    email: "ada@example.test",
    passwordHash: null,
    displayName: "Ada",
    bio: "",
    publicEmail: "",
    customSection: "",
    customSectionHtml: "",
    avatarUrl: null,
    isAdmin: false,
    isModerator: false,
    isPrivate: false,
    emailVerified: true,
    suspendedAt: null,
    deletedAt: null,
    deletedBy: null,
    actorKeyPair: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function remoteActorRow(overrides: Partial<RemoteActor> = {}): RemoteActor {
  return {
    id: "actor-1",
    apId: "https://remote.example/users/bob",
    handle: "bob@remote.example",
    username: "bob",
    host: "remote.example",
    displayName: "Bob",
    bio: "",
    avatarUrl: null,
    inboxUrl: "https://remote.example/users/bob/inbox",
    sharedInboxUrl: "https://remote.example/inbox",
    outboxUrl: "https://remote.example/users/bob/outbox",
    followersCount: 0,
    followingCount: 0,
    fetchedAt: T0,
    ...overrides,
  };
}

export type PostRow = Omit<Post, "searchVector">;

export function postRow(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: "post-1",
    authorId: "user-1",
    remoteActorId: null,
    title: "Hello",
    slug: "hello",
    contentHtml: "<p>Hello world</p>",
    contentJson: null,
    apId: null,
    apType: "Article",
    remote: false,
    status: "published",
    publishAt: null,
    language: null,
    summary: null,
    coverUrl: null,
    coverCredit: null,
    externalId: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

// A local post as the repositories return it: the post plus its joined author.
export function postWithAuthor(overrides: Partial<PostRow> = {}, author: Partial<User> = {}): PostWithAuthor {
  const u = userRow(author);
  const post = postRow({ authorId: u.id, ...overrides });
  return {
    post,
    localAuthor: { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl },
    remoteActor: null,
  };
}

export function remotePostWithAuthor(overrides: Partial<PostRow> = {}, actor: Partial<RemoteActor> = {}) {
  const a = remoteActorRow(actor);
  const post = postRow({
    authorId: null,
    remoteActorId: a.id,
    remote: true,
    slug: null,
    apId: `${a.apId}/posts/1`,
    ...overrides,
  });
  return {
    post,
    localAuthor: null,
    remoteActor: { id: a.id, handle: a.handle, displayName: a.displayName, avatarUrl: a.avatarUrl },
  } as PostWithAuthor;
}

export function commentRow(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "comment-1",
    postId: "post-1",
    authorId: "user-1",
    remoteActorId: null,
    parentId: null,
    content: "Nice post",
    apId: null,
    createdAt: T0,
    ...overrides,
  };
}

export function commentWithAuthor(overrides: Partial<Comment> = {}, author: Partial<User> = {}): CommentWithAuthor {
  const u = userRow(author);
  return {
    comment: commentRow({ authorId: u.id, ...overrides }),
    author: { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl },
    remoteActor: null,
  };
}
