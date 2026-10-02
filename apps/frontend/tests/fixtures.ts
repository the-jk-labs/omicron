// SPDX-License-Identifier: AGPL-3.0-or-later
// API payload factories, shaped like what the backend serializes.
import type { Post } from "$lib/types";

export function post(overrides: Partial<Post> = {}): Post {
  return {
    id: "9e962281-2222-3333-4444-555555555555",
    title: "Hello world",
    slug: "hello-world",
    contentHtml: "<p>Body</p>",
    remote: false,
    summary: null,
    bannerUrl: null,
    language: null,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    author: { id: "author-1", username: "ada", displayName: "Ada", avatarUrl: null },
    tags: [],
    likeCount: 0,
    liked: false,
    commentCount: 0,
    recommendCount: 0,
    recommended: false,
    recommendedBy: null,
    ...overrides,
  };
}
