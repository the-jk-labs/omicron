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
  tags: Tag[];
};

export type PostAuthor = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  // True when the author is a cached remote actor (username is a user@host handle).
  remote?: boolean;
};

// A tag attached to a post. `slug` is the normalized key used in URLs; `name`
// is the display form. `postCount` is present in discovery/search payloads.
export type Tag = { slug: string; name: string };
export type TagWithCount = Tag & { postCount: number };

export type Post = {
  id: string;
  title: string | null;
  contentHtml: string;
  contentJson?: unknown;
  remote: boolean;
  status?: "draft" | "published";
  createdAt: string;
  author: PostAuthor;
  tags: Tag[];
  likeCount: number;
  liked: boolean;
  commentCount: number;
};

// A tag's detail payload, powering the tag page header.
export type TagDetail = {
  tag: Tag;
  postCount: number;
  followerCount: number;
  isFollowing: boolean;
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
  isMuted: boolean;
  isBlocked: boolean;
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
    tags: Tag[];
  };
  counts: { followers: number; following: number };
  isFollowing: boolean;
  isMuted: boolean;
  isBlocked: boolean;
};

// A followed / muted / blocked account in the connections lists. `username` is
// a plain username for local accounts and a `user@host` handle for remote ones,
// so `/@${username}` links resolve to the right profile either way.
export type RelationActor = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  remote: boolean;
};

// Site-search payload: matching stories, people and tags. People reuse the
// `RelationActor` shape so `/@${username}` links resolve local or remote.
export type SearchResults = {
  posts: Post[];
  people: RelationActor[];
  tags: TagWithCount[];
};