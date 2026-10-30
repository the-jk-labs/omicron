import type { Comment, Me, Post, User } from "@omicron/contract";

export function makePost(patch: Partial<Post> = {}): Post {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    title: "Hello",
    slug: "hello",
    contentHtml: "<p>Body</p>",
    contentJson: null,
    remote: false,
    aiAssisted: false,
    status: "published",
    publishAt: null,
    language: null,
    summary: null,
    coverUrl: null,
    bannerUrl: null,
    coverCredit: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    author: { id: "author-1", username: "ada", displayName: "Ada", avatarUrl: null, remote: false },
    tags: [],
    likeCount: 2,
    liked: false,
    commentCount: 0,
    recommendCount: 0,
    recommended: false,
    saved: false,
    recommendedBy: null,
    ...patch,
  };
}

export function makeComment(patch: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    content: "Nice",
    createdAt: "2026-10-01T10:00:00.000Z",
    author: { id: "author-2", username: "bob", displayName: "Bob", avatarUrl: null, remote: false },
    parentId: null,
    likeCount: 0,
    liked: false,
    replies: [],
    ...patch,
  };
}

export function makeUser(patch: Partial<User> = {}): User {
  return {
    id: "user-1",
    username: "ada",
    displayName: "Ada",
    bio: "",
    publicEmail: "",
    customSection: "",
    customSectionHtml: "",
    avatarUrl: null,
    isAdmin: false,
    isModerator: false,
    isPrivate: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tags: [],
    links: [],
    ...patch,
  };
}

export function makeMe(patch: Partial<Me> = {}): Me {
  return { ...makeUser(), email: "ada@example.test", emailVerified: true, showAiAssistedPosts: true, ...patch };
}
