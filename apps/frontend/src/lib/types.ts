// Shared API types (mirror the backend serializers).

export type User = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  isAdmin: boolean;
  createdAt: string;
};

export type PostAuthor = {
  id: string;
  username: string;
  displayName: string;
};

export type Post = {
  id: string;
  title: string | null;
  contentHtml: string;
  contentJson?: unknown;
  remote: boolean;
  createdAt: string;
  author: PostAuthor;
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
