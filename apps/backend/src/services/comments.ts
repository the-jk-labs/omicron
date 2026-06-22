import * as commentsRepo from "@/db/repositories/comments.ts";
import * as commentLikesRepo from "@/db/repositories/commentLikes.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import { type Cursor, DEFAULT_PAGE_SIZE, encodeCursor } from "@/lib/pagination.ts";
import { badRequest, forbidden, notFound } from "@/lib/http.ts";
import type { CommentWithAuthor } from "@/db/repositories/comments.ts";

// Business logic for comments. Content is plain text (max 2 000 chars); the
// client renders it escaped, never as HTML. Comments are single-level threaded:
// a reply's `parentId` always points at a top-level comment.

const MAX_LENGTH = 2000;

const NO_LIKES: commentLikesRepo.LikeStats = { count: 0, liked: false };

export type EnrichedComment = CommentWithAuthor & {
  likeStats: commentLikesRepo.LikeStats;
  replies: (CommentWithAuthor & { likeStats: commentLikesRepo.LikeStats })[];
};

export async function create(
  authorId: string,
  postId: string,
  content: string,
  parentId?: string | null,
) {
  const text = content?.trim();
  if (!text) throw badRequest("Comment cannot be empty.");
  if (text.length > MAX_LENGTH) throw badRequest(`Comment must be ${MAX_LENGTH} characters or fewer.`);
  if (!(await postsRepo.findById(postId))) throw notFound("Post not found.");

  // Resolve the parent: replies attach to a top-level comment, so replying to a
  // reply re-targets its parent (keeps the thread one level deep).
  let resolvedParentId: string | null = null;
  if (parentId) {
    const parent = await commentsRepo.findById(parentId);
    if (!parent || parent.postId !== postId) throw notFound("Parent comment not found.");
    resolvedParentId = parent.parentId ?? parent.id;
  }

  return commentsRepo.create({ postId, authorId, content: text, parentId: resolvedParentId });
}

// Edits a comment's text. Only the author may edit (admins can delete but not
// rewrite others' words). Returns the updated row.
export async function edit(userId: string, commentId: string, content: string) {
  const text = content?.trim();
  if (!text) throw badRequest("Comment cannot be empty.");
  if (text.length > MAX_LENGTH) throw badRequest(`Comment must be ${MAX_LENGTH} characters or fewer.`);

  const comment = await commentsRepo.findById(commentId);
  if (!comment) throw notFound("Comment not found.");
  if (comment.authorId !== userId) throw forbidden("You can only edit your own comments.");

  return commentsRepo.update(commentId, text);
}

// Deletes a comment (and its replies, via cascade). Only the comment's author
// or an admin may delete it.
export async function remove(userId: string, isAdmin: boolean, commentId: string) {
  const comment = await commentsRepo.findById(commentId);
  if (!comment) throw notFound("Comment not found.");
  if (comment.authorId !== userId && !isAdmin) {
    throw forbidden("You can only delete your own comments.");
  }
  await commentsRepo.remove(commentId);
}

export async function list(
  postId: string,
  cursor: Cursor | null,
  viewerId: string | null,
): Promise<{ items: EnrichedComment[]; nextCursor: string | null }> {
  const rows = await commentsRepo.listByPost(postId, cursor, DEFAULT_PAGE_SIZE);
  const hasMore = rows.length > DEFAULT_PAGE_SIZE;
  const tops = hasMore ? rows.slice(0, DEFAULT_PAGE_SIZE) : rows;
  const last = tops.at(-1);

  const replies = await commentsRepo.listReplies(tops.map((r) => r.comment.id));

  // One batched like-stats query covering every comment + reply on this page.
  const allIds = [...tops, ...replies].map((r) => r.comment.id);
  const stats = await commentLikesRepo.statsFor(allIds, viewerId);
  const statsOf = (id: string) => stats.get(id) ?? NO_LIKES;

  const repliesByParent = new Map<string, EnrichedComment["replies"]>();
  for (const r of replies) {
    const bucket = repliesByParent.get(r.comment.parentId!) ?? [];
    bucket.push({ ...r, likeStats: statsOf(r.comment.id) });
    repliesByParent.set(r.comment.parentId!, bucket);
  }

  const items = tops.map((r) => ({
    ...r,
    likeStats: statsOf(r.comment.id),
    replies: repliesByParent.get(r.comment.id) ?? [],
  }));

  return {
    items,
    nextCursor: hasMore && last
      ? encodeCursor({ createdAt: last.comment.createdAt.toISOString(), id: last.comment.id })
      : null,
  };
}
