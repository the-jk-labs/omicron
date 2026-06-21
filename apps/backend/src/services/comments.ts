import * as commentsRepo from "@/db/repositories/comments.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import { type Cursor, DEFAULT_PAGE_SIZE, encodeCursor } from "@/lib/pagination.ts";
import { badRequest, notFound } from "@/lib/http.ts";

// Business logic for comments. Content is plain text (max 2 000 chars); the
// client renders it escaped, never as HTML.

const MAX_LENGTH = 2000;

export async function create(authorId: string, postId: string, content: string) {
  const text = content?.trim();
  if (!text) throw badRequest("Comment cannot be empty.");
  if (text.length > MAX_LENGTH) throw badRequest(`Comment must be ${MAX_LENGTH} characters or fewer.`);
  if (!(await postsRepo.findById(postId))) throw notFound("Post not found.");
  return commentsRepo.create({ postId, authorId, content: text });
}

export async function list(postId: string, cursor: Cursor | null) {
  const rows = await commentsRepo.listByPost(postId, cursor, DEFAULT_PAGE_SIZE);
  const hasMore = rows.length > DEFAULT_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, DEFAULT_PAGE_SIZE) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last
      ? encodeCursor({ createdAt: last.comment.createdAt.toISOString(), id: last.comment.id })
      : null,
  };
}
