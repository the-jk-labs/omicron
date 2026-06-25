// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared API types (mirror the backend serializers).

export type User = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: string;
};

export type PostAuthor = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  // True when the author is a cached remote actor (username is a user@host handle).
  remote?: boolean;
};

export type Post = {
  id: string;
  title: string | null;
  contentHtml: string;
  contentJson?: unknown;
  remote: boolean;
  createdAt: string;
  author: PostAuthor;
  likeCount: number;
  liked: boolean;
  commentCount: number;
};

export type Comment = {
  id: string;
  content: string;
  createdAt: string;
  author: PostAuthor;
  parentId: string | null;
  likeCount: number;
  liked: boolean;
  replies: Comment[];
};

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};

export type Profile = {
  user: User;
  counts: { followers: number; following: number };
  isFollowing: boolean;
};

// A remote actor's profile, shaped like the local profile response so the
// profile page can render either with one layout.
export type RemoteProfile = {
  user: {
    id: string;
    username: string; // user@host handle
    displayName: string;
    bio: string;
    avatarUrl: string | null;
    host: string;
    apId: string;
    remote: true;
  };
  counts: { followers: number; following: number };
  isFollowing: boolean;
};