import type { Comment, Post, User } from "@/db/schema.ts";
import type { PostWithAuthor } from "@/db/repositories/posts.ts";
import type { CommentWithAuthor } from "@/db/repositories/comments.ts";

// Minimal API payloads — never leak password hashes, keys, or emails publicly.

export type Engagement = { likeCount: number; liked: boolean; commentCount: number };

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

export function postWithAuthor(row: PostWithAuthor, engagement?: Engagement) {
  return {
    id: row.post.id,
    title: row.post.title,
    contentHtml: row.post.contentHtml,
    contentJson: row.post.contentJson,
    remote: row.post.remote,
    createdAt: row.post.createdAt,
    author: row.author,
    likeCount: engagement?.likeCount ?? 0,
    liked: engagement?.liked ?? false,
    commentCount: engagement?.commentCount ?? 0,
  };
}

export function commentView(row: CommentWithAuthor) {
  return {
    id: row.comment.id,
    content: row.comment.content,
    createdAt: row.comment.createdAt,
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
