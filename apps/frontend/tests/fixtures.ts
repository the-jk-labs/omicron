// SPDX-License-Identifier: AGPL-3.0-or-later
// API payload factories, shaped like what the backend serializes.
import type { Post } from "#lib/types.js";

export function post(overrides: Partial<Post> = {}): Post {
  return {
    id: "9e962281-2222-3333-4444-555555555555",
    title: "Hello world",
    slug: "hello-world",
    contentHtml: "<p>Body</p>",
    contentJson: null,
    remote: false,
    aiAssisted: false,
    status: "published",
    publishAt: null,
    summary: null,
    coverUrl: null,
    bannerUrl: null,
    coverCredit: null,
    language: null,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    author: { id: "author-1", username: "ada", displayName: "Ada", avatarUrl: null, remote: false },
    tags: [],
    likeCount: 0,
    liked: false,
    commentCount: 0,
    recommendCount: 0,
    recommended: false,
    saved: false,
    recommendedBy: null,
    ...overrides,
  };
}
