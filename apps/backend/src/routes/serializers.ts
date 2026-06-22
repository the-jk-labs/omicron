import type { Post, User } from "@/db/schema.ts";
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

type LikeStats = { count: number; liked: boolean };

// Accepts a plain author row plus optional like stats and nested replies (only
// top-level comments carry replies). Replies are themselves rendered via
// commentView so the shape is uniform at every level.
export function commentView(
  row: CommentWithAuthor & {
    likeStats?: LikeStats;
    replies?: (CommentWithAuthor & { likeStats?: LikeStats })[];
  },
): {
  id: string;
  content: string;
  createdAt: Date;
  author: CommentWithAuthor["author"];
  parentId: string | null;
  likeCount: number;
  liked: boolean;
  replies: ReturnType<typeof commentView>[];
} {
  return {
    id: row.comment.id,
    content: row.comment.content,
    createdAt: row.comment.createdAt,
    author: row.author,
    parentId: row.comment.parentId,
    likeCount: row.likeStats?.count ?? 0,
    liked: row.likeStats?.liked ?? false,
    replies: (row.replies ?? []).map((r) => commentView(r)),
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
