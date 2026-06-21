import type { Post, User } from "@/db/schema.ts";
import type { PostWithAuthor } from "@/db/repositories/posts.ts";

// Minimal API payloads — never leak password hashes, keys, or emails publicly.

export function publicUser(u: User) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    isAdmin: u.isAdmin,
    createdAt: u.createdAt,
  };
}

export function postWithAuthor(row: PostWithAuthor) {
  return {
    id: row.post.id,
    title: row.post.title,
    contentHtml: row.post.contentHtml,
    contentJson: row.post.contentJson,
    remote: row.post.remote,
    createdAt: row.post.createdAt,
    author: row.author,
  };
}

export function barePost(p: Post) {
  return {
    id: p.id,
    title: p.title,
    contentHtml: p.contentHtml,
    createdAt: p.createdAt,
  };
}
